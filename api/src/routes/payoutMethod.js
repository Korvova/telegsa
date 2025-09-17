// api/src/routes/payoutMethod.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// GET /payout-method?chatId=...
router.get('/payout-method', async (req, res) => {
  try {
    const chatId = String(req.query.chatId || '');
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
    const pm = await prisma.userPayoutMethod.findUnique({ where: { chatId } });
    return res.json({ ok: true, method: pm || null });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

// POST /payout-method  { chatId, phone, bankCode? }
router.post('/payout-method', async (req, res) => {
  try {
    const chatId = String(req.body?.chatId || '');
    const phone = String(req.body?.phone || '').trim();
    const bankCode = req.body?.bankCode ? String(req.body.bankCode) : null;
    if (!chatId || !phone) return res.status(400).json({ ok: false, error: 'chatId_and_phone_required' });
    const method = await prisma.userPayoutMethod.upsert({
      where: { chatId },
      update: { phone, bankCode: bankCode || null },
      create: { chatId, phone, bankCode: bankCode || null },
    });
    return res.json({ ok: true, method });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

export { router as payoutMethodRouter };

