// api/src/routes/bounty.js
import express from 'express';
import { beginCell, Address, toNano, Cell } from '@ton/core';
import { external, internal, storeMessage } from '@ton/core';
import { WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

export function bountyRouter() {
  const router = express.Router();

  const FEE_BPS = Number(process.env.FEE_BPS || 100); // 1% default
  const FEE_RECIPIENT = process.env.FEE_RECIPIENT || '';
  const NETWORK = (process.env.TON_NETWORK || 'mainnet').toLowerCase();
  const USDT_MASTER = NETWORK === 'mainnet' ? (process.env.TON_USDT_MASTER_MAINNET || '') : (process.env.TON_USDT_MASTER_TESTNET || '');
  const TON_PROVIDER = (process.env.TON_PROVIDER || 'tonapi').toLowerCase();
  const TONAPI_BASE_URL = process.env.TONAPI_BASE_URL || 'https://tonapi.io';
  const TONAPI_KEY = process.env.TONAPI_KEY || '';
  const TONCENTER_BASE_URL = process.env.TONCENTER_MAINNET_URL || process.env.TONCENTER_URL || '';
  const TONCENTER_API_KEY = process.env.TONCENTER_MAINNET_KEY || process.env.TONCENTER_API_KEY || '';
  const ESCROW_WALLET_ADDRESS = process.env.ESCROW_WALLET_ADDRESS || '';
  // simple runtime cache for rates
  let RATES_CACHE = { ts: 0, tonRub: null };
  const DRAFTS = new Map(); // chatId -> { amountTon, amountRub, ts }

  // POST /bounty/quote { amount: number }
  router.post('/bounty/quote', async (req, res) => {
    try {
      const amount = Number(req.body?.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(422).json({ ok: false, error: 'bad_amount' });
      // For TON payments: compute fee in TON (display-only here)
      const fee = Math.ceil((amount * FEE_BPS) / 10000 * 1e4) / 1e4; // show 4 dp for TON
      const total = amount + fee; // customer pays fee on top
      res.json({ ok: true, token: 'TON', network: NETWORK, feeBps: FEE_BPS, feeRecipient: FEE_RECIPIENT, amount, fee, total });
    } catch (e) {
      console.error('[bounty] quote error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // Helper to resolve TON/RUB rate with cache and fallbacks
  async function resolveTonRubRate({ allowCache = true } = {}) {
    const now = Date.now();
    if (allowCache && RATES_CACHE.tonRub && now - RATES_CACHE.ts < 60_000) {
      return { rub: RATES_CACHE.tonRub, ts: RATES_CACHE.ts };
    }
    async function fetchJson(url) {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('bad_rate_' + r.status);
      return r.json();
    }
    let rub = null;
    // 1) Coingecko toncoin
    try {
      const j = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=toncoin&vs_currencies=rub');
      rub = Number(j?.toncoin?.rub || null);
    } catch {}
    // 2) Coingecko the-open-network
    if (!rub) {
      try {
        const j2 = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=rub');
        rub = Number(j2?.['the-open-network']?.rub || null);
      } catch {}
    }
    // 3) TonAPI (если ключ задан)
    if (!rub && TONAPI_KEY) {
      try {
        const r = await fetch(`${TONAPI_BASE_URL}/v2/rates?tokens=ton`, { headers: { Authorization: `Bearer ${TONAPI_KEY}` } });
        if (r.ok) {
          const j3 = await r.json();
          const rate = j3?.rates?.TON || j3?.rates?.ton || j3?.rates?.[0];
          const maybeRub = rate?.prices?.RUB || rate?.rub || null;
          if (maybeRub) rub = Number(maybeRub);
        }
      } catch {}
    }
    if (!rub || !Number.isFinite(rub) || rub <= 0) throw new Error('rate_unavailable');
    RATES_CACHE = { ts: Date.now(), tonRub: rub };
    return { rub: RATES_CACHE.tonRub, ts: RATES_CACHE.ts };
  }

  // GET /bounty/rates -> { ok, tonRub, updatedAt }
  router.get('/bounty/rates', async (_req, res) => {
    try {
      const r = await resolveTonRubRate({ allowCache: true });
      return res.json({ ok: true, tonRub: r.rub, updatedAt: r.ts });
    } catch (e) {
      if (String(e?.message || '').includes('rate_unavailable')) return res.status(503).json({ ok: false, error: 'rate_unavailable' });
      console.error('[bounty] rates error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // ---- Draft endpoints (server-side lock instead of localStorage) ----
  router.get('/bounty/draft/get', async (req, res) => {
    try {
      const chatId = String(req.query?.chatId || '').trim();
      if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      const d = DRAFTS.get(chatId) || null;
      res.json({ ok: true, draft: d });
    } catch (e) { res.status(500).json({ ok: false, error: 'internal' }); }
  });

  router.post('/bounty/draft/set', async (req, res) => {
    try {
      const chatId = String(req.body?.chatId || '').trim();
      const amountTon = Number(req.body?.amountTon || 0);
      const amountRub = req.body?.amountRub != null ? Number(req.body.amountRub) : null;
      if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      if (!Number.isFinite(amountTon) || amountTon <= 0) return res.status(422).json({ ok: false, error: 'bad_amount' });
      DRAFTS.set(chatId, { amountTon, amountRub, ts: Date.now() });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: 'internal' }); }
  });

  router.post('/bounty/draft/clear', async (req, res) => {
    try {
      const chatId = String(req.body?.chatId || '').trim();
      if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      DRAFTS.delete(chatId);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: 'internal' }); }
  });

  // helper: fetch JSON with TonAPI key
  async function tonapi(path, params) {
    const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
    const url = `${TONAPI_BASE_URL}${path}${qs}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TONAPI_KEY}` } });
    if (!r.ok) {
      const txt = await r.text().catch(()=>'');
      console.error('[tonapi]', r.status, url, txt?.slice?.(0, 300));
      throw new Error(`tonapi_failed_${r.status}`);
    }
    return r.json();
  }

  async function tonapiPost(path, body) {
    const url = `${TONAPI_BASE_URL}${path}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TONAPI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      console.error('[tonapi-post]', r.status, url, txt?.slice?.(0, 300));
      throw new Error(`tonapi_failed_${r.status}`);
    }
    return r.json();
  }

  async function tonapiPostTry(paths, body) {
    let lastErr = null;
    for (const p of paths) {
      try { return await tonapiPost(p, body); } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('tonapi_failed');
  }

  // ---- Toncenter helpers (fallback when TonAPI doesn't expose blockchain methods) ----
  function isAscii(s) {
    try { return /^[\x00-\x7F]*$/.test(String(s || '')); } catch { return false; }
  }
  async function toncenterGet(method, params) {
    if (!TONCENTER_BASE_URL) throw new Error('toncenter_not_configured');
    const qs = new URLSearchParams({ ...(params || {}) });
    if (TONCENTER_API_KEY && isAscii(TONCENTER_API_KEY)) qs.set('api_key', TONCENTER_API_KEY);
    const url = `${TONCENTER_BASE_URL.replace(/\/$/, '')}/${method}?${qs.toString()}`;
    const headers = (TONCENTER_API_KEY && isAscii(TONCENTER_API_KEY)) ? { 'X-API-Key': TONCENTER_API_KEY } : {};
    const r = await fetch(url, { headers });
    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      console.error('[toncenter]', r.status, url, txt?.slice?.(0, 300));
      throw new Error(`toncenter_failed_${r.status}`);
    }
    return r.json();
  }
  async function toncenterPost(method, body) {
    if (!TONCENTER_BASE_URL) throw new Error('toncenter_not_configured');
    const url = `${TONCENTER_BASE_URL.replace(/\/$/, '')}/${method}`;
    const headers = { 'Content-Type': 'application/json', ...((TONCENTER_API_KEY && isAscii(TONCENTER_API_KEY)) ? { 'X-API-Key': TONCENTER_API_KEY } : {}) };
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      console.error('[toncenter-post]', r.status, url, txt?.slice?.(0, 300));
      throw new Error(`toncenter_failed_${r.status}`);
    }
    return r.json();
  }

  // --- Escrow wallet helpers ---
  let ESCROW_CACHE = { init: false, publicKey: null, secretKey: null, wallet: null, address: null };
  async function getEscrow() {
    if (!process.env.ESCROW_WALLET_MNEMONIC || !ESCROW_WALLET_ADDRESS) throw new Error('escrow_not_configured');
    if (!ESCROW_CACHE.init) {
      const words = String(process.env.ESCROW_WALLET_MNEMONIC).trim().split(/\s+/g);
      const kp = await mnemonicToPrivateKey(words);
      const wallet = WalletContractV4.create({ workchain: 0, publicKey: kp.publicKey });
      ESCROW_CACHE = { init: true, publicKey: kp.publicKey, secretKey: kp.secretKey, wallet, address: wallet.address };
    }
    return ESCROW_CACHE;
  }

  async function getWalletSeqno(addrFriendly) {
    // Prefer Toncenter when configured, otherwise try TonAPI first
    const preferToncenter = TON_PROVIDER === 'toncenter';
    const tryToncenter = async () => {
      const j = await toncenterGet('getWalletInformation', { address: addrFriendly });
      const seq = j?.result?.seqno ?? j?.seqno ?? j?.result?.wallet?.seqno;
      if (seq !== undefined) return Number(seq);
      const r2 = await toncenterGet('runGetMethod', { address: addrFriendly, method: 'seqno' });
      const st = r2?.result?.stack || r2?.stack || [];
      const v = Array.isArray(st) && st[0] ? (Array.isArray(st[0]) ? st[0][1] : st[0].number) : 0;
      if (typeof v === 'string') return parseInt(Buffer.from(v, 'base64').toString('hex'), 16) || 0;
      if (v !== undefined) return Number(v);
      return 0;
    };
    const tryTonapi = async () => {
      const res = await tonapiPostTry([
        '/v2/blockchain/run-get-method',
        '/v2/blockchain/runGetMethod',
      ], { address: addrFriendly, method: 'seqno', stack: [] });
      const dec = res?.decoded?.result ?? res?.decoded?.value ?? res?.decoded?.number;
      if (dec !== undefined) return Number(dec);
      const s0 = res?.stack?.[0];
      if (Array.isArray(s0) && typeof s0[1] === 'string') return parseInt(Buffer.from(s0[1], 'base64').toString('hex'), 16) || 0;
      if (s0?.number !== undefined) return Number(s0.number);
      return 0;
    };
    try {
      return preferToncenter ? await tryToncenter() : await tryTonapi();
    } catch (e) {
      try {
        return preferToncenter ? await tryTonapi() : await tryToncenter();
      } catch (e2) {
        console.warn('[escrow] seqno failed (both providers)', e, e2);
        return 0;
      }
    }
  }

  async function sendFromEscrow({ to, amountNano, comment }) {
    const { wallet, secretKey, address } = await getEscrow();
    const seqno = await getWalletSeqno(Address.isAddress(address) ? address.toString() : String(address));
    const msg = internal({ to, value: amountNano, body: comment ? beginCell().storeUint(0,32).storeStringTail(comment).endCell() : undefined });
    const body = wallet.createTransfer({ seqno, secretKey, messages: [msg] });
    const ext = external({ to: wallet.address, body });
    const boc = beginCell().store(storeMessage(ext)).endCell().toBoc({ idx: false }).toString('base64');
    const preferToncenter = TON_PROVIDER === 'toncenter';
    const tryToncenter = async () => await toncenterPost('sendBoc', { boc });
    const tryTonapi = async () => await tonapiPostTry(['/v2/blockchain/send', '/v2/blockchain/send-boc'], { boc });
    try {
      return preferToncenter ? await tryToncenter() : await tryTonapi();
    } catch (e) {
      console.warn('[escrow] primary send failed, switching provider', e);
      return preferToncenter ? await tryTonapi() : await tryToncenter();
    }
  }

  // helper: get user's USDT jetton wallet address via TonAPI (kept for future USDT flow, not used in TON flow)
  function normalizeRaw(addr) {
    try { return Address.parse(addr).toRawString(); } catch { return String(addr); }
  }
  function normalizeFriendly(addr) {
    try { return Address.parse(addr).toString(); } catch { return String(addr); }
  }
  function friendlyUrlSafe(addr) {
    try { return Address.parse(addr).toString({ urlSafe: true }); } catch { return String(addr); }
  }

  async function getUserJettonWallet(owner, jettonMaster) {
    // 0) Try runGetMethod(get_wallet_address) on jetton master — works even if wallet not deployed
    try {
      const ownerCell = beginCell().storeAddress(Address.parse(owner)).endCell();
      const body = {
        address: normalizeFriendly(jettonMaster),
        method: 'get_wallet_address',
        stack: [ { type: 'slice', cell: ownerCell.toBoc({ idx: false }).toString('base64') } ],
      };
      const res = await tonapiPost('/v2/blockchain/runGetMethod', body);
      // TonAPI variants: decoded.address OR raw stack cell with address slice
      const decodedAddr = res?.decoded?.address || res?.decoded?.result || res?.decoded?.value;
      if (decodedAddr) return normalizeFriendly(decodedAddr);
      const stack0 = res?.stack?.[0];
      const cellB64 = stack0?.cell || stack0?.slice || stack0?.value || null;
      if (cellB64) {
        try {
          const cell = Cell.fromBase64(cellB64);
          const slice = cell.beginParse();
          const addr = slice.readAddress();
          if (addr) return addr.toString();
        } catch {}
      }
      // Some TonAPI deployments return stack as array of arrays: [["tvm.Slice", "base64..."]]
      if (Array.isArray(res?.stack) && Array.isArray(res.stack[0]) && typeof res.stack[0][1] === 'string') {
        try {
          const cell = Cell.fromBase64(res.stack[0][1]);
          const slice = cell.beginParse();
          const addr = slice.readAddress();
          if (addr) return addr.toString();
        } catch {}
      }
    } catch (e) {
      console.warn('[tonapi] runGetMethod get_wallet_address failed, fallback to listings');
    }

    const ownerFriendly = normalizeFriendly(owner);
    const jettonFriendly = normalizeFriendly(jettonMaster);
    const ownerFriendlyUrl = friendlyUrlSafe(owner);
    const jettonFriendlyUrl = friendlyUrlSafe(jettonMaster);
    const ownerRaw = normalizeRaw(owner);
    const jettonRaw = normalizeRaw(jettonMaster);

    // 1) Try list jettons for account (friendly in path)
    try {
      const j = await tonapi(`/v2/accounts/${encodeURIComponent(ownerFriendlyUrl)}/jettons`);
      const items = j?.balances || j?.jettons || j?.items || [];
      for (const it of items) {
        const m = it?.jetton?.address || it?.master?.address || it?.jetton_address || it?.jetton;
        const mRaw = m ? normalizeRaw(m) : '';
        if (mRaw && mRaw === jettonRaw) {
          const wa = it?.wallet_address || it?.wallet?.address || it?.address;
          if (wa) return normalizeFriendly(wa);
        }
      }
    } catch (e) {
      console.warn('[tonapi] accounts jettons failed, fallback to /v2/jettons/wallets');
    }

    // 2) /v2/jettons/wallets?account=...&jetton=...
    try {
      const w = await tonapi('/v2/jettons/wallets', { account: ownerFriendlyUrl, jetton: jettonFriendlyUrl });
      const addr = w?.addresses?.[0]?.address || w?.addresses?.[0] || w?.address || (w?.wallets && w.wallets[0]?.address);
      if (addr) return normalizeFriendly(addr);
    } catch (e) {
      console.warn('[tonapi] jettons/wallets?account= failed, try owner=');
      try {
        const w2 = await tonapi('/v2/jettons/wallets', { owner: ownerFriendlyUrl, jetton: jettonFriendlyUrl });
        const addr2 = w2?.addresses?.[0]?.address || w2?.addresses?.[0] || w2?.address || (w2?.wallets && w2.wallets[0]?.address);
        if (addr2) return normalizeFriendly(addr2);
      } catch {}
    }

    throw new Error('jetton_wallet_not_found');
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

  function buildTextCommentPayload(text) {
    const cell = beginCell().storeUint(0, 32).storeStringTail(text || '').endCell();
    return cell.toBoc({ idx: false }).toString('base64');
  }

  // POST /bounty/fund-request { chatId, amount, ownerAddress? }
  router.post('/bounty/fund-request', async (req, res) => {
    try {
      const amount = Number(req.body?.amount || 0);
      const ownerAddress = String(req.body?.ownerAddress || '').trim();
      const taskId = req.body?.taskId ? String(req.body.taskId) : null;
      if (!Number.isFinite(amount) || amount <= 0) return res.status(422).json({ ok: false, error: 'bad_amount' });
      if (!ESCROW_WALLET_ADDRESS) return res.status(422).json({ ok: false, error: 'escrow_not_configured' });

      // 1) determine owner address (from request or fallback to stored user wallet)
      let owner = ownerAddress;
      let userNetwork = null;
      if (!owner) {
        const chatId = String(req.body?.chatId || '').trim();
        if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
        // fetch from DB
        try {
          const { PrismaClient } = await import('@prisma/client');
          const prisma = new PrismaClient();
          const u = await prisma.user.findUnique({ where: { chatId }, select: { tonAddress: true, tonNetwork: true } });
          await prisma.$disconnect().catch(()=>{});
          if (u?.tonAddress) owner = String(u.tonAddress);
          if (u?.tonNetwork) userNetwork = String(u.tonNetwork).toLowerCase();
        } catch {}
      }
      if (!owner) return res.status(422).json({ ok: false, error: 'owner_wallet_missing' });

      // ensure network matches configured
      if (userNetwork && userNetwork !== NETWORK) {
        return res.status(422).json({ ok: false, error: `wallet_network_mismatch:${userNetwork}->${NETWORK}` });
      }

      // 2) TON amounts (in nanoTON) — ограничим до 9 знаков после запятой
      let amountStr = amount.toFixed(9);
      amountStr = amountStr.replace(/0+$/, '').replace(/\.$/, '');
      const amountNano = toNano(amountStr);
      const feeNano = ((amountNano * BigInt(FEE_BPS)) + 9999n) / 10000n; // round up
      const comment = `bounty|from:${owner}${taskId ? `|task:${taskId}` : ''}|ts:${Date.now()}`;
      const payloadAmount = buildTextCommentPayload(comment);
      const payloadFee = buildTextCommentPayload(`${comment}|fee`);

      // 3) craft TonConnect transaction: two TON transfers
      const validUntil = Math.floor(Date.now() / 1000) + 600; // 10 min
      const tx = {
        validUntil,
        messages: [
          { address: ESCROW_WALLET_ADDRESS, amount: amountNano.toString(), payload: payloadAmount },
          { address: (FEE_RECIPIENT || ESCROW_WALLET_ADDRESS), amount: feeNano.toString(), payload: payloadFee },
        ],
      };

      return res.json({ ok: true, transaction: tx });
    } catch (e) {
      console.error('[bounty] fund-request error', e);
      const msg = (e && e.message) ? String(e.message) : 'internal';
      // map common causes to 422 for clearer UI
      if (msg.startsWith('tonapi_failed_')) return res.status(422).json({ ok: false, error: msg });
      if (msg === 'jetton_wallet_not_found') return res.status(422).json({ ok: false, error: msg });
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // POST /bounty/release-request { taskId, amountTon? }
  router.post('/bounty/release-request', async (req, res) => {
    try {
      const taskId = String(req.body?.taskId || '').trim();
      const amountTon = req.body?.amountTon !== undefined ? Number(req.body.amountTon) : null;
      if (!taskId) return res.status(400).json({ ok: false, error: 'taskId_required' });
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      try {
        const t = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, assigneeChatId: true, bountyStars: true, bountyStatus: true } });
        if (!t) return res.status(404).json({ ok: false, error: 'task_not_found' });
        if (!t.assigneeChatId) return res.status(422).json({ ok: false, error: 'no_assignee' });
        // resolve executor wallet
        const u = await prisma.user.findUnique({ where: { chatId: String(t.assigneeChatId) }, select: { tonAddress: true } });
        if (!u?.tonAddress) return res.status(422).json({ ok: false, error: 'needs_wallet' });
        // resolve amount in TON
        let ton = amountTon;
        if (!ton || ton <= 0) {
          // convert from RUB bountyStars using cached/multi-source rate
          const ru = Number(t.bountyStars || 0);
          if (ru <= 0) return res.status(422).json({ ok: false, error: 'amount_missing' });
          try {
            const r = await resolveTonRubRate({ allowCache: true });
            ton = ru / r.rub;
          } catch (err) {
            return res.status(503).json({ ok: false, error: 'rate_unavailable' });
          }
        }
        // limit fractional part to 9 decimals
        const amountStr = Number(ton).toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
        const amountNano = toNano(amountStr);
        const sent = await sendFromEscrow({ to: u.tonAddress, amountNano, comment: `release|task:${taskId}|ts:${Date.now()}` });
        await prisma.task.update({ where: { id: taskId }, data: { bountyStatus: 'PAID' } });
        return res.json({ ok: true, tx: sent || null });
      } finally {
        await prisma.$disconnect().catch(()=>{});
      }
    } catch (e) {
      console.error('[bounty] release-request error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // POST /bounty/refund-request { chatId, ownerAddress, amount, taskId? }
  // NOTE: For now, we just acknowledge request (off-chain) — real refund will be processed by escrow service.
  router.post('/bounty/refund-request', async (req, res) => {
    try {
      const amount = Number(req.body?.amount || 0);
      const owner = String(req.body?.ownerAddress || '').trim();
      if (!Number.isFinite(amount) || amount <= 0) return res.status(422).json({ ok: false, error: 'bad_amount' });
      if (!owner) return res.status(422).json({ ok: false, error: 'owner_required' });
      // Perform TON refund from escrow (without fee)
      const amountNano = toNano(String(amount));
      try {
        const sent = await sendFromEscrow({ to: owner, amountNano, comment: `refund|ts:${Date.now()}` });
        return res.json({ ok: true, tx: sent || null });
      } catch (e) {
        console.error('[bounty] refund tx failed', e);
        return res.status(500).json({ ok: false, error: 'refund_failed' });
      }
    } catch (e) {
      console.error('[bounty] refund-request error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  return router;
}

export default bountyRouter;
