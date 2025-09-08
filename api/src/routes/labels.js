// routes/labels.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const GROUP_SEP = '::';
const DEFAULT_LABELS = [
  { title: 'Идеи',    color: '#9E9E9E' },
  { title: 'Планы',   color: '#03A9F4' },
  { title: 'Доступы', color: '#8BC34A' },
];

function parseGroupIdFromColumnName(name) {
  const i = String(name || '').indexOf(GROUP_SEP);
  return i > 0 ? name.slice(0, i) : null;
}

async function userIsGroupMemberOrOwner(chatId, groupId) {
  const g = await prisma.group.findUnique({ where: { id: groupId } });
  if (!g) return false;
  if (g.ownerChatId === String(chatId)) return true;
  const m = await prisma.groupMember.findFirst({ where: { groupId, chatId: String(chatId) } });
  return Boolean(m);
}

async function ensureDefaultLabels(groupId) {
  const existing = await prisma.groupLabel.findMany({ where: { groupId } });
  if (existing.length) return existing;

  let order = 0;
  const created = await prisma.$transaction(
    DEFAULT_LABELS.map(l => prisma.groupLabel.create({
      data: { groupId, title: l.title, color: l.color, order: order++ }
    }))
  );
  return created;
}

/* ================= ГРУППОВЫЕ ЯРЛЫКИ ================= */

