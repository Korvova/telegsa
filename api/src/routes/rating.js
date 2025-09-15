// api/src/routes/rating.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const DONE_FILTER = [
  { column: { name: { equals: 'Done' } } },
  { column: { name: { endsWith: '::Done' } } },
];
const CANCEL_FILTER = [
  { column: { name: { equals: 'Cancel' } } },
  { column: { name: { endsWith: '::Cancel' } } },
];

function creatorIsMe(me) {
  return {
    OR: [
      { createdByChatId: String(me) },
      { AND: [{ createdByChatId: null }, { chatId: String(me) }] }, // fallback: board owner
    ],
  };
}
function creatorIsNotMe(me) {
  return {
    OR: [
      { createdByChatId: { not: String(me) } },
      { AND: [{ createdByChatId: null }, { chatId: { not: String(me) } }] },
    ],
  };
}

function activeFilter() {
  return {
    NOT: {
      OR: [...DONE_FILTER, ...CANCEL_FILTER],
    },
  };
}

function doneFilter() {
  return { OR: [...DONE_FILTER] };
}

// Rank thresholds and perks (synced with frontend)
const RANKS = [
  { threshold: 0, icon: '🐜', title: 'Муравей' },
  { threshold: 10, icon: '🐟', title: 'Рыба', perks: ['Голосовые сообщения'] },
  { threshold: 500, icon: '🦂', title: 'Скорпион', perks: ['Дедлайны задач', 'Комиссия 6% вместо 8%'] },
  { threshold: 800, icon: '🐿️', title: 'Белка', perks: ['Напоминания задач', 'Комиссия 5% вместо 6%'] },
  { threshold: 1100, icon: '🐱', title: 'Кот', perks: ['1 бесплатный публичный проект'] },
  { threshold: 1400, icon: '🐶', title: 'Собака', perks: ['Скидка 20% на тарифы'] },
  { threshold: 1900, icon: '🐺', title: 'Волк', perks: ['Комиссия 4% вместо 5%', 'Скидка 30%', '1 предзадача'] },
  { threshold: 2400, icon: '🐻', title: 'Медведь', perks: ['Комиссия 3% вместо 4%', 'Скидка 40%', '3 предзадачи', 'Неограниченные ярлыки'] },
  { threshold: 3700, icon: '🦅', title: 'Орёл', perks: ['Подписки на задачи (нужно фото+согласование)', 'Скидка 50%'] },
  { threshold: 4600, icon: '🐎', title: 'Лошадь', perks: ['Фото+согласование, Документ+согласование'] },
  { threshold: 5700, icon: '🐉', title: 'Дракон', perks: ['Визуальные процессы с предзадачами до 5'] },
  { threshold: 7000, icon: '🦈', title: 'Акула', perks: ['Комиссия 2% вместо 3%', '100 предзадач', 'Скидка 50%'] },
  { threshold: 8500, icon: '🐘', title: 'Слон', perks: ['Комиссия 2% вместо 3%', '10 000 предзадач', 'Скидка 60%'] },
  { threshold: 10300, icon: '🦖', title: 'Тирекс', perks: ['Чекеры погоды', 'Чекеры перезапуска процесса (бесплатно)'] },
  { threshold: 12500, icon: '🐯', title: 'Тигр', perks: ['Комиссия 1% вместо 2%', 'Скидка 70%', '3 бесплатные публичные группы', 'ИИ для автоматизации процессов'] },
  { threshold: 20000, icon: '🦁', title: 'Лев', perks: ['Комиссия 0%', 'Скидка 80%', 'Ранний доступ', 'Персональный чат поддержки'] },
];

function pickRank(score) {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (score >= r.threshold) current = r; else break;
  }
  const idx = RANKS.findIndex((r) => r.threshold === current.threshold);
  const next = idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
  return { current, next };
}

