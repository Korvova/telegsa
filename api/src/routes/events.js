// api/src/routes/events.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const GROUP_SEP = '::';
const nameWithGroup = (groupId, plainName) =>
  groupId ? `${groupId}${GROUP_SEP}${plainName}` : plainName;

// Гарантируем колонки Inbox/Doing/Done/Cancel/Approval/Wait в нужной доске (личной или групповой)
async function ensureDefaultColumns(chatId, groupId = null) {
  const whereDefault = groupId
    ? { chatId, name: { startsWith: `${groupId}${GROUP_SEP}` } }
    : { chatId, name: { not: { contains: GROUP_SEP } } };

  const existing = await prisma.column.findMany({
    where: whereDefault,
    orderBy: { order: 'asc' },
  });
  if (existing.length) return existing;

  const base = [
    nameWithGroup(groupId, 'Inbox'),
    nameWithGroup(groupId, 'Doing'),
    nameWithGroup(groupId, 'Done'),
    nameWithGroup(groupId, 'Cancel'),
    nameWithGroup(groupId, 'Approval'),
    nameWithGroup(groupId, 'Wait'),
  ];

  const created = await prisma.$transaction(
    base.map((nm, i) =>
      prisma.column.create({
        data: { chatId, name: nm, order: i },
      })
    )
  );
  return created;
}

// Уточнить доску (личная или владельца группы) и вернуть id Inbox
async function resolveInbox({ callerChatId, groupId }) {
  let boardChatId = callerChatId; // по умолчанию — личная доска

  if (groupId) {
    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g) throw Object.assign(new Error('group_not_found'), { status: 404 });
    boardChatId = g.ownerChatId;
  }

  await ensureDefaultColumns(boardChatId, groupId);
  const inboxName = nameWithGroup(groupId, 'Inbox');
  const inbox = await prisma.column.findFirst({
    where: { chatId: boardChatId, name: inboxName },
  });
  if (!inbox) throw Object.assign(new Error('inbox_not_found'), { status: 500 });
  return { boardChatId, inboxId: inbox.id };
}

