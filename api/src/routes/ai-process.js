/**
 * API routes для AI-помощника создания процессов и управления токенами
 */

import { Router } from 'express';
import { beginCell, Address, Cell } from '@ton/core';
import { generateAIResponse } from '../services/openai.js';
import {
  getBalance,
  getUsageHistory,
  createPurchase,
  confirmPurchase,
  getPurchasePackages,
} from '../services/ai-tokens.js';

export function aiProcessRouter({ prisma }) {
  const router = Router();

  // Environment variables for TON/USDT payments
  const FEE_RECIPIENT = process.env.FEE_RECIPIENT || '';
  const NETWORK = (process.env.TON_NETWORK || 'mainnet').toLowerCase();
  const USDT_MASTER = NETWORK === 'mainnet'
    ? (process.env.TON_USDT_MASTER_MAINNET || '')
    : (process.env.TON_USDT_MASTER_TESTNET || '');
  const TONAPI_BASE_URL = process.env.TONAPI_BASE_URL || 'https://tonapi.io';
  const TONAPI_KEY = process.env.TONAPI_KEY || '';

  // ======== Helper functions for TON/USDT payments ========

  /**
   * Helper: normalize address to friendly format
   */
  function normalizeFriendly(addr) {
    try {
      return Address.parse(addr).toString();
    } catch {
      return String(addr);
    }
  }

  /**
   * Helper: normalize address to raw format
   */
  function normalizeRaw(addr) {
    try {
      return Address.parse(addr).toRawString();
    } catch {
      return String(addr);
    }
  }

  /**
   * Helper: normalize address to URL-safe friendly format
   */
  function friendlyUrlSafe(addr) {
    try {
      return Address.parse(addr).toString({ urlSafe: true });
    } catch {
      return String(addr);
    }
  }

  /**
   * Helper: fetch JSON from TonAPI with auth
   */
  async function tonapi(path, params) {
    const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
    const url = `${TONAPI_BASE_URL}${path}${qs}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${TONAPI_KEY}` },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[tonapi]', r.status, url, txt?.slice?.(0, 300));
      throw new Error(`tonapi_failed_${r.status}`);
    }
    return r.json();
  }

  /**
   * Helper: POST to TonAPI
   */
  async function tonapiPost(path, body) {
    const url = `${TONAPI_BASE_URL}${path}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TONAPI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[tonapi-post]', r.status, url, txt?.slice?.(0, 300));
      throw new Error(`tonapi_failed_${r.status}`);
    }
    return r.json();
  }

  /**
   * Helper: try multiple TonAPI endpoints (for API version compatibility)
   */
  async function tonapiPostTry(paths, body) {
    let lastErr = null;
    for (const p of paths) {
      try {
        return await tonapiPost(p, body);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('tonapi_failed');
  }

  /**
   * Get user's jetton wallet address for a given jetton master
   * Uses multiple fallback strategies to resolve the wallet address
   */
  async function getUserJettonWallet(owner, jettonMaster) {
    // 0) Try runGetMethod(get_wallet_address) on jetton master — works even if wallet not deployed
    try {
      const ownerCell = beginCell().storeAddress(Address.parse(owner)).endCell();
      const body = {
        address: normalizeFriendly(jettonMaster),
        method: 'get_wallet_address',
        stack: [
          {
            type: 'slice',
            cell: ownerCell.toBoc({ idx: false }).toString('base64'),
          },
        ],
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
          const addr = slice.loadAddress?.() || slice.readAddress?.();
          if (addr) return addr.toString();
        } catch {}
      }

      // Some TonAPI deployments return stack as array of arrays: [["tvm.Slice", "base64..."]]
      if (Array.isArray(res?.stack) && Array.isArray(res.stack[0]) && typeof res.stack[0][1] === 'string') {
        try {
          const cell = Cell.fromBase64(res.stack[0][1]);
          const slice = cell.beginParse();
          const addr = slice.loadAddress?.() || slice.readAddress?.();
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
      const w = await tonapi('/v2/jettons/wallets', {
        account: ownerFriendlyUrl,
        jetton: jettonFriendlyUrl,
      });
      const addr =
        w?.addresses?.[0]?.address ||
        w?.addresses?.[0] ||
        w?.address ||
        (w?.wallets && w.wallets[0]?.address);
      if (addr) return normalizeFriendly(addr);
    } catch (e) {
      console.warn('[tonapi] jettons/wallets?account= failed, try owner=');
      try {
        const w2 = await tonapi('/v2/jettons/wallets', {
          owner: ownerFriendlyUrl,
          jetton: jettonFriendlyUrl,
        });
        const addr2 =
          w2?.addresses?.[0]?.address ||
          w2?.addresses?.[0] ||
          w2?.address ||
          (w2?.wallets && w2.wallets[0]?.address);
        if (addr2) return normalizeFriendly(addr2);
      } catch {}
    }

    throw new Error('jetton_wallet_not_found');
  }

  /**
   * Build jetton transfer payload for USDT (6 decimals)
   * @param {Object} params
   * @param {string} params.amountUnits - Amount in jetton units (for USDT: amount * 1_000_000)
   * @param {string} params.to - Destination address (FEE_RECIPIENT)
   * @param {string} params.responseTo - Address for excess TON return (user's wallet)
   * @param {string} params.fwdAmountNano - Forward amount in nanoTON (for notification)
   * @param {string} params.comment - Comment for the transfer
   */
  function buildJettonTransferPayload({ amountUnits, to, responseTo, fwdAmountNano, comment }) {
    const op = 0x0f8a7ea5; // jetton transfer op code
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

  // ======== API Routes ========

  /**
   * POST /ai/process/message
   * Отправить сообщение AI и получить ответ
   */
  router.post('/ai/process/message', async (req, res) => {
    try {
      const { chatId, groupId, messages } = req.body;

      if (!chatId) {
        return res.status(400).json({ ok: false, error: 'chatId_required' });
      }

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ ok: false, error: 'messages_required' });
      }

      // Собираем контекст группы и участников
      const context = await buildContext(prisma, chatId, groupId);

      // Генерируем ответ от AI
      const aiResponse = await generateAIResponse({
        prisma,
        chatId,
        groupId,
        messages,
        context,
      });

      return res.json({
        ok: true,
        reply: aiResponse.reply,
        isComplete: aiResponse.isComplete,
        processDescription: aiResponse.processDescription,
        tokensUsed: aiResponse.tokensUsed,
      });
    } catch (error) {
      console.error('[AI Process] message error:', error);

      // Специальная обработка ошибки недостаточного баланса
      if (error.message === 'INSUFFICIENT_TOKENS') {
        return res.status(402).json({
          ok: false,
          error: 'insufficient_tokens',
          message: 'Недостаточно токенов для выполнения запроса',
        });
      }

      return res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: error.message,
      });
    }
  });

  /**
   * POST /ai/process/create
   * Создать процесс на основе описания от AI
   * (пока заглушка, будет реализовано позже)
   */
  router.post('/ai/process/create', async (req, res) => {
    try {
      const { chatId, groupId, processDescription } = req.body;

      if (!chatId || !processDescription) {
        return res.status(400).json({ ok: false, error: 'missing_parameters' });
      }

      // TODO: Парсинг processDescription и создание узлов/связей
      // Пока возвращаем успех без реального создания
      console.log('[AI Process] create process:', { chatId, groupId, processDescription });

      return res.json({
        ok: true,
        message: 'Process creation will be implemented',
        processId: null, // TODO: вернуть ID созданного процесса
      });
    } catch (error) {
      console.error('[AI Process] create error:', error);
      return res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: error.message,
      });
    }
  });

  /**
   * GET /ai/tokens/balance
   * Получить баланс токенов пользователя
   */
  router.get('/ai/tokens/balance', async (req, res) => {
    try {
      const { chatId } = req.query;

      if (!chatId) {
        return res.status(400).json({ ok: false, error: 'chatId_required' });
      }

      const balanceData = await getBalance(prisma, chatId);

      return res.json({
        ok: true,
        ...balanceData,
      });
    } catch (error) {
      console.error('[AI Tokens] balance error:', error);
      return res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: error.message,
      });
    }
  });

  /**
   * GET /ai/tokens/usage
   * Получить историю использования токенов
   */
  router.get('/ai/tokens/usage', async (req, res) => {
    try {
      const { chatId, limit = 10 } = req.query;

      if (!chatId) {
        return res.status(400).json({ ok: false, error: 'chatId_required' });
      }

      const history = await getUsageHistory(prisma, chatId, parseInt(limit));

      return res.json({
        ok: true,
        ...history,
      });
    } catch (error) {
      console.error('[AI Tokens] usage error:', error);
      return res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: error.message,
      });
    }
  });

  /**
   * GET /ai/tokens/packages
   * Получить доступные пакеты для покупки
   */
  router.get('/ai/tokens/packages', async (req, res) => {
    try {
      const packages = getPurchasePackages();

      return res.json({
        ok: true,
        packages,
      });
    } catch (error) {
      console.error('[AI Tokens] packages error:', error);
      return res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: error.message,
      });
    }
  });

  /**
   * POST /ai/tokens/purchase
   * Создать запрос на пополнение токенов
   */
  router.post('/ai/tokens/purchase', async (req, res) => {
    try {
      const { chatId, usdtAmount } = req.body;

      if (!chatId || !usdtAmount) {
        return res.status(400).json({ ok: false, error: 'missing_parameters' });
      }

      const purchase = await createPurchase(prisma, chatId, usdtAmount);

      return res.json({
        ok: true,
        purchase,
      });
    } catch (error) {
      console.error('[AI Tokens] purchase error:', error);
      return res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: error.message,
      });
    }
  });

  /**
   * POST /ai/tokens/payment-request
   * Генерация TON транзакции для оплаты USDT
   *
   * ВАЖНО: В отличие от bounty, здесь деньги идут НАПРЯМУЮ к FEE_RECIPIENT,
   * а не через escrow. Это реальные деньги для пополнения OpenAI API.
   */
  router.post('/ai/tokens/payment-request', async (req, res) => {
    try {
      const { chatId, ownerAddress, usdtAmount, purchaseId } = req.body;

      if (!chatId || !ownerAddress || !usdtAmount) {
        return res.status(400).json({ ok: false, error: 'missing_parameters' });
      }

      if (!FEE_RECIPIENT) {
        return res.status(500).json({ ok: false, error: 'recipient_not_configured' });
      }

      if (!USDT_MASTER) {
        return res.status(500).json({ ok: false, error: 'usdt_master_not_configured' });
      }

      // Парсим сумму USDT (например "0.50" → 500000 units)
      const usdtAmountFloat = parseFloat(usdtAmount);
      if (!Number.isFinite(usdtAmountFloat) || usdtAmountFloat <= 0) {
        return res.status(422).json({ ok: false, error: 'invalid_usdt_amount' });
      }

      // USDT имеет 6 decimals
      const usdtUnits = Math.floor(usdtAmountFloat * 1_000_000);

      console.log('[AI Tokens] payment-request:', {
        chatId,
        ownerAddress,
        usdtAmount,
        usdtUnits,
        purchaseId,
      });

      // 1) Получаем USDT jetton wallet адрес пользователя
      let userJettonWallet;
      try {
        userJettonWallet = await getUserJettonWallet(ownerAddress, USDT_MASTER);
        console.log('[AI Tokens] User jetton wallet:', userJettonWallet);
      } catch (error) {
        console.error('[AI Tokens] Failed to get jetton wallet:', error);
        return res.status(422).json({
          ok: false,
          error: 'jetton_wallet_not_found',
          message: 'USDT кошелек не найден. Пополните USDT баланс в вашем кошельке.',
        });
      }

      // 2) Создаем payload для jetton transfer
      // Отправляем USDT напрямую на FEE_RECIPIENT (не escrow!)
      const comment = `ai-tokens|chatId:${chatId}${purchaseId ? `|purchase:${purchaseId}` : ''}|ts:${Date.now()}`;
      const fwdAmountNano = '1'; // минимальная сумма для notification

      const jettonPayload = buildJettonTransferPayload({
        amountUnits: String(usdtUnits),
        to: FEE_RECIPIENT, // НАПРЯМУЮ к владельцу, не escrow!
        responseTo: ownerAddress, // возврат излишков TON пользователю
        fwdAmountNano,
        comment,
      });

      // 3) Формируем транзакцию для TonConnect
      // Пользователь отправляет сообщение на СВОЙ jetton wallet с инструкцией transfer
      const validUntil = Math.floor(Date.now() / 1000) + 300; // 5 минут
      const gasAmount = '50000000'; // 0.05 TON для газа jetton transfer

      const transaction = {
        validUntil,
        messages: [
          {
            address: userJettonWallet, // отправляем на СВОЙ jetton wallet
            amount: gasAmount,
            payload: jettonPayload, // BOC с инструкцией transfer
          },
        ],
      };

      console.log('[AI Tokens] Transaction created:', {
        userJettonWallet,
        gasAmount,
        recipient: FEE_RECIPIENT,
        usdtUnits,
      });

      return res.json({
        ok: true,
        transaction,
        purchaseId,
      });
    } catch (error) {
      console.error('[AI Tokens] payment-request error:', error);

      // Специальная обработка ошибок TonAPI
      const errorMsg = String(error?.message || 'internal_error');
      if (errorMsg.startsWith('tonapi_failed_')) {
        return res.status(422).json({
          ok: false,
          error: errorMsg,
          message: 'Ошибка связи с TON API. Попробуйте позже.',
        });
      }

      if (errorMsg === 'jetton_wallet_not_found') {
        return res.status(422).json({
          ok: false,
          error: errorMsg,
          message: 'USDT кошелек не найден. Пополните USDT баланс в вашем кошельке.',
        });
      }

      return res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: error.message,
      });
    }
  });

  /**
   * POST /ai/tokens/purchase/:id/confirm
   * Подтвердить пополнение (admin only)
   */
  router.post('/ai/tokens/purchase/:id/confirm', async (req, res) => {
    try {
      const { id } = req.params;
      const { tonTxHash } = req.body;

      if (!tonTxHash) {
        return res.status(400).json({ ok: false, error: 'tx_hash_required' });
      }

      const result = await confirmPurchase(prisma, id, tonTxHash);

      return res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      console.error('[AI Tokens] confirm error:', error);
      return res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: error.message,
      });
    }
  });

  return router;
}

/**
 * Собирает контекст для AI: информация о группе, участниках, задачах
 */
async function buildContext(prisma, chatId, groupId) {
  const context = {
    groupInfo: null,
    members: [],
    existingTasksCount: 0,
  };

  try {
    // Если это групповой процесс
    if (groupId) {
      // Получаем информацию о группе
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: {
          title: true,
          description: true,
        },
      });

      if (group) {
        context.groupInfo = {
          title: group.title,
          description: group.description,
        };
      }

      // Получаем участников группы с описаниями
      const members = await prisma.groupMember.findMany({
        where: { groupId },
        select: {
          chatId: true,
          role: true,
          description: true,
        },
      });

      // Дополняем данными пользователей
      const chatIds = members.map((m) => m.chatId);
      const users = await prisma.user.findMany({
        where: { chatId: { in: chatIds } },
        select: {
          chatId: true,
          firstName: true,
          lastName: true,
          username: true,
        },
      });

      const userMap = new Map(users.map((u) => [u.chatId, u]));

      context.members = members.map((m) => {
        const user = userMap.get(m.chatId);
        const name = user
          ? [user.firstName, user.lastName].filter(Boolean).join(' ') ||
            user.username ||
            m.chatId
          : m.chatId;

        return {
          chatId: m.chatId,
          name,
          role: m.role,
          description: m.description,
        };
      });

      // Считаем существующие задачи в группе
      const groupPrefix = `${groupId}::`;
      context.existingTasksCount = await prisma.task.count({
        where: {
          column: {
            name: { startsWith: groupPrefix },
          },
        },
      });
    } else {
      // Личная доска - только текущий пользователь
      const user = await prisma.user.findUnique({
        where: { chatId },
        select: {
          firstName: true,
          lastName: true,
          username: true,
        },
      });

      const name = user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ') ||
          user.username ||
          chatId
        : chatId;

      context.members = [
        {
          chatId,
          name,
          role: 'owner',
          description: null,
        },
      ];

      // Считаем задачи на личной доске
      context.existingTasksCount = await prisma.task.count({
        where: {
          chatId,
          column: {
            name: { not: { contains: '::' } },
          },
        },
      });
    }
  } catch (error) {
    console.error('[AI Process] buildContext error:', error);
    // Возвращаем пустой контекст в случае ошибки
  }

  return context;
}
