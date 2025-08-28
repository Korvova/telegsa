// api/src/scheduler.js
import schedule from 'node-schedule';

/**
 * Внутреннее хранилище активных джоб:
 * key = reminder.id, value = schedule.Job
 */
const jobs = new Map();

/** Сервисный лог */
const log = (...args) => console.log('[reminders]', ...args);

/** Отправка сообщения и пост-обработка (delete или retry) */
async function fireReminder({ prisma, tg }, r) {
  try {
    // Проверим актуальность записи из БД (могли уже удалить/отправить)
    const fresh = await prisma.eventReminder.findUnique({ where: { id: r.id } });
    if (!fresh || fresh.sentAt) {
      jobs.get(r.id)?.cancel();
      jobs.delete(r.id);
      return;
    }

    const text = `🔔 напоминание через ${fresh.offsetMinutes} минут.`;

    const payload = {
      chat_id: fresh.chatId,
      text,
      // если базовое сообщение есть — отвечаем на него
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
      // пометили как отправленное и сразу удалили запись (по твоему требованию)
      try {
        await prisma.$transaction([
          prisma.eventReminder.update({
            where: { id: fresh.id },
            data: { sentAt: new Date() },
          }),
          prisma.eventReminder.delete({ where: { id: fresh.id } }),
        ]);
      } catch (e) {
        // если вдруг delete не прошёл — ничего страшного, sentAt уже стоит
        log('delete after sent failed:', e?.message || e);
      }
      log('sent & deleted', fresh.id, 'to', fresh.chatId);
    } else {
      // TG вернул ошибку — увеличим счётчик попыток
      await prisma.eventReminder.update({
        where: { id: fresh.id },
        data: { tries: { increment: 1 } },
      });
      log('send failed:', sent?.description || sent);
    }
  } catch (e) {
    // любая иная ошибка — просто увеличим tries
    try {
      await prisma.eventReminder.update({
        where: { id: r.id },
        data: { tries: { increment: 1 } },
      });
    } catch {}
    log('fire error:', e?.message || e);
  } finally {
    // в любом случае — джоб больше не нужен
    const job = jobs.get(r.id);
    if (job) job.cancel();
    jobs.delete(r.id);
  }
}

/** Спланировать ОДНУ запись (если время прошло — отправить сразу) */
function planOne({ prisma, tg }, r) {
  // если уже была джоба — отменим (рескейд)
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

/** Инициализация при старте: подцепить все неотправленные */
export async function initReminderScheduler({ prisma, tg }) {
  const now = new Date();

  // Будущие — планируем
  const future = await prisma.eventReminder.findMany({
    where: { sentAt: null, fireAt: { gt: now } },
    orderBy: { fireAt: 'asc' },
  });
  future.forEach(r => planOne({ prisma, tg }, r));

  // Просроченные — отправим сразу
  const overdue = await prisma.eventReminder.findMany({
    where: { sentAt: null, fireAt: { lte: now } },
    orderBy: { fireAt: 'asc' },
  });
  overdue.forEach(r => fireReminder({ prisma, tg }, r));

  log('init done. planned:', future.length, 'overdue fired:', overdue.length);
}

/** Удобный хелпер: перепланировать ВСЕ напоминания события */
export async function scheduleRemindersForEvent(prisma, tg, eventId) {
  const rows = await prisma.eventReminder.findMany({
    where: { eventId: String(eventId), sentAt: null },
  });
  rows.forEach(r => planOne({ prisma, tg }, r));
  return rows.length;
}
