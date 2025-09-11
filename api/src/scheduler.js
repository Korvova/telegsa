// api/src/scheduler.js
import schedule from 'node-schedule';

/* ===== helpers: фильтрация получателей и распознавание фатальных ошибок TG ===== */
const DIGITS_RE = /^\d+$/;

async function canDM(prisma, chatId) {
  const id = String(chatId || '');
  if (!DIGITS_RE.test(id)) return false; // только numeric id

  // не слать ботам
  try {
    const u = await prisma.user.findUnique({ where: { chatId: id } });
    if (u?.username && String(u.username).toLowerCase().endsWith('bot')) return false;
  } catch {}

  // уважать writeAccessGranted
  try {
    const s = await prisma.notificationSetting.findUnique({
      where: { telegramId: id },
      select: { writeAccessGranted: true },
    });
    if (!s || !s.writeAccessGranted) return false;
  } catch {}

  return true;
}

function isPermanentTgError(e) {
  const desc = (e?.description || e || '').toString();
  return /chat not found/i.test(desc)
      || /bots can'?t send messages to bots/i.test(desc)
      || /bot was blocked by the user/i.test(desc);
}

/* ===== внутреннее хранилище активных job ===== */
const jobs = new Map();
const log = (...args) => console.log('[reminders]', ...args);

const keyEvent = (id) => `ER:${id}`;
const keyTask  = (id) => `TR:${id}`;

/* ===== отправка одного напоминания ===== */
async function fireReminder({ prisma, tg }, r) {
  try {
    // свежая запись (могли уже отправить/удалить)
    const fresh = await prisma.eventReminder.findUnique({ where: { id: r.id } });
    if (!fresh || fresh.sentAt) {
      const k = keyEvent(r.id);
      jobs.get(k)?.cancel();
      jobs.delete(k);
      return;
    }

    // 🔒 фильтрация адресата до отправки
    if (!(await canDM(prisma, fresh.chatId))) {
      // считаем обработанным, чтобы не ретраить
      await prisma.$transaction([
        prisma.eventReminder.update({
          where: { id: fresh.id },
          data: { sentAt: new Date() },
        }),
        prisma.eventReminder.delete({ where: { id: fresh.id } }),
      ]).catch(async () => {
        // если delete не прошёл — хотя бы sentAt
        await prisma.eventReminder.update({
          where: { id: fresh.id },
          data: { sentAt: new Date() },
        }).catch(() => {});
      });
      log('skip (cannot DM)', fresh.id, 'to', fresh.chatId);
      return;
    }

    const text = `🔔 напоминание через ${fresh.offsetMinutes} минут.`;
    const payload = {
      chat_id: fresh.chatId,
      text,
      reply_to_message_id: fresh.replyToMessageId ?? undefined,
      allow_sending_without_reply: true,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: 'Открыть событие', url: `https://t.me/${process.env.BOT_USERNAME}?startapp=task_${fresh.eventId}` },
          { text: 'Отложить на 10 мин', callback_data: `evt_snooze:${fresh.eventId}:10` }
        ]]
      },
    };

    const sent = await tg('sendMessage', payload);

    if (sent?.ok) {
      // пометить как отправленное и удалить запись (как у тебя было)
      try {
        await prisma.$transaction([
          prisma.eventReminder.update({
            where: { id: fresh.id },
            data: { sentAt: new Date() },
          }),
          prisma.eventReminder.delete({ where: { id: fresh.id } }),
        ]);
      } catch (e) {
        log('delete after sent failed:', e?.message || e);
      }
      log('sent & deleted', fresh.id, 'to', fresh.chatId);
    } else {
      // TG вернул ошибку в теле
      const desc = sent?.description || sent;
      log('send failed:', desc);
      if (isPermanentTgError(sent)) {
        // не ретраим фатальные → помечаем как обработанное
        await prisma.eventReminder.update({
          where: { id: fresh.id },
          data: { sentAt: new Date() },
        }).catch(() => {});
        // по желанию: можно сразу delete, чтобы чисто
        await prisma.eventReminder.delete({ where: { id: fresh.id } }).catch(() => {});
      } else {
        await prisma.eventReminder.update({
          where: { id: fresh.id },
          data: { tries: { increment: 1 } },
        }).catch(() => {});
      }
    }
  } catch (e) {
    // любая иная ошибка — увеличим tries, дадим повтор
    try {
      await prisma.eventReminder.update({
        where: { id: r.id },
        data: { tries: { increment: 1 } },
      });
    } catch {}
    log('fire error:', e?.message || e);
  } finally {
    // job больше не нужен (мы шедулим одноразово)
    const job = jobs.get(keyEvent(r.id));
    if (job) job.cancel();
    jobs.delete(keyEvent(r.id));
  }
}

/* ===== планирование одной записи ===== */
function planOne({ prisma, tg }, r) {
  // рескейд: отменим, если уже было
  const existed = jobs.get(keyEvent(r.id));
  if (existed) existed.cancel();
  jobs.delete(keyEvent(r.id));

  const when = new Date(r.fireAt);
  const now = new Date();
  if (when <= now) {
    // просрочено — отправим немедленно
    fireReminder({ prisma, tg }, r);
    return;
  }

  const job = schedule.scheduleJob(when, () => fireReminder({ prisma, tg }, r));
  jobs.set(keyEvent(r.id), job);
  log('scheduled ER', r.id, 'at', when.toISOString(), 'for', r.chatId);
}

