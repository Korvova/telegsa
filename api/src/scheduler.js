// api/src/scheduler.js
import schedule from 'node-schedule';

// ===== SSE broadcaster (optional) =====
let sseBroadcast = null;
export function setSSEBroadcaster(fn) {
  sseBroadcast = typeof fn === 'function' ? fn : null;
}

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
const keyPre   = (id) => `PR:${id}`; // PreTask job key

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

/* ===== PreTask support ===== */

function parsePhaseFromColumnName(name = '') {
  const sep = '::';
  const i = String(name).indexOf(sep);
  return i > 0 ? String(name).slice(i + sep.length) : String(name);
}

async function getTaskPhase(prisma, taskId) {
  try {
    const t = await prisma.task.findUnique({ where: { id: String(taskId) } });
    if (!t) return 'Cancel'; // удалённую трактуем как отменённую
    const col = await prisma.column.findUnique({ where: { id: t.columnId } });
    if (!col) return 'Cancel';
    return parsePhaseFromColumnName(col.name || '');
  } catch {
    return 'Cancel';
  }
}

async function depStateForPreTask(prisma, dep) {
  // dep is a PreTask row
  if (!dep) return { done: false, canceled: true };
  if (String(dep.status || '') === 'CANCELED') return { done: false, canceled: true };
  if (dep.targetTaskId) {
    const phase = await getTaskPhase(prisma, dep.targetTaskId);
    return { done: phase === 'Done', canceled: phase === 'Cancel' };
  }
  return { done: false, canceled: false };
}

async function depStateForTask(prisma, taskId) {
  const phase = await getTaskPhase(prisma, taskId);
  return { done: phase === 'Done', canceled: phase === 'Cancel' };
}

async function computeDepsSummary(prisma, preTaskId) {
  const row = await prisma.preTask.findUnique({
    where: { id: String(preTaskId) },
    include: { links: true },
  });
  if (!row) return null;

  const states = [];
  for (const l of row.links) {
    if (l.taskId) states.push(await depStateForTask(prisma, l.taskId));
    else if (l.depPreTaskId) states.push(await depStateForPreTask(prisma, await prisma.preTask.findUnique({ where: { id: String(l.depPreTaskId) } })));
  }
  if (states.length === 0) return { row, allDone: false, anyCanceled: false, allCanceled: false };

  const allDone = states.every(s => s.done);
  const anyCanceled = states.some(s => s.canceled);
  const allCanceled = states.every(s => s.canceled);
  return { row, allDone, anyCanceled, allCanceled };
}

async function resolveBoardForPreTask(prisma, pre) {
  // returns { boardChatId, group, groupId }
  const groupId = pre.groupId ? String(pre.groupId) : null;
  if (!groupId) return { boardChatId: String(pre.creatorChatId), group: null, groupId: null };
  const g = await prisma.group.findUnique({ where: { id: groupId } });
  if (!g) return { boardChatId: String(pre.creatorChatId), group: null, groupId: null };
  return { boardChatId: String(g.ownerChatId), group: g, groupId };
}

async function isMemberOfGroup(prisma, groupId, chatId) {
  if (!groupId || !chatId) return false;
  try {
    const g = await prisma.group.findUnique({ where: { id: String(groupId) } });
    if (!g) return false;
    if (String(g.ownerChatId) === String(chatId)) return true;
    const m = await prisma.groupMember.findFirst({ where: { groupId: String(groupId), chatId: String(chatId) } });
    return !!m;
  } catch { return false; }
}

function preMiniAppLink(taskId) {
  const bot = process.env.BOT_USERNAME || process.env.TG_BOT_USERNAME || 'telegsar_bot';
  return `https://t.me/${bot}?startapp=task_${encodeURIComponent(taskId)}`;
}

async function notifyAssigneeFallback({ prisma, tg }, pre, task) {
  try {
    const txt = `Запустилась задача\n${task.text}\n\nОтсвенный вы, не смогли подключить планируемого.`;
    const markup = { inline_keyboard: [[{ text: 'Открыть задачу', url: preMiniAppLink(task.id) }]] };
    const to = String(pre.creatorChatId || '');
    if (!to) return;
    await tg('sendMessage', { chat_id: to, text: txt, disable_web_page_preview: true, reply_markup: markup });
  } catch {}
}

