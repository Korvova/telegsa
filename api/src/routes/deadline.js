// api/src/routes/deadline.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const GROUP_SEP = '::';

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

async function canEditField(chatId, task, field) {
  // личная доска: разрешаем создателю/исполнителю
  if (!task?.column) return (String(task.chatId) === String(chatId)) || (task.assigneeChatId && String(task.assigneeChatId) === String(chatId));
  const groupId = parseGroupIdFromColumnName(task.column.name || '');
  if (!groupId) return true;
  const g = await prisma.group.findUnique({ where: { id: groupId } });
  if (!g) return false;
  if (String(g.ownerChatId) === String(chatId)) return true;
  // если группа явно запрещает редактирование поля
  const def = (g.permEditJson && g.permEditJson[field]);
  if (def === false) {
    const gm = await prisma.groupMember.findFirst({ where: { groupId, chatId: String(chatId) } });
    const ov = gm?.permOverrides || null;
    if (ov && ov.edit && ov.edit[field] === true) return true; // явное разрешение участнику
    return false;
  }
  return true; // по умолчанию разрешаем
}

// PATCH /tasks/:id/deadline   { chatId: string, deadlineAt: string|null }
router.patch('/tasks/:id/deadline', async (req, res) => {
  try {
    const id = String(req.params.id);
    const chatId = String(req.body?.chatId || '');
    const deadlineAtRaw = req.body?.deadlineAt ?? null; // string | null

    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });

    const task = await prisma.task.findUnique({ where: { id }, include: { column: true } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    // права
    const groupId = parseGroupIdFromColumnName(task?.column?.name || '');
    if (groupId) {
      const allowed = await userIsGroupMemberOrOwner(chatId, groupId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });
      const editAllowed = await canEditField(chatId, task, 'deadline');
      if (!editAllowed) return res.status(403).json({ ok: false, error: 'no_rights' });
    } else {
      // личная доска: допускаем постановщика и исполнителя
      const amCreator = String(task.chatId) === String(chatId);
      const amAssignee = task.assigneeChatId && String(task.assigneeChatId) === String(chatId);
      if (!amCreator && !amAssignee) return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    // валидация даты
    let deadlineAt = null;
    if (deadlineAtRaw !== null && typeof deadlineAtRaw !== 'undefined' && String(deadlineAtRaw).trim()) {
      const d = new Date(String(deadlineAtRaw));
      if (Number.isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'invalid_datetime' });
      const now = Date.now();
      if (d.getTime() <= now) return res.status(400).json({ ok: false, error: 'deadline_in_past' });
      deadlineAt = d;
    }

    const updated = await prisma.task.update({
      where: { id },
      data: { deadlineAt },
    });

    return res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('PATCH /tasks/:id/deadline error:', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

export { router as deadlineRouter };