/* ===================== CREATE EVENT ===================== */
// POST /events
// body: { chatId: string, title: string, startAt: string(ISO), endAt: string(ISO), groupId?: string }
router.post('/', async (req, res) => {
  try {
    const { chatId, title, startAt, endAt, groupId } = req.body || {};
    if (!chatId || !String(title || '').trim() || !startAt || !endAt) {
      return res.status(400).json({ ok: false, error: 'chatId, title, startAt, endAt are required' });
    }

    const caller = String(chatId);
    const { boardChatId, inboxId } = await resolveInbox({
      callerChatId: caller,
      groupId: groupId ? String(groupId) : null,
    });

    // создаём «задачу-событие» в Inbox
    const last = await prisma.task.findFirst({
      where: { columnId: inboxId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const event = await prisma.task.create({
      data: {
        chatId: boardChatId,
        text: String(title).trim(),
        order: nextOrder,
        columnId: inboxId,
        type: 'EVENT',
        startAt: new Date(startAt),
        endAt: new Date(endAt),
      },
    });

    // организатор = создатель
    await prisma.eventParticipant.create({
      data: {
        eventId: event.id,
        chatId: caller,
        role: 'ORGANIZER',
      },
    });

    res.status(201).json({ ok: true, event });
  } catch (e) {
    const code = e?.status || 500;
    console.error('POST /events error:', e);
    res.status(code).json({ ok: false, error: e?.message || 'internal' });
  }
});

/* ===================== GET EVENT ===================== */
// GET /events/:id
router.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const event = await prisma.task.findUnique({ where: { id } });
    if (!event || event.type !== 'EVENT') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const participants = await prisma.eventParticipant.findMany({
      where: { eventId: id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ ok: true, event, participants });
  } catch (e) {
    console.error('GET /events/:id error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/* ===================== DELETE EVENT ===================== */
// DELETE /events/:id?byChatId=<organizerChatId>
router.delete('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const byChatId = String(req.query.byChatId || '');

    if (!byChatId) return res.status(400).json({ ok: false, error: 'byChatId required' });

    const event = await prisma.task.findUnique({ where: { id } });
    if (!event || event.type !== 'EVENT') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    // только организатор может удалить
    const org = await prisma.eventParticipant.findFirst({
      where: { eventId: id, chatId: byChatId, role: 'ORGANIZER' },
    });
    if (!org) return res.status(403).json({ ok: false, error: 'only_organizer_allowed' });

    await prisma.$transaction(async (tx) => {
      await tx.eventParticipant.deleteMany({ where: { eventId: id } });
      await tx.task.delete({ where: { id } });
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /events/:id error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});





/* ===================== PARTICIPANTS: helpers ===================== */
async function isOrganizer(eventId, chatId) {
  const org = await prisma.eventParticipant.findFirst({
    where: { eventId, chatId: String(chatId), role: 'ORGANIZER' },
  });
  return !!org;
}

/* ===================== LIST PARTICIPANTS ===================== */
// GET /events/:id/participants
router.get('/:id/participants', async (req, res) => {
  try {
    const eventId = String(req.params.id);
    const event = await prisma.task.findUnique({ where: { id: eventId } });
    if (!event || event.type !== 'EVENT') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const participants = await prisma.eventParticipant.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ ok: true, participants });
  } catch (e) {
    console.error('GET /events/:id/participants error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/* ===================== ADD PARTICIPANT ===================== */
// POST /events/:id/participants  body: { byChatId: string, chatId: string, role?: "PARTICIPANT" }
router.post('/:id/participants', async (req, res) => {
  try {
    const eventId = String(req.params.id);
    const { byChatId, chatId, role = 'PARTICIPANT' } = req.body || {};
    if (!byChatId || !chatId) {
      return res.status(400).json({ ok: false, error: 'byChatId and chatId required' });
    }

    const event = await prisma.task.findUnique({ where: { id: eventId } });
    if (!event || event.type !== 'EVENT') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    // только организатор может добавлять участников
    const allowed = await isOrganizer(eventId, byChatId);
    if (!allowed) return res.status(403).json({ ok: false, error: 'only_organizer_allowed' });

    // upsert по (eventId, chatId)
    const exists = await prisma.eventParticipant.findFirst({
      where: { eventId, chatId: String(chatId) },
    });

    const saved = exists
      ? await prisma.eventParticipant.update({
          where: { id: exists.id },
          data: { role }, // можно поменять роль при повторном добавлении
        })
      : await prisma.eventParticipant.create({
          data: { eventId, chatId: String(chatId), role },
        });

    res.status(201).json({ ok: true, participant: saved });
  } catch (e) {
    console.error('POST /events/:id/participants error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/* ===================== REMOVE PARTICIPANT ===================== */
// DELETE /events/:id/participants/:chatId?byChatId=<organizerChatId>
router.delete('/:id/participants/:chatId', async (req, res) => {
  try {
    const eventId = String(req.params.id);
    const targetChatId = String(req.params.chatId);
    const byChatId = String(req.query.byChatId || '');

    if (!byChatId) return res.status(400).json({ ok: false, error: 'byChatId required' });

    const event = await prisma.task.findUnique({ where: { id: eventId } });
    if (!event || event.type !== 'EVENT') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    // только организатор может удалять участников
    const allowed = await isOrganizer(eventId, byChatId);
    if (!allowed) return res.status(403).json({ ok: false, error: 'only_organizer_allowed' });

    // нельзя удалить организатора
    const target = await prisma.eventParticipant.findFirst({ where: { eventId, chatId: targetChatId } });
    if (!target) return res.status(404).json({ ok: false, error: 'participant_not_found' });
    if (target.role === 'ORGANIZER') {
      return res.status(400).json({ ok: false, error: 'cannot_remove_organizer' });
    }

    await prisma.eventParticipant.delete({ where: { id: target.id } });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /events/:id/participants/:chatId error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});







/* ===================== LIST EVENTS (for calendar) ===================== */
// GET /events?chatId=<caller>&groupId=<id|default>
// Возвращает события на доске (личной или группы владельца).
router.get('/', async (req, res) => {
  try {
    const caller = String(req.query.chatId || '').trim();
    const rawGroupId = String(req.query.groupId || '').trim();
    if (!caller) return res.status(400).json({ ok: false, error: 'chatId required' });

    const groupId = rawGroupId && rawGroupId !== 'default' ? rawGroupId : null;

    // Определим, где хранится канбан: личная доска (caller) или у владельца группы.
    let boardChatId = caller;
    let nameFilter;
    if (groupId) {
      const g = await prisma.group.findUnique({ where: { id: groupId } });
      if (!g) return res.status(404).json({ ok: false, error: 'group_not_found' });
      boardChatId = g.ownerChatId;
      nameFilter = { startsWith: `${groupId}${GROUP_SEP}` };
    } else {
      nameFilter = { not: { contains: GROUP_SEP } };
    }

    // Гарантируем базовые колонки, чтобы запросы были стабильны
    await ensureDefaultColumns(boardChatId, groupId);

    const cols = await prisma.column.findMany({
      where: { chatId: boardChatId, name: nameFilter },
      select: { id: true, name: true },
      orderBy: { order: 'asc' },
    });
    const colIds = cols.map(c => c.id);

    if (!colIds.length) return res.json({ ok: true, events: [] });

    const events = await prisma.task.findMany({
      where: { columnId: { in: colIds }, type: 'EVENT' },
      orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        text: true,
        startAt: true,
        endAt: true,
        columnId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Приведём к формату календаря (title + groupId из имени колонки)
    const byCol = new Map(cols.map(c => [c.id, c.name]));
    const result = events.map(ev => {
      const colName = byCol.get(ev.columnId) || '';
      const i = colName.indexOf(GROUP_SEP);
      const gid = i > 0 ? colName.slice(0, i) : null;
      return {
        id: ev.id,
        title: ev.text,
        startAt: ev.startAt,
        endAt: ev.endAt,
        groupId: gid,
        columnId: ev.columnId,
        createdAt: ev.createdAt,
        updatedAt: ev.updatedAt,
      };
    });

    res.json({ ok: true, events: result });
  } catch (e) {
    console.error('GET /events error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});






/* ===================== UPDATE EVENT (title / dates) ===================== */
// PATCH /events/:id
// body: { byChatId: string, title?: string, startAt?: string(ISO), endAt?: string(ISO) }
router.patch('/:id', async (req, res) => {
  try {
    const eventId = String(req.params.id);
    const { byChatId, title, startAt, endAt } = req.body || {};

    if (!byChatId) {
      return res.status(400).json({ ok: false, error: 'byChatId required' });
    }

    const event = await prisma.task.findUnique({ where: { id: eventId } });
    if (!event || event.type !== 'EVENT') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    // только организатор может редактировать
    const allowed = await isOrganizer(eventId, String(byChatId));
    if (!allowed) return res.status(403).json({ ok: false, error: 'only_organizer_allowed' });

    // собрать patch
    const data = {};
    if (typeof title === 'string' && title.trim()) data.text = title.trim();
    if (typeof startAt === 'string') {
      const d = new Date(startAt);
      if (isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_startAt' });
      data.startAt = d;
    }
    if (typeof endAt === 'string') {
      const d = new Date(endAt);
      if (isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_endAt' });
      data.endAt = d;
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ ok: false, error: 'nothing_to_update' });
    }

    // валидация диапазона, если обе даты в patch
    const nextStart = data.startAt ?? event.startAt;
    const nextEnd   = data.endAt   ?? event.endAt;
    if (nextStart && nextEnd && nextStart > nextEnd) {
      return res.status(400).json({ ok: false, error: 'start_after_end' });
    }

    const updated = await prisma.task.update({ where: { id: eventId }, data });
    res.json({ ok: true, event: updated });
  } catch (e) {
    console.error('PATCH /events/:id error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});





/* ===================== REMINDERS: list ===================== */
// GET /events/:id/reminders
router.get('/:id/reminders', async (req, res) => {
  try {
    const eventId = String(req.params.id);
    const event = await prisma.task.findUnique({ where: { id: eventId } });
    if (!event || event.type !== 'EVENT') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    const rows = await prisma.eventReminder.findMany({
      where: { eventId },
      orderBy: [{ offsetMinutes: 'asc' }, { chatId: 'asc' }],
      select: { chatId: true, offsetMinutes: true, fireAt: true, sentAt: true, replyToMessageId: true }
    });

    const offsets = Array.from(new Set(rows.map(r => r.offsetMinutes))).sort((a, b) => a - b);
    return res.json({ ok: true, offsets, reminders: rows });
  } catch (e) {
    console.error('GET /events/:id/reminders error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/* ===================== REMINDERS: upsert for all participants ===================== */
// POST /events/:id/reminders
// body: { byChatId: string, offsets: number[] }   // offsets ⊆ {60,10,5}
router.post('/:id/reminders', async (req, res) => {
  try {
    const eventId = String(req.params.id);
    const { byChatId, offsets } = req.body || {};

    if (!byChatId) return res.status(400).json({ ok: false, error: 'byChatId required' });
    if (!Array.isArray(offsets)) return res.status(400).json({ ok: false, error: 'offsets must be array' });

    const chosen = Array.from(new Set(offsets.map(n => Number(n)))).filter(n => [60, 10, 5].includes(n));
    if (!chosen.length) return res.status(400).json({ ok: false, error: 'offsets must include 60/10/5' });

    const event = await prisma.task.findUnique({ where: { id: eventId } });
    if (!event || event.type !== 'EVENT') {
      return res.status(404).json({ ok: false, error: 'event_not_found' });
    }
    if (!event.startAt) return res.status(400).json({ ok: false, error: 'event_has_no_start' });

    // только организатор может выставлять напоминания
    const allowed = await isOrganizer(eventId, String(byChatId));
    if (!allowed) return res.status(403).json({ ok: false, error: 'only_organizer_allowed' });

    // текущие участники события
    const participants = await prisma.eventParticipant.findMany({
      where: { eventId },
      select: { chatId: true }
    });
    const chatIds = participants.map(p => String(p.chatId));
    if (!chatIds.length) {
      return res.json({ ok: true, updated: 0, offsets: chosen });
    }

    // готовим транзакцию:
    // - удаляем напоминания для участников по offset, которых БОЛЬШЕ нет
    // - upsert для выбранных offsets
    const fireTimesByOffset = new Map(
      chosen.map(off => [off, new Date(event.startAt.getTime() - off * 60 * 1000)])
    );

    await prisma.$transaction(async (tx) => {
      // удалить все, что не входит в chosen
      await tx.eventReminder.deleteMany({
        where: { eventId, offsetMinutes: { notIn: chosen }, chatId: { in: chatIds } }
      });

      // upsert по каждому участнику и каждому offset
      for (const cid of chatIds) {
        for (const off of chosen) {
          const fireAt = fireTimesByOffset.get(off);
          // есть ли уже запись?
          const existing = await tx.eventReminder.findFirst({
            where: { eventId, chatId: cid, offsetMinutes: off },
            select: { id: true }
          });
          if (existing) {
            await tx.eventReminder.update({
              where: { id: existing.id },
              data: { fireAt }
            });
          } else {
            await tx.eventReminder.create({
              data: {
                eventId,
                chatId: cid,
                offsetMinutes: off,
                fireAt,
                // replyToMessageId оставляем null — заполним на шаге 3c,
                // когда разошлём базовые сообщения участникам
              }
            });
          }
        }
      }
    });

    return res.json({ ok: true, updated: chatIds.length * chosen.length, offsets: chosen });
  } catch (e) {
    console.error('POST /events/:id/reminders error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});







export { router as eventsRouter };
