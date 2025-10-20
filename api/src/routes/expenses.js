// api/src/routes/expenses.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { logTaskHistory } from '../services/taskHistory.js';

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
  if (!task?.column) return (String(task.chatId) === String(chatId)) || (task.assigneeChatId && String(task.assigneeChatId) === String(chatId));
  const groupId = parseGroupIdFromColumnName(task.column.name || '');
  if (!groupId) return true;
  const g = await prisma.group.findUnique({ where: { id: groupId } });
  if (!g) return false;
  if (String(g.ownerChatId) === String(chatId)) return true;
  const def = (g.permEditJson && g.permEditJson[field]);
  if (def === false) {
    const gm = await prisma.groupMember.findFirst({ where: { groupId, chatId: String(chatId) } });
    const ov = gm?.permOverrides || null;
    if (ov && ov.edit && ov.edit[field] === true) return true;
    return false;
  }
  return true;
}

// PATCH /tasks/:id/expenses   { chatId: string, expenses: number|null }
router.patch('/tasks/:id/expenses', async (req, res) => {
  try {
    const id = String(req.params.id);
    const chatId = String(req.body?.chatId || '');
    const raw = req.body?.expenses;

    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });

    const task = await prisma.task.findUnique({ where: { id }, include: { column: true } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    // права
    const groupId = parseGroupIdFromColumnName(task?.column?.name || '');
    if (groupId) {
      const allowed = await userIsGroupMemberOrOwner(chatId, groupId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });
      const ok = await canEditField(chatId, task, 'expenses');
      if (!ok) return res.status(403).json({ ok: false, error: 'no_rights' });
    } else {
      // личная доска: допускаем постановщика и исполнителя
      const amCreator = String(task.chatId) === String(chatId);
      const amAssignee = task.assigneeChatId && String(task.assigneeChatId) === String(chatId);
      if (!amCreator && !amAssignee) return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    let expenses = null;
    if (raw !== null && typeof raw !== 'undefined' && String(raw).trim() !== '') {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ ok: false, error: 'bad_expenses' });
      expenses = Math.round(n);
    }

    const updated = await prisma.task.update({ where: { id }, data: { expenses } });

    // Логируем изменение затрат
    ;(async () => {
      try {
        const oldExpenses = task.expenses !== null ? String(task.expenses) : null;
        const newExpenses = expenses !== null ? String(expenses) : null;

        if (oldExpenses !== newExpenses) {
          await logTaskHistory(id, 'expenses_changed', chatId, oldExpenses, newExpenses);
        }
      } catch (e) {
        console.error('[expenses] history logging error:', e);
      }
    })().catch(() => {});

    return res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('PATCH /tasks/:id/expenses error:', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

export { router as expensesRouter };
