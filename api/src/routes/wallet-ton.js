// api/src/routes/wallet-ton.js
import express from 'express';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export function walletTonRouter() {
  const router = express.Router();

  // POST /wallet/ton/connect-start { chatId }
  router.post('/wallet/ton/connect-start', async (req, res) => {
    try {
      const chatId = String(req.body?.chatId || '').trim();
      if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      const nonce = crypto.randomBytes(16).toString('base64url');
      const network = process.env.TON_NETWORK || 'testnet';
      await prisma.user.upsert({
        where: { chatId },
        update: { tonVerifyNonce: nonce },
        create: { chatId, tonVerifyNonce: nonce },
      });
      res.json({ ok: true, nonce, network });
    } catch (e) {
      console.error('[wallet] connect-start error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // POST /wallet/ton/verify { chatId, address, network, walletApp, signature }
  router.post('/wallet/ton/verify', async (req, res) => {
    try {
      const { chatId: rawChatId, address, network, walletApp, signature } = req.body || {};
      const chatId = String(rawChatId || '').trim();
      if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      if (!address || !network) return res.status(422).json({ ok: false, error: 'address_or_network_missing' });
      // MVP: требуем непустую подпись, но не проверяем тон-пруф (TODO: add proper ton-proof verification)
      if (!signature || String(signature).length < 4) return res.status(422).json({ ok: false, error: 'invalid_signature' });
      const u = await prisma.user.findUnique({ where: { chatId } });
      if (!u || !u.tonVerifyNonce) return res.status(400).json({ ok: false, error: 'nonce_missing' });

      await prisma.user.update({
        where: { chatId },
        data: {
          tonAddress: String(address),
          tonNetwork: String(network),
          tonWalletApp: walletApp ? String(walletApp) : null,
          tonVerifiedAt: new Date(),
          tonVerifyNonce: null,
        },
      });
      res.json({ ok: true });
    } catch (e) {
      console.error('[wallet] verify error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // GET /wallet/ton/status?chatId=
  router.get('/wallet/ton/status', async (req, res) => {
    try {
      const chatId = String(req.query?.chatId || '').trim();
      if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      const u = await prisma.user.findUnique({ where: { chatId } });
      if (!u) return res.json({ ok: true, connected: false });
      res.json({
        ok: true,
        connected: !!u.tonAddress,
        address: u.tonAddress || null,
        network: u.tonNetwork || null,
        walletApp: u.tonWalletApp || null,
        verified: !!u.tonVerifiedAt,
      });
    } catch (e) {
      console.error('[wallet] status error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // POST /wallet/ton/disconnect { chatId }
  router.post('/wallet/ton/disconnect', async (req, res) => {
    try {
      const chatId = String(req.body?.chatId || '').trim();
      if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      await prisma.user.update({ where: { chatId }, data: { tonVerifyNonce: null } }).catch(() => {});
      res.json({ ok: true });
    } catch (e) {
      console.error('[wallet] disconnect error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  return router;
}

export default walletTonRouter;