function computeFeatures(score) {
  const features = {
    canSendVoice: score >= 10,
    canSetDeadlines: score >= 500,
    remindersEnabled: score >= 800,
    freePublicProjects: score >= 1100 ? 1 : 0,
    labelsUnlimited: score >= 2400,
    subscribeTasks: score >= 3700,
    subscribeRequiresPhotoApproval: score >= 3700,
    canAddPhotoApproval: score >= 4600,
    canAddDocApproval: score >= 4600,
    processBuilderMaxPreTasks: score >= 5700 ? 5 : 0,
    freePublicGroups: score >= 12500 ? 3 : 0,
    aiAutomationAccess: score >= 12500,
  };

  // commission and discounts
  let commission = 8;
  if (score >= 20000) commission = 0; else
  if (score >= 12500) commission = 1; else
  if (score >= 8500) commission = 2; else
  if (score >= 7000) commission = 2; else
  if (score >= 2400) commission = 3; else
  if (score >= 1900) commission = 4; else
  if (score >= 800) commission = 5; else
  if (score >= 500) commission = 6;

  let discount = 0;
  if (score >= 20000) discount = 80; else
  if (score >= 12500) discount = 70; else
  if (score >= 8500) discount = 60; else
  if (score >= 7000) discount = 50; else
  if (score >= 2400) discount = 40; else
  if (score >= 1900) discount = 30; else
  if (score >= 1400) discount = 20;

  // preTasks limit escalations
  let preTasksLimit = 0;
  if (score >= 8500) preTasksLimit = 10000; else
  if (score >= 7000) preTasksLimit = 100; else
  if (score >= 2400) preTasksLimit = 3; else
  if (score >= 1900) preTasksLimit = 1;

  return { ...features, commissionPercent: commission, tariffDiscountPercent: discount, preTasksLimit };
}

router.get('/me/rating', async (req, res) => {
  try {
    const me = String(req.query.chatId || '').trim();
    if (!me) return res.status(400).json({ ok: false, error: 'chatId_required' });

    const now = new Date();

    const [acorns, seedlings, eaglesBase, rockets, loadBlack, bombs] = await Promise.all([
      prisma.task.count({ where: { ...creatorIsMe(me) } }),
      prisma.task.count({ where: { AND: [doneFilter(), creatorIsMe(me), { assigneeChatId: me }] } }),
      prisma.task.count({ where: { AND: [doneFilter(), creatorIsMe(me), { assigneeChatId: { not: null } }, { assigneeChatId: { not: me } }] } }),
      prisma.task.count({ where: { AND: [doneFilter(), { assigneeChatId: me }, creatorIsNotMe(me)] } }),
      prisma.task.count({ where: { AND: [activeFilter(), { assigneeChatId: me }, creatorIsNotMe(me)] } }),
      prisma.task.count({ where: { AND: [activeFilter(), { assigneeChatId: me }, { deadlineAt: { lt: now } }] } }),
    ]);

    const eaglesFromSeedlings = Math.floor(seedlings / 100);
    const seedlingsRemainder = seedlings % 100;
    let eagles = eaglesBase + eaglesFromSeedlings;
    const loadRed = loadBlack > 100 ? loadBlack / 100 : 0;
    const loadRedInt = Math.floor(loadRed);
    eagles = Math.max(0, eagles - loadRedInt);
    eagles = Math.max(0, eagles - bombs);
    const rocketsAfterPenalty = Math.max(0, rockets - bombs);
    const phoenix = eagles >= 100 ? Math.floor(eagles / 100) : 0;

    const score = eagles; // итоговый рейтинг для ранга
    const { current, next } = pickRank(score);
    const features = computeFeatures(score);

    res.json({
      ok: true,
      stats: {
        acorns,
        seedlings,
        seedlingsRemainder,
        eaglesBase,
        eaglesFromSeedlings,
        eagles,
        loadBlack,
        loadRed,
        loadRedInt,
        bombs,
        rockets,
        rocketsAfterPenalty,
        phoenix,
      },
      score,
      rank: { current, next },
      features,
    });
  } catch (e) {
    console.error('GET /me/rating error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

export { router as ratingRouter };