/* ===== инициализация при старте ===== */
export async function initReminderScheduler({ prisma, tg }) {
  const now = new Date();

  // планируем будущие
  const future = await prisma.eventReminder.findMany({
    where: { sentAt: null, fireAt: { gt: now } },
    orderBy: { fireAt: 'asc' },
  });
  future.forEach(r => planOne({ prisma, tg }, r));

  // просроченные — отправим сразу
  const overdue = await prisma.eventReminder.findMany({
    where: { sentAt: null, fireAt: { lte: now } },
    orderBy: { fireAt: 'asc' },
  });
  overdue.forEach(r => fireReminder({ prisma, tg }, r));

  // ===== TaskReminder (tasks) =====
  const tFuture = await prisma.taskReminder.findMany({
    where: { sentAt: null, fireAt: { gt: now } },
    orderBy: { fireAt: 'asc' },
  });
  tFuture.forEach(r => planTaskReminder({ prisma, tg }, r));

  const tOverdue = await prisma.taskReminder.findMany({
    where: { sentAt: null, fireAt: { lte: now } },
    orderBy: { fireAt: 'asc' },
  });
  tOverdue.forEach(r => fireTaskReminder({ prisma, tg }, r));

  log('init done. planned:', future.length, 'overdue fired:', overdue.length, '| task planned:', tFuture.length, 'task overdue:', tOverdue.length);
}

/* ===== перепланирование всех напоминаний события ===== */
export async function scheduleRemindersForEvent(prisma, tg, eventId) {
  const rows = await prisma.eventReminder.findMany({
    where: { eventId: String(eventId), sentAt: null },
  });
  rows.forEach(r => planOne({ prisma, tg }, r));
  return rows.length;
}

/* ===== TaskReminder support ===== */

function miniAppLink(taskId) {
  const bot = process.env.BOT_USERNAME || process.env.TG_BOT_USERNAME || 'telegsar_bot';
  return `https://t.me/${bot}?startapp=task_${encodeURIComponent(taskId)}`;
}

function clip(s = '', n = 150) { return s.length > n ? s.slice(0, n) + '…' : s; }

async function resolveRecipientsForTaskReminder(prisma, task, reminder) {
  const t = String(reminder.target);
  if (t === 'ME') return [String(reminder.createdBy)].filter(Boolean);
  if (t === 'RESPONSIBLE') return task.assigneeChatId ? [String(task.assigneeChatId)] : [];
  // ALL: watchers + assignee + author (постановщик)
  const watchers = await prisma.taskWatcher.findMany({ where: { taskId: task.id }, select: { chatId: true } });
  const ids = new Set();
  watchers.forEach(w => { if (w?.chatId) ids.add(String(w.chatId)); });
  if (task.assigneeChatId) ids.add(String(task.assigneeChatId));
  if (task.chatId) ids.add(String(task.chatId));
  return Array.from(ids);
}

async function fireTaskReminder({ prisma, tg }, r) {
  try {
    const fresh = await prisma.taskReminder.findUnique({ where: { id: r.id } });
    if (!fresh || fresh.sentAt) {
      const k = keyTask(r.id);
      jobs.get(k)?.cancel();
      jobs.delete(k);
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: String(fresh.taskId) } });
    if (!task) {
      await prisma.taskReminder.update({ where: { id: fresh.id }, data: { sentAt: new Date() } }).catch(() => {});
      const k = keyTask(r.id); jobs.get(k)?.cancel(); jobs.delete(k);
      return;
    }

    const recipientsRaw = await resolveRecipientsForTaskReminder(prisma, task, fresh);
    const recipients = [];
    for (const cid of recipientsRaw) {
      if (await canDM(prisma, cid)) recipients.push(String(cid));
    }

    const text = `⏰ Напоминание\n${clip(task.text || '', 180)}`;
    const markup = { inline_keyboard: [[{ text: 'Открыть задачу', url: miniAppLink(task.id) }]] };

    // отправим каждому (reply — только если совпадает sourceChatId)
    await Promise.all(recipients.map(async (chatId) => {
      const canReplyHere = String(chatId) === String(task.sourceChatId) && Number.isInteger(task.sourceMessageId);
      const payload = {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: markup,
        ...(canReplyHere ? { reply_to_message_id: Number(task.sourceMessageId) } : {}),
      };
      const r = await tg('sendMessage', payload);
      if (!r?.ok && isPermanentTgError(r)) {
        // ignore
      }
    }));

    // отметить как отправленное
    await prisma.taskReminder.update({ where: { id: fresh.id }, data: { sentAt: new Date() } }).catch(() => {});
    const k = keyTask(r.id); const job = jobs.get(k); if (job) job.cancel(); jobs.delete(k);
    log('task reminder sent', fresh.id, 'to', recipients.length, 'recipients');
  } catch (e) {
    try {
      await prisma.taskReminder.update({ where: { id: r.id }, data: { tries: { increment: 1 } } });
    } catch {}
    log('task fire error:', e?.message || e);
  }
}

function planTaskReminder({ prisma, tg }, r) {
  const k = keyTask(r.id);
  const existed = jobs.get(k);
  if (existed) existed.cancel();
  jobs.delete(k);

  const when = new Date(r.fireAt);
  const now = new Date();
  if (when <= now) {
    fireTaskReminder({ prisma, tg }, r);
    return;
  }
  const job = schedule.scheduleJob(when, () => fireTaskReminder({ prisma, tg }, r));
  jobs.set(k, job);
  log('scheduled TR', r.id, 'at', when.toISOString());
}

export async function scheduleTaskReminder(prisma, tg, reminderId) {
  const row = await prisma.taskReminder.findUnique({ where: { id: String(reminderId) } });
  if (!row || row.sentAt) return false;
  planTaskReminder({ prisma, tg }, row);
  return true;
}

export function cancelTaskReminder(reminderId) {
  const k = keyTask(reminderId);
  const job = jobs.get(k);
  if (job) job.cancel();
  jobs.delete(k);
}
