/**
 * OpenAI Service для AI-помощника создания процессов
 *
 * Отвечает за:
 * - Генерацию диалога с пользователем
 * - Создание структурированного описания процесса
 * - Парсинг DSL в JSON-структуру
 * - Учет использованных токенов
 */

import { hasEnoughTokens, recordUsage } from './ai-tokens.js';

// System prompt для GPT-4
const SYSTEM_PROMPT = `Ты — помощник по созданию процессов и планированию задач в системе управления проектами.

Твоя задача:
1. Задавать уточняющие вопросы пользователю о его процессе
2. Узнать:
   - Какова цель процесса?
   - Кто будет участвовать?
   - Какие этапы нужны?
   - Есть ли дедлайны?
   - Нужны ли условия (согласование, фото, документы)?
   - Есть ли зависимости между задачами?
   - Нужна ли оплата за задачи?
3. После 2-4 раундов вопросов предложить готовый процесс

ВАЖНО: Когда процесс готов, начни ответ с маркера [PROCESS_READY] и дай краткое описание процесса.

Формат DSL для процессов:
- @->@ = запустить когда предыдущая готова
- ×->@ = запустить когда предыдущая отменена
- ×->× = отменить когда предыдущая отменена
- @->@* = запустить когда ВСЕ связи готовы
- @->@[id1,id2] = запустить когда выбранные готовы
- @[дата,время]ФИО (текст) = плановое создание

Признаки задач:
- 🚩[дата время] = дедлайн
- ⏰[дата время] (фио) = напоминание
- ⚫[1-10] = сложность
- 💶(сумма) = оплата
- ☝️ = нужно согласование
- [🤳] = нужно фото
- ☝️🤳 = фото + согласование
- 📄 = нужен документ
- ☝️📄 = документ + согласование

Пример:
Иван 🚩[05.10.2025 09:00] ⚫[3] (купить продукты) @->@ Мария ⚫[5] ☝️ (приготовить еду)

Будь дружелюбным, задавай вопросы по одному, не перегружай пользователя.`;

/**
 * Генерирует ответ от AI на основе контекста и истории сообщений
 * @param {Object} params
 * @param {Object} params.prisma - Prisma client
 * @param {string} params.chatId - ID пользователя
 * @param {string} params.groupId - ID группы (опционально)
 * @param {Array} params.messages - История сообщений [{role, content}]
 * @param {Object} params.context - Контекст группы и участников
 * @returns {Promise<{reply: string, isComplete: boolean, processDescription?: string, tokensUsed?: number}>}
 */
export async function generateAIResponse({ prisma, chatId, groupId, messages, context }) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Проверяем баланс токенов (примерно 1000 токенов на запрос)
    const hasBalance = await hasEnoughTokens(prisma, chatId, 1000);
    if (!hasBalance) {
      throw new Error('INSUFFICIENT_TOKENS');
    }

    // Формируем системное сообщение с контекстом
    const systemMessage = {
      role: 'system',
      content: `${SYSTEM_PROMPT}

Контекст группы:
${context.groupInfo ? `Название: ${context.groupInfo.title}
Описание: ${context.groupInfo.description || 'Нет описания'}` : 'Личная группа'}

Участники (${context.members.length}):
${context.members.map(m => `- ${m.name}${m.role ? ` (${m.role})` : ''}${m.description ? `: ${m.description}` : ''}`).join('\n')}

Существующие задачи: ${context.existingTasksCount || 0}`,
    };

    // Вызов OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [systemMessage, ...messages],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[OpenAI] API error:', error);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiReply = data.choices[0]?.message?.content || 'Произошла ошибка';

    // Получаем информацию о токенах из ответа
    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || 0;

    // Записываем использование токенов
    if (totalTokens > 0) {
      try {
        await recordUsage(prisma, {
          chatId,
          groupId,
          inputTokens,
          outputTokens,
          model: 'gpt-4o-mini',
          promptType: 'process',
        });
      } catch (usageError) {
        console.error('[OpenAI] Failed to record token usage:', usageError);
        // Не прерываем выполнение, если не удалось записать usage
      }
    }

    // Проверяем, готов ли процесс
    const isComplete = aiReply.includes('[PROCESS_READY]');
    let processDescription = null;

    if (isComplete) {
      // Извлекаем описание процесса (убираем маркер)
      processDescription = aiReply.replace('[PROCESS_READY]', '').trim();
    }

    return {
      reply: isComplete ? processDescription : aiReply,
      isComplete,
      processDescription: isComplete ? processDescription : null,
      tokensUsed: totalTokens,
    };
  } catch (error) {
    console.error('[OpenAI] generateAIResponse error:', error);
    throw error;
  }
}

/**
 * Парсит текстовое описание процесса в JSON структуру
 * (пока заглушка, будет реализовано позже)
 * @param {string} processText - Текстовое описание процесса
 * @returns {Object} Структура процесса
 */
export function parseProcessDSL(processText) {
  // TODO: Реализовать парсинг DSL
  // Пока возвращаем сырой текст
  return {
    raw: processText,
    parsed: null, // Здесь будет массив узлов и связей
  };
}
