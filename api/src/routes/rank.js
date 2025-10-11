// api/src/routes/rank.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { beginCell, toNano } from '@ton/core';

const prisma = new PrismaClient();
const router = Router();

// Environment variables for TON payments
const FEE_RECIPIENT = process.env.FEE_RECIPIENT || '';

// Helper: build text comment payload for TON transaction
function buildTextCommentPayload(text) {
  return beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc().toString('base64');
}

// Cache for TON/RUB rate (1 minute)
let RATES_CACHE = { ts: 0, tonRub: null };

// Get TON/RUB rate with caching
async function resolveTonRubRate({ allowCache = true } = {}) {
  const now = Date.now();
  if (allowCache && RATES_CACHE.tonRub && now - RATES_CACHE.ts < 60_000) {
    return { rub: RATES_CACHE.tonRub, ts: RATES_CACHE.ts };
  }

  // Helper: fetch JSON using curl (Node.js fetch has issues on this server)
  async function fetchJson(url) {
    try {
      const { execSync } = await import('child_process');
      const result = execSync(`curl -s -H "accept: application/json" "${url}"`, {
        timeout: 5000,
        encoding: 'utf8',
      });
      return JSON.parse(result);
    } catch (e) {
      throw new Error('fetch_failed');
    }
  }

  let rub = null;

  // 1) Coingecko toncoin
  try {
    const j = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=toncoin&vs_currencies=rub');
    rub = Number(j?.toncoin?.rub || null);
    console.log('[Rank Purchase] Coingecko toncoin:', { raw: j, parsed: rub });
  } catch (e) {
    console.log('[Rank Purchase] Coingecko toncoin failed:', e.message);
  }

  // 2) Coingecko the-open-network
  if (!rub || !Number.isFinite(rub) || rub <= 0) {
    try {
      const j2 = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=rub');
      rub = Number(j2?.['the-open-network']?.rub || null);
      console.log('[Rank Purchase] Coingecko the-open-network:', { raw: j2, parsed: rub });
    } catch (e) {
      console.log('[Rank Purchase] Coingecko the-open-network failed:', e.message);
    }
  }

  if (!rub || !Number.isFinite(rub) || rub <= 0) {
    throw new Error('rate_unavailable');
  }

  RATES_CACHE = { ts: Date.now(), tonRub: rub };
  return { rub: RATES_CACHE.tonRub, ts: RATES_CACHE.ts };
}

// Rank order for comparison
const RANK_ORDER = [
  'ANT', 'FISH', 'SCORPION', 'SQUIRREL', 'CAT', 'DOG', 'WOLF', 'BEAR',
  'EAGLE', 'HORSE', 'DRAGON', 'SHARK', 'ELEPHANT', 'TREX', 'TIGER', 'LION'
];

// Rank thresholds (🦅 score required)
const RANK_THRESHOLDS = {
  ANT: 0, FISH: 10, SCORPION: 500, SQUIRREL: 800, CAT: 1100, DOG: 1400,
  WOLF: 1900, BEAR: 2400, EAGLE: 3700, HORSE: 4600, DRAGON: 5700,
  SHARK: 7000, ELEPHANT: 8500, TREX: 10300, TIGER: 12500, LION: 20000
};

// Helper: get rank by score
function getRankByScore(score) {
  let rank = 'ANT';
  for (const [r, threshold] of Object.entries(RANK_THRESHOLDS)) {
    if (score >= threshold) rank = r;
    else break;
  }
  return rank;
}

// Helper: compare ranks (returns higher rank)
function maxRank(rank1, rank2) {
  const idx1 = RANK_ORDER.indexOf(rank1);
  const idx2 = RANK_ORDER.indexOf(rank2);
  return idx1 >= idx2 ? rank1 : rank2;
}

// Helper: get active rank (trial > purchased > earned)
function getActiveRank(user) {
  const now = Date.now();

  // 1. Check trial
  if (user.rankTrialEndsAt && new Date(user.rankTrialEndsAt).getTime() > now) {
    return 'LION';
  }

  // 2. Get earned rank by score
  const earnedRank = getRankByScore(user.rankScore || 0);

  // 3. Compare with purchased rank (take max)
  if (user.rankPurchased) {
    return maxRank(user.rankPurchased, earnedRank);
  }

  return earnedRank;
}

