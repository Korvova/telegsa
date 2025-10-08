/**
 * API routes для AI-помощника создания процессов и управления токенами
 */

import { Router } from 'express';
import { beginCell, Address, toNano } from '@ton/core';
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

  // Environment variables for TON payments
  const FEE_RECIPIENT = process.env.FEE_RECIPIENT || '';
  const TONAPI_BASE_URL = process.env.TONAPI_BASE_URL || 'https://tonapi.io';
  const TONAPI_KEY = process.env.TONAPI_KEY || '';

  // Cache for TON/USD rate (1 minute)
  let RATES_CACHE = { ts: 0, tonUsd: null };

  // ======== Helper functions for TON payments ========

  /**
   * Get TON/USD rate with caching and fallback strategies
   * Similar to bounty's resolveTonRubRate but for USD
   */
  async function resolveTonUsdRate({ allowCache = true } = {}) {
    const now = Date.now();
    if (allowCache && RATES_CACHE.tonUsd && now - RATES_CACHE.ts < 60_000) {
      return { usd: RATES_CACHE.tonUsd, ts: RATES_CACHE.ts };
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

    let usd = null;

    // 1) Coingecko toncoin
    try {
      const j = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=toncoin&vs_currencies=usd');
      usd = Number(j?.toncoin?.usd || null);
      console.log('[AI Tokens] Coingecko toncoin:', { raw: j, parsed: usd });
    } catch (e) {
      console.log('[AI Tokens] Coingecko toncoin failed:', e.message);
    }

    // 2) Coingecko the-open-network
    if (!usd || !Number.isFinite(usd) || usd <= 0) {
      try {
        const j2 = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd');
        usd = Number(j2?.['the-open-network']?.usd || null);
        console.log('[AI Tokens] Coingecko the-open-network:', { raw: j2, parsed: usd });
      } catch (e) {
        console.log('[AI Tokens] Coingecko the-open-network failed:', e.message);
      }
    }

    // 3) TonAPI
    if ((!usd || !Number.isFinite(usd) || usd <= 0) && TONAPI_KEY) {
      try {
        const r = await fetch(`${TONAPI_BASE_URL}/v2/rates?tokens=ton`, {
          headers: { Authorization: `Bearer ${TONAPI_KEY}` },
        });
        if (r.ok) {
          const j3 = await r.json();
          const rate = j3?.rates?.TON || j3?.rates?.ton || j3?.rates?.[0];
          const maybeUsd = rate?.prices?.USD || rate?.usd || null;
          if (maybeUsd) usd = Number(maybeUsd);
          console.log('[AI Tokens] TonAPI:', { raw: j3, rate, maybeUsd, parsed: usd });
        } else {
          console.log('[AI Tokens] TonAPI failed:', r.status);
        }
      } catch (e) {
        console.log('[AI Tokens] TonAPI error:', e.message);
      }
    }

    if (!usd || !Number.isFinite(usd) || usd <= 0) {
      throw new Error('rate_unavailable');
    }

    RATES_CACHE = { ts: Date.now(), tonUsd: usd };
    return { usd: RATES_CACHE.tonUsd, ts: RATES_CACHE.ts };
  }

  /**
   * Build text comment payload for TON transfer
   */
  function buildTextCommentPayload(text) {
    const cell = beginCell().storeUint(0, 32).storeStringTail(text || '').endCell();
    return cell.toBoc({ idx: false }).toString('base64');
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
   * GET /ai/tokens/rates
   * Получить текущий курс TON/USD
   */
  router.get('/ai/tokens/rates', async (_req, res) => {
    try {
      const r = await resolveTonUsdRate({ allowCache: true });
      return res.json({ ok: true, tonUsd: r.usd, updatedAt: r.ts });
    } catch (e) {
      if (String(e?.message || '').includes('rate_unavailable')) {
        return res.status(503).json({ ok: false, error: 'rate_unavailable' });
      }
      console.error('[AI Tokens] rates error', e);
      res.status(500).json({ ok: false, error: 'internal' });
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
   * Генерация TON транзакции для оплаты (простой TON transfer, как в bounty)
   *
   * ВАЖНО: В отличие от bounty, здесь деньги идут НАПРЯМУЮ к FEE_RECIPIENT,
   * а не через escrow. Это реальные деньги для пополнения OpenAI API.
   */
  router.post('/ai/tokens/payment-request', async (req, res) => {
    try {
      const { chatId, amountUsd, purchaseId } = req.body;

      if (!chatId || !amountUsd) {
        return res.status(400).json({ ok: false, error: 'missing_parameters' });
      }

      if (!FEE_RECIPIENT) {
        return res.status(500).json({ ok: false, error: 'recipient_not_configured' });
      }

      // Парсим сумму USD
      const usd = parseFloat(amountUsd);
      if (!Number.isFinite(usd) || usd <= 0) {
        return res.status(422).json({ ok: false, error: 'invalid_amount' });
      }

      // Получаем текущий курс TON/USD
      let tonUsdRate;
      try {
        const rate = await resolveTonUsdRate({ allowCache: true });
        tonUsdRate = rate.usd;
      } catch (error) {
        console.error('[AI Tokens] Failed to get TON/USD rate:', error);
        return res.status(503).json({
          ok: false,
          error: 'rate_unavailable',
          message: 'Не удалось получить курс TON/USD. Попробуйте позже.',
        });
      }

      // Конвертируем USD в TON
      const tonAmount = usd / tonUsdRate;

      // Ограничиваем до 9 знаков после запятой
      const tonAmountStr = tonAmount.toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
      const amountNano = toNano(tonAmountStr);

      // Создаем комментарий для транзакции
      const comment = `ai-tokens|chatId:${chatId}${purchaseId ? `|purchase:${purchaseId}` : ''}|ts:${Date.now()}`;
      const payload = buildTextCommentPayload(comment);

      // Формируем транзакцию для TonConnect (простой TON transfer)
      const validUntil = Math.floor(Date.now() / 1000) + 600; // 10 минут
      const transaction = {
        validUntil,
        messages: [
          {
            address: FEE_RECIPIENT, // НАПРЯМУЮ к владельцу!
            amount: amountNano.toString(),
            payload,
          },
        ],
      };

      console.log('[AI Tokens] TON payment-request:', {
        chatId,
        amountUsd: usd,
        tonUsdRate,
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
        tonUsdRate,
      });
    } catch (error) {
      console.error('[AI Tokens] payment-request error:', error);

      const errorMsg = String(error?.message || 'internal_error');
      if (errorMsg === 'rate_unavailable') {
        return res.status(503).json({
          ok: false,
          error: errorMsg,
          message: 'Не удалось получить курс TON/USD. Попробуйте позже.',
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
   * POST /ai/tokens/process-pending
   * Автоматически обработать pending покупки (найти транзакции в блокчейне)
   */
  router.post('/ai/tokens/process-pending', async (req, res) => {
    try {
      const { chatId } = req.body;

      if (!chatId) {
        return res.status(400).json({ ok: false, error: 'chatId_required' });
      }

      // Получаем pending покупки пользователя
      const pendingPurchases = await prisma.aITokenPurchase.findMany({
        where: {
          chatId,
          status: 'pending',
          createdAt: {
            gte: new Date(Date.now() - 10 * 60 * 1000), // последние 10 минут
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      if (pendingPurchases.length === 0) {
        return res.json({ ok: true, processed: 0, message: 'No pending purchases' });
      }

      // Получаем адрес пользователя
      const user = await prisma.user.findUnique({
        where: { chatId },
        select: { tonAddress: true },
      });

      if (!user?.tonAddress) {
        return res.json({ ok: true, processed: 0, message: 'No TON address' });
      }

      // Получаем последние транзакции пользователя через curl (fetch не работает)
      let transactions = [];
      try {
        const { execSync } = await import('child_process');
        const result = execSync(
          `curl -s "https://tonapi.io/v2/blockchain/accounts/${user.tonAddress}/transactions?limit=20" -H "Authorization: Bearer ${TONAPI_KEY}"`,
          { timeout: 10000, encoding: 'utf8' }
        );
        const data = JSON.parse(result);
        transactions = data?.transactions || [];
      } catch (e) {
        console.error('[AI Tokens] Failed to fetch transactions:', e.message);
        return res.status(503).json({ ok: false, error: 'tonapi_failed' });
      }

      // Ищем транзакции с комментарием "ai-tokens"
      let processed = 0;
      for (const tx of transactions) {
        const outMsgs = tx.out_msgs || [];
        for (const msg of outMsgs) {
          const comment =
            msg?.decoded_body?.text ||
            msg?.decoded_body?.message_internal?.body?.value?.value?.text ||
            '';

          if (comment.includes('ai-tokens')) {
            // Извлекаем purchaseId из комментария
            const match = comment.match(/purchase:([a-z0-9]+)/);
            if (match) {
              const purchaseId = match[1];
              const purchase = pendingPurchases.find((p) => p.id === purchaseId);

              if (purchase) {
                try {
                  await confirmPurchase(prisma, purchaseId, tx.hash);
                  processed++;
                  console.log(`[AI Tokens] Auto-confirmed purchase ${purchaseId}, tx ${tx.hash}`);
                } catch (e) {
                  console.error(`[AI Tokens] Failed to confirm ${purchaseId}:`, e.message);
                }
              }
            }
          }
        }
      }

      return res.json({
        ok: true,
        processed,
        message: `Processed ${processed} of ${pendingPurchases.length} pending purchases`,
      });
    } catch (error) {
      console.error('[AI Tokens] process-pending error:', error);
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