async function createRealTaskForPre({ prisma, tg }, pre, { canceledImmediate = false } = {}) {
  // resolve board
  const { boardChatId, group, groupId } = await resolveBoardForPreTask(prisma, pre);

  // ensure columns exist and pick target column
  const sep = '::';
  const nameWithGroup = (gid, plain) => gid ? `${gid}${sep}${plain}` : plain;
  async function ensureDefaultColumns(chatId, gid = null) {
    const whereDefault = gid ? { chatId, name: { startsWith: `${gid}${sep}` } } : { chatId, name: { not: { contains: sep } } };
    const existing = await prisma.column.findMany({ where: whereDefault, orderBy: { order: 'asc' } });
    if (existing.length) return existing;
    const base = [
      nameWithGroup(gid, 'Inbox'),
      nameWithGroup(gid, 'Doing'),
      nameWithGroup(gid, 'Done'),
      nameWithGroup(gid, 'Cancel'),
      nameWithGroup(gid, 'Approval'),
      nameWithGroup(gid, 'Wait'),
    ];
    const created = await prisma.$transaction(
      base.map((nm, i) => prisma.column.create({ data: { chatId: boardChatId, name: nm, order: i } }))
    );
    return created;
  }

  await ensureDefaultColumns(boardChatId, groupId);
  const targetPhase = canceledImmediate ? 'Cancel' : 'Inbox';
  const targetName = nameWithGroup(groupId, targetPhase);
  const targetColumn = await prisma.column.findFirst({ where: { chatId: boardChatId, name: targetName } });
  if (!targetColumn) throw new Error('target_column_not_found');

  const last = await prisma.task.findFirst({ where: { columnId: targetColumn.id }, orderBy: { order: 'desc' }, select: { order: true } });
  const nextOrder = (last?.order ?? -1) + 1;

  // planned assignee availability
  let assignee = null;
  if (pre.plannedAssigneeChatId) {
    const ok = groupId ? await isMemberOfGroup(prisma, groupId, pre.plannedAssigneeChatId) : true;
    if (ok) assignee = String(pre.plannedAssigneeChatId);
  }

  const created = await prisma.task.create({
    data: {
      chatId: boardChatId,
      text: pre.text || 'Без названия',
      order: nextOrder,
      columnId: targetColumn.id,
      createdByChatId: String(pre.creatorChatId || boardChatId),
      assigneeChatId: assignee,
      fromProcess: false,
    },
  });

  // fallback if assignee not set but planned was specified
  if (!assignee && pre.plannedAssigneeChatId) {
    await notifyAssigneeFallback({ prisma, tg }, pre, created);
  }

  // Общее уведомление о запуске задачи (в TG-группе или DM автору)
  try {
    const { group } = await resolveBoardForPreTask(prisma, pre);
    const openUrl = preMiniAppLink(created.id);
    const text = `🚀 Запустилась задача\n${created.text}`;
    const markup = { inline_keyboard: [[{ text: 'Открыть задачу', url: openUrl }]] };
    if (group && group.isTelegramGroup && group.tgChatId) {
      await tg('sendMessage', { chat_id: String(group.tgChatId), text, disable_web_page_preview: true, reply_markup: markup });
    } else if (await canDM(prisma, String(pre.creatorChatId))) {
      await tg('sendMessage', { chat_id: String(pre.creatorChatId), text, disable_web_page_preview: true, reply_markup: markup });
    }
  } catch {}

  return created;
}

async function markPreTaskFired(prisma, preId, taskId, { canceled = false } = {}) {
  const newStatus = canceled ? 'CANCELED' : 'FIRED';
  await prisma.preTask.update({ where: { id: String(preId) }, data: { status: newStatus, targetTaskId: String(taskId), fireAt: new Date() } });
}

async function attemptFirePreTask({ prisma, tg }, preId, { canceledImmediate = false } = {}) {
  const summary = await computeDepsSummary(prisma, preId);
  if (!summary) return false;
  const { row } = summary;
  if (String(row.status || '') === 'FIRED' || String(row.status || '') === 'CANCELED') return true; // already finalized

  // For DATE_PLUS / DELAY_AFTER we should ensure preconditions still hold as of now
  if (row.triggerMode === 'AFTER_ALL_CANCELED') {
    const { allCanceled } = summary;
    if (!allCanceled) return false;
  } else if (row.triggerMode === 'AFTER_ALL_DONE') {
    const { allDone } = summary;
    if (!allDone) return false;
  } else if (row.triggerMode === 'DATE_PLUS' || row.triggerMode === 'DELAY_AFTER') {
    const { allDone, anyCanceled } = summary;
    if (row.autoCancelOnAny && anyCanceled) {
      const created = await createRealTaskForPre({ prisma, tg }, row, { canceledImmediate: true });
      await markPreTaskFired(prisma, row.id, created.id, { canceled: true });
      return true;
    }
    const noDeps = !row?.links || row.links.length === 0;
    if (!noDeps && !allDone) return false;
  }

  const created = await createRealTaskForPre({ prisma, tg }, row, { canceledImmediate: canceledImmediate });
  await markPreTaskFired(prisma, row.id, created.id, { canceled: canceledImmediate });
  try { console.log('[PRETASK][FIRED]', { id: preId, taskId: created.id, canceledImmediate }); } catch {}
  try { if (sseBroadcast) sseBroadcast(String(row.creatorChatId||''), { type:'task_fired', preId: String(preId), taskId: String(created.id), groupId: row.groupId || null }); } catch {}
  return true;
}

