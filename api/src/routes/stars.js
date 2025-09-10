// api/src/routes/stars.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// GET /stars/summary?chatId=...
router.get('/stars/summary', async (req, res) => {
  try {
    const chatId = String(req.query.chatId || '');
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
    const received = await prisma.starLedger.aggregate({ _sum: { amount: true }, where: { kind: 'PAYOUT', toChatId: chatId } });
    const sent = await prisma.starLedger.aggregate({ _sum: { amount: true }, where: { kind: 'PAYOUT', fromChatId: chatId } });
    return res.json({ ok: true, received: received._sum.amount || 0, sent: sent._sum.amount || 0 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

export { router as starsRouter };

