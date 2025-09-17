// api/src/routes/rank.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// GET /me/rank?chatId=
router.get('/me/rank', async (req, res) => {
  try {
    const chatId = String(req.query.chatId || '').trim();
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
    const user = await prisma.user.findUnique({ where: { chatId } });
    if (!user) return res.json({ ok: true, rank: 'ANT', score: 0 });
    return res.json({ ok: true, rank: user.rank || 'ANT', score: user.rankScore || 0, updatedAt: user.rankUpdatedAt || null });
  } catch (e) {
    console.error('GET /me/rank error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// POST /me/rank  { chatId, rank }
router.post('/me/rank', async (req, res) => {
  try {
    const chatId = String(req.body?.chatId || '').trim();
    const rank = String(req.body?.rank || '').trim();
    if (!chatId || !rank) return res.status(400).json({ ok: false, error: 'chatId_and_rank_required' });
    const now = new Date();
    const user = await prisma.user.upsert({
      where: { chatId },
      create: { chatId, rank: rank, rankUpdatedAt: now },
      update: { rank: rank, rankUpdatedAt: now },
    });
    return res.json({ ok: true, rank: user.rank, updatedAt: user.rankUpdatedAt });
  } catch (e) {
    console.error('POST /me/rank error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

export { router as rankRouter };