function planPreTaskAt({ prisma, tg }, preId, when) {
  const k = keyPre(preId);
  const existed = jobs.get(k);
  if (existed) existed.cancel(); jobs.delete(k);

  const d = new Date(when);
  const now = new Date();
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return false;
  if (d <= now) { attemptFirePreTask({ prisma, tg }, preId).catch(()=>{}); return true; }
  const job = schedule.scheduleJob(d, () => attemptFirePreTask({ prisma, tg }, preId));
  jobs.set(k, job);
  try { console.log('[PRETASK][JOB]', { id: preId, at: d.toISOString() }); } catch {}
  return true;
}

export async function evaluatePreTask(prisma, tg, preId) {
  const s = await computeDepsSummary(prisma, preId);
  if (!s) return false;
  const { row, allDone, anyCanceled, allCanceled } = s;
  const noDeps = !row?.links || row.links.length === 0;
  try { console.log('[PRETASK][EVAL]', { id: preId, mode: row.triggerMode, startAt: row.startAt, noDeps, allDone, anyCanceled, allCanceled }); } catch {}
  const k = keyPre(preId);
  jobs.get(k)?.cancel(); jobs.delete(k); // очистим предыдущие

  if (row.triggerMode === 'AFTER_ALL_CANCELED') {
    if (allCanceled) return attemptFirePreTask({ prisma, tg }, preId);
    return false;
  }

  if (row.autoCancelOnAny && anyCanceled) {
    // создаём сразу, но со статусом отмена
    return attemptFirePreTask({ prisma, tg }, preId, { canceledImmediate: true });
  }

  if (row.triggerMode === 'AFTER_ALL_DONE') {
    if (allDone) return attemptFirePreTask({ prisma, tg }, preId);
    return false;
  }

  if (row.triggerMode === 'DATE_PLUS') {
    if (!row.startAt) return false; // неверная настройка
    // если зависимостей нет — не требуем allDone
    if (!noDeps && !allDone) return false; // ждем условий
    await prisma.preTask.update({ where: { id: row.id }, data: { fireAt: new Date(row.startAt) } });
    const ok = planPreTaskAt({ prisma, tg }, preId, row.startAt);
    try { console.log('[PRETASK][SCHEDULED]', { id: preId, at: new Date(row.startAt).toISOString(), ok }); } catch {}
    return ok;
  }

  if (row.triggerMode === 'DELAY_AFTER') {
    if (!allDone) return false;
    const minutes = Number(row.delayMinutes || 0);
    const when = new Date(Date.now() + Math.max(0, minutes) * 60_000);
    await prisma.preTask.update({ where: { id: row.id }, data: { fireAt: when } });
    return planPreTaskAt({ prisma, tg }, preId, when);
  }

  return false;
}

export async function reevaluatePreTasksByTaskId(prisma, tg, taskId) {
  const links = await prisma.preTaskLink.findMany({ where: { taskId: String(taskId) }, select: { preTaskId: true } });
  const set = new Set(links.map(l => String(l.preTaskId)));
  // также — те, кто зависят от предзадачи, у которой targetTaskId === taskId
  const deps = await prisma.preTask.findMany({ where: { targetTaskId: String(taskId) }, select: { id: true } });
  if (deps.length) {
    const chainLinks = await prisma.preTaskLink.findMany({ where: { depPreTaskId: { in: deps.map(d => d.id) } }, select: { preTaskId: true } });
    chainLinks.forEach(l => set.add(String(l.preTaskId)));
  }
  for (const id of set) await evaluatePreTask(prisma, tg, id).catch(()=>{});
}

export async function initPreTaskScheduler({ prisma, tg }) {
  const now = new Date();
  // планируем будущие fireAt для ARMED
  const future = await prisma.preTask.findMany({ where: { status: 'ARMED', fireAt: { gt: now } } });
  future.forEach(p => planPreTaskAt({ prisma, tg }, p.id, p.fireAt));
  // просроченные — попробуем запустить
  const overdue = await prisma.preTask.findMany({ where: { status: 'ARMED', fireAt: { lte: now } } });
  overdue.forEach(p => attemptFirePreTask({ prisma, tg }, p.id));
  log('init pre-tasks planned:', future.length, 'overdue:', overdue.length);
}
