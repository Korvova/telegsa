// api/src/routes/accept.js
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

// PATCH /tasks/:id/accept-condition { chatId, condition: 'NONE' | 'PHOTO' }
router.patch('/tasks/:id/accept-condition', async (req, res) => {
  try {
    const id = String(req.params.id);
    const chatId = String(req.body?.chatId || '');
    const cond = String(req.body?.condition || '').toUpperCase();
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
    if (!['NONE', 'PHOTO'].includes(cond)) return res.status(400).json({ ok: false, error: 'invalid_condition' });

    const task = await prisma.task.findUnique({ where: { id }, include: { column: true } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    // Права: постановщик или владелец/участник группы
    const groupId = parseGroupIdFromColumnName(task?.column?.name || '');
    if (groupId) {
      const allowed = await userIsGroupMemberOrOwner(chatId, groupId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });
    } else {
      const amCreator = String(task.chatId) === String(chatId);
      if (!amCreator) return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const updated = await prisma.task.update({ where: { id }, data: { acceptCondition: cond } });
    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('PATCH /tasks/:id/accept-condition error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

export { router as acceptRouter };