// GET /groups/:groupId/labels
router.get('/groups/:groupId/labels', async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    await ensureDefaultLabels(groupId);
    const labels = await prisma.groupLabel.findMany({
      where: { groupId },
      orderBy: [{ order: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true, color: true, order: true },
    });
    res.json({ ok: true, labels });
  } catch (e) {
    console.error('GET /groups/:id/labels error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// POST /groups/:groupId/labels  { chatId, title, color?, order? }
router.post('/groups/:groupId/labels', async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const { chatId, title, color, order } = req.body || {};
    if (!chatId || !String(title || '').trim()) {
      return res.status(400).json({ ok: false, error: 'chatId and title required' });
    }
    // править ярлыки может владелец группы
    const grp = await prisma.group.findUnique({ where: { id: groupId } });
    if (!grp) return res.status(404).json({ ok: false, error: 'group_not_found' });
    if (grp.ownerChatId !== String(chatId)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const maxOrder = await prisma.groupLabel.aggregate({
      where: { groupId },
      _max: { order: true }
    });
    const next = Number.isInteger(order) ? Number(order) : ((maxOrder?._max?.order ?? -1) + 1);

    const label = await prisma.groupLabel.create({
      data: { groupId, title: String(title).trim(), color: color || null, order: next },
      select: { id: true, title: true, color: true, order: true },
    });
    res.json({ ok: true, label });
  } catch (e) {
    if (String(e?.code) === 'P2002') {
      return res.status(409).json({ ok: false, error: 'duplicate_title' });
    }
    console.error('POST /groups/:id/labels error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// PATCH /groups/:groupId/labels/:labelId  { chatId, title?, color?, order? }
router.patch('/groups/:groupId/labels/:labelId', async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const labelId = String(req.params.labelId);
    const { chatId, title, color, order } = req.body || {};

    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId required' });

    const grp = await prisma.group.findUnique({ where: { id: groupId } });
    if (!grp) return res.status(404).json({ ok: false, error: 'group_not_found' });
    if (grp.ownerChatId !== String(chatId)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const patch = {};
    if (typeof title === 'string') patch.title = title.trim();
    if (typeof color !== 'undefined') patch.color = color || null;
    if (Number.isInteger(order)) patch.order = Number(order);

    const label = await prisma.groupLabel.update({
      where: { id: labelId },
      data: patch,
      select: { id: true, title: true, color: true, order: true },
    });
    res.json({ ok: true, label });
  } catch (e) {
    if (String(e?.code) === 'P2002') {
      return res.status(409).json({ ok: false, error: 'duplicate_title' });
    }
    console.error('PATCH /groups/:id/labels/:labelId error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// DELETE /groups/:groupId/labels/:labelId?chatId=...
router.delete('/groups/:groupId/labels/:labelId', async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const labelId = String(req.params.labelId);
    const chatId = String(req.query.chatId || '');

    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId required' });

    const grp = await prisma.group.findUnique({ where: { id: groupId } });
    if (!grp) return res.status(404).json({ ok: false, error: 'group_not_found' });
    if (grp.ownerChatId !== String(chatId)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    await prisma.groupLabel.delete({ where: { id: labelId } });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /groups/:id/labels/:labelId error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/* ========== ПРИВЯЗКА ЯРЛЫКОВ К ЗАДАЧЕ ========== */

// POST /tasks/:taskId/labels  { chatId, labelIds: string[] }  — добавить (idempotent)
router.post('/tasks/:taskId/labels', async (req, res) => {
  try {
    const taskId = String(req.params.taskId);
    const { chatId, labelIds } = req.body || {};
    if (!chatId || !Array.isArray(labelIds) || labelIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'chatId and labelIds required' });
    }

    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { column: true } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    const taskGroupId = parseGroupIdFromColumnName(task?.column?.name || '');
    if (!taskGroupId) return res.status(400).json({ ok: false, error: 'task_is_not_in_group' });

    // назначать ярлыки может любой участник группы (или владелец)
    const allowed = await userIsGroupMemberOrOwner(String(chatId), taskGroupId);
    if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });

    // проверим, что все ярлыки из той же группы
    const labels = await prisma.groupLabel.findMany({ where: { id: { in: labelIds } } });
    if (!labels.length || labels.some(l => l.groupId !== taskGroupId)) {
      return res.status(400).json({ ok: false, error: 'label_from_another_group' });
    }

  
// SQLite не поддерживает skipDuplicates. Делаем идемпотентно через upsert.
await prisma.$transaction(
  labels.map(l =>
    prisma.taskLabel.upsert({
      where: { taskId_labelId: { taskId, labelId: l.id } },
      create: { taskId, labelId: l.id, assignedBy: String(chatId) },
      update: { assignedBy: String(chatId), assignedAt: new Date() }, // можно и пустой update: {}
    })
  )
);


    const attached = await prisma.taskLabel.findMany({
      where: { taskId },
      include: { label: true },
      orderBy: [{ label: { order: 'asc' } }, { label: { title: 'asc' } }],
    });

    res.json({
      ok: true,
      labels: attached.map(a => ({
        id: a.label.id, title: a.label.title, color: a.label.color, order: a.label.order
      }))
    });
  } catch (e) {
    console.error('POST /tasks/:id/labels error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// DELETE /tasks/:taskId/labels/:labelId?chatId=...
router.delete('/tasks/:taskId/labels/:labelId', async (req, res) => {
  try {
    const taskId = String(req.params.taskId);
    const labelId = String(req.params.labelId);
    const chatId = String(req.query.chatId || '');
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId required' });

    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { column: true } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    const taskGroupId = parseGroupIdFromColumnName(task?.column?.name || '');
    if (!taskGroupId) return res.status(400).json({ ok: false, error: 'task_is_not_in_group' });

    const allowed = await userIsGroupMemberOrOwner(String(chatId), taskGroupId);
    if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });

    await prisma.taskLabel.delete({ where: { taskId_labelId: { taskId, labelId } } });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /tasks/:id/labels/:labelId error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});








// GET /tasks/:taskId/labels  -> текущие ярлыки задачи
router.get('/tasks/:taskId/labels', async (req, res) => {
  try {
    const taskId = String(req.params.taskId);
    const rows = await prisma.taskLabel.findMany({
      where: { taskId },
      include: { label: true },
      orderBy: [{ label: { order: 'asc' } }, { label: { title: 'asc' } }],
    });
    return res.json({
      ok: true,
      labels: rows.map(r => ({
        id: r.label.id,
        title: r.label.title,
        color: r.label.color,
        order: r.label.order
      }))
    });
  } catch (e) {
    console.error('GET /tasks/:id/labels error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});






export { router as labelsRouter };


