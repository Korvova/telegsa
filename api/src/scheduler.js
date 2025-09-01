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

/* ===== отправка одного напоминания ===== */
async function fireReminder({ prisma, tg }, r) {
  try {
    // свежая запись (могли уже отправить/удалить)
    const fresh = await prisma.eventReminder.findUnique({ where: { id: r.id } });
    if (!fresh || fresh.sentAt) {
      jobs.get(r.id)?.cancel();
      jobs.delete(r.id);
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
    const job = jobs.get(r.id);
    if (job) job.cancel();
    jobs.delete(r.id);
  }
}

/* ===== планирование одной записи ===== */
function planOne({ prisma, tg }, r) {
  // рескейд: отменим, если уже было
  const existed = jobs.get(r.id);
  if (existed) existed.cancel();
  jobs.delete(r.id);

  const when = new Date(r.fireAt);
  const now = new Date();
  if (when <= now) {
    // просрочено — отправим немедленно
    fireReminder({ prisma, tg }, r);
    return;
  }

  const job = schedule.scheduleJob(when, () => fireReminder({ prisma, tg }, r));
  jobs.set(r.id, job);
  log('scheduled', r.id, 'at', when.toISOString(), 'for', r.chatId);
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

  log('init done. planned:', future.length, 'overdue fired:', overdue.length);
}

/* ===== перепланирование всех напоминаний события ===== */
export async function scheduleRemindersForEvent(prisma, tg, eventId) {
  const rows = await prisma.eventReminder.findMany({
    where: { eventId: String(eventId), sentAt: null },
  });
  rows.forEach(r => planOne({ prisma, tg }, r));
  return rows.length;
}
