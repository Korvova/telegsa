// api/src/routes/bounty.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// PATCH /tasks/:id/bounty  { chatId, amount }
router.patch('/tasks/:id/bounty', async (req, res) => {
  try {
    const id = String(req.params.id);
    const chatId = String(req.body?.chatId || '');
    const amountRaw = req.body?.amount;
    const amount = Number(amountRaw || 0);
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    // Только постановщик может менять
    if (String(task.chatId) !== chatId) return res.status(403).json({ ok: false, error: 'forbidden' });
    // Если Done — запрещаем
    // Heuristic: Done = task in Done column; тут нет колонки — разрешим менять до payout; фронт не даст в Done

    if (amount <= 0) {
      // снять звёзды: если было PLEDGED — вернуть
      if (task.bountyStars > 0 && task.bountyStatus !== 'PAID') {
        await prisma.$transaction(async (tx) => {
          await tx.starLedger.create({ data: { taskId: id, fromChatId: chatId, toChatId: null, amount: task.bountyStars, kind: 'REFUND' } });
          await tx.task.update({ where: { id }, data: { bountyStars: 0, bountyStatus: 'REFUNDED' } });
        });
      } else {
        await prisma.task.update({ where: { id }, data: { bountyStars: 0, bountyStatus: 'NONE' } });
      }
      const updated = await prisma.task.findUnique({ where: { id } });
      return res.json({ ok: true, task: updated });
    }

    // поставить/изменить звёзды → PLEDGED
    await prisma.$transaction(async (tx) => {
      await tx.starLedger.create({ data: { taskId: id, fromChatId: chatId, toChatId: null, amount, kind: 'PLEDGE' } });
      await tx.task.update({ where: { id }, data: { bountyStars: amount, bountyStatus: 'PLEDGED', bountyByChatId: chatId } });
    });
    const updated = await prisma.task.findUnique({ where: { id } });
    return res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('PATCH /tasks/:id/bounty error', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

// POST /tasks/:id/deposit/fake  { chatId, amount }
router.post('/tasks/:id/deposit/fake', async (req, res) => {
  try {
    const id = String(req.params.id);
    const chatId = String(req.body?.chatId || '');
    const amount = Number(req.body?.amount || 0);
    if (!chatId || !(amount > 0)) return res.status(400).json({ ok: false });
    // MVP: просто подтверждаем
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false });
  }
});

export { router as bountyRouter };

