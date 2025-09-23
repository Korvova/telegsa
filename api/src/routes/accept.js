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

// PATCH /tasks/:id/accept-condition { chatId, condition: 'NONE' | 'PHOTO' | 'APPROVAL' | 'PHOTO_AND_APPROVAL' | 'DOC_AND_APPROVAL' }
router.patch('/tasks/:id/accept-condition', async (req, res) => {
  try {
    const id = String(req.params.id);
    const chatId = String(req.body?.chatId || '');
    const cond = String(req.body?.condition || '').toUpperCase();
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
    if (!['NONE', 'PHOTO', 'APPROVAL', 'PHOTO_AND_APPROVAL', 'DOC_AND_APPROVAL'].includes(cond)) return res.status(400).json({ ok: false, error: 'invalid_condition' });

    const task = await prisma.task.findUnique({ where: { id }, include: { column: true } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    // Права: группа с учетом edit-json/overrides, либо личная доска — создатель/исполнитель
    const groupId = parseGroupIdFromColumnName(task?.column?.name || '');
    if (groupId) {
      // членство
      const allowed = await userIsGroupMemberOrOwner(chatId, groupId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });
      // право на изменение условия приёма
      try {
        const g = await prisma.group.findUnique({ where: { id: groupId } });
        if (g && g.permEditJson && g.permEditJson.accept === false) {
          const isOwner = String(g.ownerChatId) === String(chatId);
          if (!isOwner) {
            const gm = await prisma.groupMember.findFirst({ where: { groupId, chatId: String(chatId) } });
            const ov = gm?.permOverrides || null;
            const ok = !!(ov && ov.edit && ov.edit.accept === true);
            if (!ok) return res.status(403).json({ ok: false, error: 'no_rights' });
          }
        }
      } catch {}
    } else {
      // личная доска: допускаем постановщика и исполнителя
      const amCreator = String(task.chatId) === String(chatId);
      const amAssignee = task.assigneeChatId && String(task.assigneeChatId) === String(chatId);
      if (!amCreator && !amAssignee) return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const updated = await prisma.task.update({ where: { id }, data: { acceptCondition: cond } });
    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('PATCH /tasks/:id/accept-condition error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

export { router as acceptRouter };
