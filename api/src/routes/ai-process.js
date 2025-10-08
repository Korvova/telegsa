/**
 * API routes для AI-помощника создания процессов и управления токенами
 */

import { Router } from 'express';
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