// GET /me/rank?chatId=
router.get('/me/rank', async (req, res) => {
  try {
    const chatId = String(req.query.chatId || '').trim();
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
    const user = await prisma.user.findUnique({ where: { chatId } });
    if (!user) return res.json({ ok: true, rank: 'ANT', score: 0, activeRank: 'ANT' });

    const activeRank = getActiveRank(user);
    const earnedRank = getRankByScore(user.rankScore || 0);

    return res.json({
      ok: true,
      rank: user.rank || 'ANT', // saved rank (legacy)
      score: user.rankScore || 0,
      activeRank, // actual current rank
      earnedRank, // rank by score
      purchasedRank: user.rankPurchased || null,
      trialEndsAt: user.rankTrialEndsAt || null,
      updatedAt: user.rankUpdatedAt || null
    });
  } catch (e) {
    console.error('GET /me/rank error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// POST /me/rank  { chatId, rank } (legacy - free rank selection)
router.post('/me/rank', async (req, res) => {
  try {
    const chatId = String(req.body?.chatId || '').trim();
    const rank = String(req.body?.rank || '').trim();
    if (!chatId || !rank) return res.status(400).json({ ok: false, error: 'chatId_and_rank_required' });
    const now = new Date();
    const user = await prisma.user.upsert({
      where: { chatId },
      create: { chatId, rank: rank, rankUpdatedAt: now, rankTrialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      update: { rank: rank, rankUpdatedAt: now },
    });
    return res.json({ ok: true, rank: user.rank, updatedAt: user.rankUpdatedAt });
  } catch (e) {
    console.error('POST /me/rank error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// Rank prices in RUB
const RANK_PRICES_RUB = {
  FISH: 1000,
  SCORPION: 5000,
  SQUIRREL: 10000,
  CAT: 15000,
  DOG: 20000,
  WOLF: 30000,
  BEAR: 40000,
  EAGLE: 50000,
  HORSE: 60000,
  DRAGON: 70000,
  SHARK: 80000,
  ELEPHANT: 90000,
  TREX: 95000,
  TIGER: 98000,
  LION: 100000,
};

// GET /me/rank/prices - get rank prices
router.get('/me/rank/prices', async (req, res) => {
  try {
    return res.json({ ok: true, prices: RANK_PRICES_RUB });
  } catch (e) {
    console.error('GET /me/rank/prices error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// POST /me/rank/purchase - create purchase record
router.post('/me/rank/purchase', async (req, res) => {
  try {
    const { chatId, rank } = req.body;
    if (!chatId || !rank) {
      return res.status(400).json({ ok: false, error: 'chatId_and_rank_required' });
    }

    // Validate rank
    if (!RANK_PRICES_RUB[rank]) {
      return res.status(400).json({ ok: false, error: 'invalid_rank' });
    }

    const rubAmount = RANK_PRICES_RUB[rank];

    // Create purchase record
    const purchase = await prisma.rankPurchase.create({
      data: {
        chatId: String(chatId),
        rank,
        rubAmount: String(rubAmount),
        tonAmount: '0', // will be filled by payment request
        status: 'pending',
      },
    });

    return res.json({
      ok: true,
      purchase: {
        id: purchase.id,
        rank: purchase.rank,
        rubAmount: purchase.rubAmount,
        status: purchase.status,
      },
    });
  } catch (error) {
    console.error('[Rank Purchase] create error:', error);
    return res.status(500).json({ ok: false, error: 'internal_error', message: error.message });
  }
});

// POST /me/rank/purchase/:purchaseId/confirm - confirm purchase with transaction hash
router.post('/me/rank/purchase/:purchaseId/confirm', async (req, res) => {
  try {
    const { purchaseId } = req.params;
    const { tonTxHash } = req.body;

    if (!tonTxHash) {
      return res.status(400).json({ ok: false, error: 'tonTxHash_required' });
    }

    const purchase = await prisma.rankPurchase.findUnique({
      where: { id: purchaseId },
    });

    if (!purchase) {
      return res.status(404).json({ ok: false, error: 'purchase_not_found' });
    }

    if (purchase.status !== 'pending') {
      return res.status(400).json({ ok: false, error: 'purchase_already_processed' });
    }

    // Update purchase and user in transaction
    await prisma.$transaction(async (tx) => {
      // Update purchase
      await tx.rankPurchase.update({
        where: { id: purchaseId },
        data: {
          status: 'completed',
          tonTxHash,
          completedAt: new Date(),
        },
      });

      // Update user rank
      await tx.user.update({
        where: { chatId: purchase.chatId },
        data: {
          rankPurchased: purchase.rank,
          rankPurchasedAt: new Date(),
        },
      });
    });

    return res.json({ ok: true, message: 'Rank purchased successfully' });
  } catch (error) {
    console.error('[Rank Purchase] confirm error:', error);
    return res.status(500).json({ ok: false, error: 'internal_error', message: error.message });
  }
});

// POST /me/rank/payment-request - create TON payment transaction
router.post('/me/rank/payment-request', async (req, res) => {
  try {
    const { chatId, rubAmount, purchaseId } = req.body;

    if (!chatId || !rubAmount) {
      return res.status(400).json({ ok: false, error: 'missing_parameters' });
    }

    if (!FEE_RECIPIENT) {
      return res.status(500).json({ ok: false, error: 'recipient_not_configured' });
    }

    // Parse RUB amount
    const rub = parseFloat(rubAmount);
    if (!Number.isFinite(rub) || rub <= 0) {
      return res.status(422).json({ ok: false, error: 'invalid_amount' });
    }

    // Get current TON/RUB rate
    let tonRubRate;
    try {
      const rate = await resolveTonRubRate({ allowCache: true });
      tonRubRate = rate.rub;
    } catch (error) {
      console.error('[Rank Purchase] Failed to get TON/RUB rate:', error);
      return res.status(503).json({
        ok: false,
        error: 'rate_unavailable',
        message: 'Не удалось получить курс TON/RUB. Попробуйте позже.',
      });
    }

    // Convert RUB to TON
    const tonAmount = rub / tonRubRate;

    // Limit to 9 decimal places
    const tonAmountStr = tonAmount.toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
    const amountNano = toNano(tonAmountStr);

    // Create comment for transaction
    const comment = `rank|chatId:${chatId}${purchaseId ? `|purchase:${purchaseId}` : ''}|ts:${Date.now()}`;
    const payload = buildTextCommentPayload(comment);

    // Build transaction for TonConnect (simple TON transfer)
    const validUntil = Math.floor(Date.now() / 1000) + 600; // 10 minutes
    const transaction = {
      validUntil,
      messages: [
        {
          address: FEE_RECIPIENT,
          amount: amountNano.toString(),
          payload,
        },
      ],
    };

    // Update purchase with TON amount
    if (purchaseId) {
      await prisma.rankPurchase.update({
        where: { id: purchaseId },
        data: { tonAmount: tonAmountStr },
      });
    }

    console.log('[Rank Purchase] TON payment-request:', {
      chatId,
      rubAmount: rub,
      tonRubRate,
      tonAmount: tonAmountStr,
      amountNano: amountNano.toString(),
      recipient: FEE_RECIPIENT,
      purchaseId,
    });

    return res.json({
      ok: true,
      transaction,
      purchaseId,
      tonAmount: tonAmountStr,
      tonRubRate,
    });
  } catch (error) {
    console.error('[Rank Purchase] payment-request error:', error);

    const errorMsg = String(error?.message || 'internal_error');
    if (errorMsg === 'rate_unavailable') {
      return res.status(503).json({
        ok: false,
        error: errorMsg,
        message: 'Не удалось получить курс TON/RUB. Попробуйте позже.',
      });
    }

    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message,
    });
  }
});

// GET /me/rank/rates - get current TON/RUB rate
router.get('/me/rank/rates', async (req, res) => {
  try {
    const r = await resolveTonRubRate({ allowCache: true });
    return res.json({ ok: true, tonRub: r.rub, updatedAt: r.ts });
  } catch (e) {
    if (String(e?.message || '').includes('rate_unavailable')) {
      return res.status(503).json({ ok: false, error: 'rate_unavailable' });
    }
    console.error('[Rank Purchase] rates error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

export { router as rankRouter };

