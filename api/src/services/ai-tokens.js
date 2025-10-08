/**
 * AI Tokens Service
 * Управление балансом AI токенов, учет использования и пополнения
 */

// Цены OpenAI GPT-4o mini за 1M токенов
const PRICE_PER_1M_INPUT = 0.25; // $0.25
const PRICE_PER_1M_OUTPUT = 2.00; // $2.00

// Комиссия 20%
const COMMISSION_RATE = 0.20;

// Минимальный баланс для предупреждения
const LOW_BALANCE_WARNING = 1000;
const CRITICAL_BALANCE = 100;

/**
 * Рассчитать стоимость использования токенов в USDT
 * @param {number} inputTokens - входные токены
 * @param {number} outputTokens - выходные токены
 * @returns {number} стоимость в USDT
 */
function calculateTokenCost(inputTokens, outputTokens) {
  const inputCost = (inputTokens / 1_000_000) * PRICE_PER_1M_INPUT;
  const outputCost = (outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT;
  const baseCost = inputCost + outputCost;
  const totalCost = baseCost * (1 + COMMISSION_RATE);
  return totalCost;
}

/**
 * Рассчитать сколько токенов можно купить за USDT
 * Используем средневзвешенную цену (примерно 70% output, 30% input)
 * @param {number} usdtAmount - сумма в USDT
 * @returns {number} количество токенов
 */
function calculateTokensForUSDT(usdtAmount) {
  // Средневзвешенная цена за 1M токенов с учетом комиссии
  const avgPricePerMillion = ((PRICE_PER_1M_INPUT * 0.3) + (PRICE_PER_1M_OUTPUT * 0.7)) * (1 + COMMISSION_RATE);
  const tokensInMillions = usdtAmount / avgPricePerMillion;
  return Math.floor(tokensInMillions * 1_000_000);
}

/**
 * Получить баланс пользователя
 * @param {object} prisma - Prisma client
 * @param {string} chatId - ID пользователя
 * @returns {Promise<object>} баланс и последнее использование
 */
async function getBalance(prisma, chatId) {
  const user = await prisma.user.findUnique({
    where: { chatId },
    select: { aiTokensBalance: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const lastUsage = await prisma.aITokenUsage.findFirst({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    select: {
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      createdAt: true,
    },
  });

  return {
    balance: user.aiTokensBalance,
    lastUsage,
    status: user.aiTokensBalance < CRITICAL_BALANCE ? 'critical'
      : user.aiTokensBalance < LOW_BALANCE_WARNING ? 'low'
      : 'normal',
  };
}

/**
 * Проверить достаточно ли токенов для запроса
 * @param {object} prisma - Prisma client
 * @param {string} chatId - ID пользователя
 * @param {number} estimatedTokens - примерное количество токенов
 * @returns {Promise<boolean>}
 */
async function hasEnoughTokens(prisma, chatId, estimatedTokens = 1000) {
  const user = await prisma.user.findUnique({
    where: { chatId },
    select: { aiTokensBalance: true },
  });

  return user && user.aiTokensBalance >= estimatedTokens;
}

/**
 * Записать использование токенов
 * @param {object} prisma - Prisma client
 * @param {object} params - параметры использования
 * @returns {Promise<object>} обновленный баланс
 */
async function recordUsage(prisma, { chatId, groupId, inputTokens, outputTokens, model = 'gpt-4o-mini', promptType = 'process' }) {
  const totalTokens = inputTokens + outputTokens;

  // Получить текущий баланс
  const user = await prisma.user.findUnique({
    where: { chatId },
    select: { aiTokensBalance: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const balanceBefore = user.aiTokensBalance;

  if (balanceBefore < totalTokens) {
    throw new Error('Insufficient tokens');
  }

  const balanceAfter = balanceBefore - totalTokens;

  // Записать использование и обновить баланс в транзакции
  const [usage, updatedUser] = await prisma.$transaction([
    prisma.aITokenUsage.create({
      data: {
        chatId,
        groupId,
        inputTokens,
        outputTokens,
        totalTokens,
        model,
        promptType,
        balanceBefore,
        balanceAfter,
      },
    }),
    prisma.user.update({
      where: { chatId },
      data: { aiTokensBalance: balanceAfter },
    }),
  ]);

  return {
    balance: updatedUser.aiTokensBalance,
    used: totalTokens,
    cost: calculateTokenCost(inputTokens, outputTokens),
  };
}

/**
 * Получить историю использования
 * @param {object} prisma - Prisma client
 * @param {string} chatId - ID пользователя
 * @param {number} limit - количество записей
 * @returns {Promise<array>}
 */
async function getUsageHistory(prisma, chatId, limit = 10) {
  const usage = await prisma.aITokenUsage.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      model: true,
      promptType: true,
      balanceAfter: true,
      createdAt: true,
    },
  });

  const total = await prisma.aITokenUsage.count({
    where: { chatId },
  });

  return { usage, total };
}

/**
 * Создать запрос на пополнение
 * @param {object} prisma - Prisma client
 * @param {string} chatId - ID пользователя
 * @param {string} usdtAmount - сумма в USDT
 * @returns {Promise<object>}
 */
async function createPurchase(prisma, chatId, usdtAmount) {
  const tokensAmount = calculateTokensForUSDT(parseFloat(usdtAmount));

  const user = await prisma.user.findUnique({
    where: { chatId },
    select: { aiTokensBalance: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const balanceBefore = user.aiTokensBalance;
  const balanceAfter = balanceBefore + tokensAmount;

  const purchase = await prisma.aITokenPurchase.create({
    data: {
      chatId,
      tokensAmount,
      usdtAmount,
      balanceBefore,
      balanceAfter,
      status: 'pending',
    },
  });

  return purchase;
}

/**
 * Подтвердить пополнение (после оплаты)
 * @param {object} prisma - Prisma client
 * @param {string} purchaseId - ID покупки
 * @param {string} tonTxHash - хеш транзакции
 * @returns {Promise<object>}
 */
async function confirmPurchase(prisma, purchaseId, tonTxHash) {
  const purchase = await prisma.aITokenPurchase.findUnique({
    where: { id: purchaseId },
  });

  if (!purchase) {
    throw new Error('Purchase not found');
  }

  if (purchase.status !== 'pending') {
    throw new Error('Purchase already processed');
  }

  // Обновить статус покупки и баланс пользователя в транзакции
  const [updatedPurchase, updatedUser] = await prisma.$transaction([
    prisma.aITokenPurchase.update({
      where: { id: purchaseId },
      data: {
        status: 'completed',
        tonTxHash,
        completedAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { chatId: purchase.chatId },
      data: {
        aiTokensBalance: purchase.balanceAfter,
      },
    }),
  ]);

  return {
    purchase: updatedPurchase,
    newBalance: updatedUser.aiTokensBalance,
  };
}

/**
 * Получить пакеты для покупки
 * @returns {array} список пакетов
 */
function getPurchasePackages() {
  return [
    {
      tokens: 50_000,
      usdt: '0.10',
      label: '50k токенов',
      recommended: false,
    },
    {
      tokens: 250_000,
      usdt: '0.50',
      label: '250k токенов',
      recommended: true,
    },
    {
      tokens: 500_000,
      usdt: '1.00',
      label: '500k токенов',
      recommended: false,
    },
    {
      tokens: 1_000_000,
      usdt: '2.00',
      label: '1M токенов',
      recommended: false,
    },
  ];
}

export {
  calculateTokenCost,
  calculateTokensForUSDT,
  getBalance,
  hasEnoughTokens,
  recordUsage,
  getUsageHistory,
  createPurchase,
  confirmPurchase,
  getPurchasePackages,
  LOW_BALANCE_WARNING,
  CRITICAL_BALANCE,
};
