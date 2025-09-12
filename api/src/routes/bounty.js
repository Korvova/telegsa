// api/src/routes/bounty.js
import express from 'express';
import { beginCell, Address, toNano } from '@ton/core';

export function bountyRouter() {
  const router = express.Router();

  const FEE_BPS = Number(process.env.FEE_BPS || 100); // 1% default
  const FEE_RECIPIENT = process.env.FEE_RECIPIENT || '';
  const NETWORK = (process.env.TON_NETWORK || 'mainnet').toLowerCase();
  const USDT_MASTER = NETWORK === 'mainnet' ? (process.env.TON_USDT_MASTER_MAINNET || '') : (process.env.TON_USDT_MASTER_TESTNET || '');
  const TON_PROVIDER = (process.env.TON_PROVIDER || 'tonapi').toLowerCase();
  const TONAPI_BASE_URL = process.env.TONAPI_BASE_URL || 'https://tonapi.io';
  const TONAPI_KEY = process.env.TONAPI_KEY || '';
  const ESCROW_WALLET_ADDRESS = process.env.ESCROW_WALLET_ADDRESS || '';

  // POST /bounty/quote { amount: number }
  router.post('/bounty/quote', async (req, res) => {
    try {
      const amount = Number(req.body?.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(422).json({ ok: false, error: 'bad_amount' });
      const fee = Math.ceil((amount * FEE_BPS) / 10000 * 1e6) / 1e6; // round up to 6 dp
      const total = amount + fee; // customer pays fee on top
      res.json({ ok: true, token: 'USDT', network: NETWORK, feeBps: FEE_BPS, feeRecipient: FEE_RECIPIENT, amount, fee, total });
    } catch (e) {
      console.error('[bounty] quote error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // helper: fetch JSON with TonAPI key
  async function tonapi(path, params) {
    const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
    const url = `${TONAPI_BASE_URL}${path}${qs}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TONAPI_KEY}` } });
    if (!r.ok) throw new Error(`tonapi_failed_${r.status}`);
    return r.json();
  }

  // helper: get user's USDT jetton wallet address via TonAPI
  async function getUserJettonWallet(owner, jettonMaster) {
    const j = await tonapi('/v2/jettons/wallets', { owner, jetton: jettonMaster });
    const addr = j?.addresses?.[0] || j?.address || (j?.wallets && j.wallets[0]?.address);
    if (!addr) throw new Error('jetton_wallet_not_found');
    return addr;
  }

  // helper: build jetton transfer payload (USDT has 6 decimals)
  function buildJettonTransferPayload({ amountUnits, to, responseTo, fwdAmountNano, comment }) {
    const op = 0x0f8a7ea5; // transfer op
    const queryId = 0n;
    const dest = Address.parse(to);
    const resp = Address.parse(responseTo);

    const payload = beginCell()
      .storeUint(op, 32)
      .storeUint(queryId, 64)
      .storeCoins(BigInt(amountUnits))
      .storeAddress(dest)
      .storeAddress(resp)
      .storeBit(0) // no custom payload
      .storeCoins(BigInt(fwdAmountNano))
      .storeBit(1) // forward_payload as ref
      .storeRef(
        beginCell()
          .storeUint(0, 32) // text comment op (0)
          .storeStringTail(comment || '')
          .endCell()
      )
      .endCell();
    return payload.toBoc({ idx: false }).toString('base64');
  }

  // POST /bounty/fund-request { chatId, amount, ownerAddress? }
  router.post('/bounty/fund-request', async (req, res) => {
    try {
      const amount = Number(req.body?.amount || 0);
      const ownerAddress = String(req.body?.ownerAddress || '').trim();
      if (!Number.isFinite(amount) || amount <= 0) return res.status(422).json({ ok: false, error: 'bad_amount' });
      if (!USDT_MASTER) return res.status(422).json({ ok: false, error: 'usdt_not_configured' });
      if (!ESCROW_WALLET_ADDRESS) return res.status(422).json({ ok: false, error: 'escrow_not_configured' });
      if (TON_PROVIDER !== 'tonapi') return res.status(422).json({ ok: false, error: 'provider_not_supported' });
      if (!TONAPI_KEY) return res.status(422).json({ ok: false, error: 'tonapi_key_missing' });

      // 1) determine owner address (from request or fallback to stored user wallet)
      let owner = ownerAddress;
      if (!owner) {
        const chatId = String(req.body?.chatId || '').trim();
        if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
        // fetch from DB
        try {
          const { PrismaClient } = await import('@prisma/client');
          const prisma = new PrismaClient();
          const u = await prisma.user.findUnique({ where: { chatId }, select: { tonAddress: true } });
          await prisma.$disconnect().catch(()=>{});
          if (u?.tonAddress) owner = String(u.tonAddress);
        } catch {}
      }
      if (!owner) return res.status(422).json({ ok: false, error: 'owner_wallet_missing' });

      // 2) user's USDT jetton wallet address
      const userJettonWallet = await getUserJettonWallet(owner, USDT_MASTER);

      // 3) amounts
      const fee = Math.ceil((amount * FEE_BPS) / 10000 * 1e6) / 1e6; // 6 dp
      const total = amount + fee;
      const decimals = 6; // USDT on TON
      const units = BigInt(Math.round(total * 10 ** decimals));

      // 4) build payload to forward tokens to ESCROW (forward_payload comment contains meta)
      const comment = `bounty|from:${owner}|ts:${Date.now()}`;
      const payload = buildJettonTransferPayload({
        amountUnits: units.toString(),
        to: ESCROW_WALLET_ADDRESS,
        responseTo: owner,
        fwdAmountNano: toNano('0.02').toString(), // forward a bit of TON
        comment,
      });

      // 5) craft TonConnect transaction (send internal message to user's jetton wallet)
      const validUntil = Math.floor(Date.now() / 1000) + 600; // 10 min
      const tx = {
        validUntil,
        messages: [
          {
            address: userJettonWallet,
            amount: toNano('0.1').toString(), // pay gas for jetton wallet
            payload,
          },
        ],
      };

      return res.json({ ok: true, transaction: tx });
    } catch (e) {
      console.error('[bounty] fund-request error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // POST /bounty/release-request { taskId }
  router.post('/bounty/release-request', async (req, res) => {
    try {
      // TODO: implement prepare transaction to pay executor + fee to feeRecipient
      return res.status(501).json({ ok: false, error: 'not_implemented' });
    } catch (e) {
      console.error('[bounty] release-request error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  return router;
}

export default bountyRouter;
