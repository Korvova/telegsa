# Telegsar - Структура проекта

## Система рангов и монетизация

### Backend (API)

#### База данных (`api/prisma/schema.prisma`)

**User model:**
- `rank` - сохранённый ранг (legacy)
- `rankScore` - очки 🦅 (Eagles)
- `rankTrialEndsAt` - дата окончания trial периода LION (30 дней для новых пользователей)
- `rankPurchased` - купленный ранг (UserRank enum)
- `rankPurchasedAt` - дата покупки ранга

**RankPurchase model:**
- `id` - уникальный ID покупки
- `chatId` - ID пользователя
- `rank` - купленный ранг (UserRank enum)
- `rubAmount` - цена в рублях (String)
- `tonAmount` - сумма в TON (String)
- `tonTxHash` - хеш транзакции TON
- `status` - статус: pending, completed, failed
- `createdAt` - дата создания
- `completedAt` - дата подтверждения

**UserRank enum:**
```
ANT, FISH, SCORPION, SQUIRREL, CAT, DOG, WOLF, BEAR,
EAGLE, HORSE, DRAGON, SHARK, ELEPHANT, TREX, TIGER, LION
```

#### API Routes (`api/src/routes/rank.js`)

**GET /me/rank?chatId=XXX**
- Возвращает информацию о ранге пользователя
- Response:
  ```json
  {
    "ok": true,
    "rank": "ANT",           // сохранённый ранг (legacy)
    "score": 500,            // очки 🦅
    "activeRank": "LION",    // текущий активный ранг
    "earnedRank": "SCORPION",// заработанный по score
    "purchasedRank": "LION", // купленный ранг (или null)
    "trialEndsAt": "2025-11-08T00:00:00Z", // окончание trial (или null)
    "updatedAt": "..."
  }
  ```

**Логика activeRank:**
```javascript
function getActiveRank(user) {
  // 1. Trial период (30 дней для новых)
  if (user.rankTrialEndsAt > now) return 'LION';

  // 2. Заработанный по score
  const earnedRank = getRankByScore(user.rankScore);

  // 3. Максимум из купленного и заработанного
  if (user.rankPurchased) {
    return max(user.rankPurchased, earnedRank);
  }

  return earnedRank;
}
```

**GET /me/rank/prices**
- Возвращает цены на ранги в рублях
- Response:
  ```json
  {
    "ok": true,
    "prices": {
      "FISH": 1000,
      "SCORPION": 5000,
      "SQUIRREL": 10000,
      ...
      "LION": 100000
    }
  }
  ```

**GET /me/rank/rates**
- Возвращает курс TON/RUB
- Использует Coingecko API через curl (fetch не работает на сервере)
- Response:
  ```json
  {
    "ok": true,
    "tonRub": 225.54,
    "updatedAt": 1759946182023
  }
  ```

**POST /me/rank/purchase**
- Создаёт запись о покупке ранга
- Body: `{ chatId, rank }`
- Response:
  ```json
  {
    "ok": true,
    "purchase": {
      "id": "cmgi90m500000vs59o51a1o8n",
      "rank": "LION",
      "rubAmount": "100000",
      "status": "pending"
    }
  }
  ```

**POST /me/rank/payment-request**
- Создаёт TON транзакцию для оплаты ранга
- Body: `{ chatId, rubAmount, purchaseId? }`
- Получает курс TON/RUB
- Конвертирует рубли в TON
- Создаёт payload с комментарием: `rank|chatId:XXX|purchase:YYY|ts:ZZZ`
- Обновляет purchase.tonAmount
- Response:
  ```json
  {
    "ok": true,
    "transaction": { ... }, // для TonConnect
    "purchaseId": "...",
    "tonAmount": "443.26",
    "tonRubRate": 225.54
  }
  ```

**POST /me/rank/purchase/:purchaseId/confirm**
- Подтверждает покупку ранга по хешу транзакции
- Body: `{ tonTxHash }`
- Обновляет purchase.status → completed
- Обновляет user.rankPurchased и user.rankPurchasedAt
- Response:
  ```json
  {
    "ok": true,
    "message": "Rank purchased successfully"
  }
  ```

#### Создание новых пользователей (`api/src/server.js`)

При создании нового пользователя (User.upsert в create) автоматически добавляется:
```javascript
rankTrialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
```

Места создания:
- `POST /me` - создание профиля
- `POST /me/theme` - сохранение темы
- Group admins sync - синхронизация админов групп
- Telegram group member add - добавление участников

### Frontend (webapp)

#### API функции (`webapp/src/api.ts`)

```typescript
export type RankInfo = {
  rank: string;
  score: number;
  activeRank: string;
  earnedRank: string;
  purchasedRank: string | null;
  trialEndsAt: string | null;
  updatedAt: string | null;
};

// Получить информацию о ранге
getRankInfo(chatId: string): Promise<RankInfo>

// Получить цены на ранги
getRankPrices(): Promise<Record<string, number>>

// Получить курс TON/RUB
getRankRates(): Promise<{ tonRub: number; updatedAt: number }>

// Создать покупку ранга
createRankPurchase(chatId: string, rank: string)

// Создать платёжную заявку
createRankPaymentRequest(params: {
  chatId: string;
  rubAmount: string;
  purchaseId?: string;
}): Promise<{ ok: boolean; transaction: any; purchaseId?: string; tonAmount: string; tonRubRate: number }>

// Подтвердить покупку
confirmRankPurchase(purchaseId: string, tonTxHash: string)
```

#### Компоненты

**`webapp/src/components/Achievements.tsx`:**

Определение рангов с ценами и привилегиями:
```typescript
export type RankDef = {
  threshold: number;    // порог в 🦅
  icon: string;         // эмодзи
  title: string;        // название
  code: string;         // код (ANT, FISH, ...)
  priceRub?: number;    // цена в рублях
  perks?: string[];     // привилегии
};

export const RANKS: RankDef[] = [
  { threshold: 0, icon: '🐜', title: 'Муравей', code: 'ANT' },
  { threshold: 10, icon: '🐟', title: 'Рыба', code: 'FISH', priceRub: 1000, perks: [...] },
  ...
  { threshold: 20000, icon: '🦁', title: 'Лев', code: 'LION', priceRub: 100000, perks: [...] }
];
```

**RankModal** (в ленте задач):
- Отображает trial период
- Отображает купленный ранг
- Кнопки покупки для рангов выше текущего
- Интеграция с TON кошельком через `(window as any).ton`
- Автообновление через 15 секунд после покупки

**`webapp/src/components/SettingsRank.tsx`:**

Компонент в настройках:
- Использует те же RANKS из Achievements
- Показывает trial период в карточке
- Модалка с покупкой рангов
- Полный функционал покупки как в ленте

### Логика расчёта очков 🦅

**Источники очков (`webapp/src/components/Achievements.tsx`):**

```typescript
function computeAchievements(items, meChatId) {
  // 🌰 Acorns - поставленные мной задачи (без Done)
  acorns = tasks_created_by_me - seedlings

  // 🌱 Seedlings - сам поставил и сам выполнил
  seedlings = tasks_where(creator=me AND assignee=me AND status=Done)

  // 🦅 Eagles (base) - выполнили другие
  eaglesBase = tasks_where(creator=me AND assignee!=me AND status=Done)

  // Конверсия: 100 🌱 = 1 🦅
  eaglesFromSeedlings = floor(seedlings / 100)

  // 🚀 Rockets - я выполнил (поставил другой)
  rockets = tasks_where(creator!=me AND assignee=me AND status=Done)

  // ⚫ Load - нагрузка (на меня, активные)
  loadBlack = tasks_where(creator!=me AND assignee=me AND active)

  // 💣 Bombs - просрочки (мои активные с дедлайном)
  bombs = tasks_where(assignee=me AND active AND deadline < now)

  // Финальный расчёт:
  eagles = eaglesBase + eaglesFromSeedlings
  eagles = max(0, eagles - floor(loadBlack / 100))  // штраф за нагрузку
  eagles = max(0, eagles - bombs)                   // штраф за просрочки
  rockets = max(0, rockets - bombs)
}
```

### Пороги рангов (по 🦅)

| Ранг | Порог | Цена | Комиссия | Основные привилегии |
|------|-------|------|----------|---------------------|
| 🐜 Муравей | 0 | - | 8% | Базовый ранг |
| 🐟 Рыба | 10 | 1K₽ | 8% | Голосовые сообщения |
| 🦂 Скорпион | 500 | 5K₽ | 6% | Дедлайны |
| 🐿️ Белка | 800 | 10K₽ | 5% | Напоминания |
| 🐱 Кот | 1100 | 15K₽ | 5% | 1 публичный проект |
| 🐶 Собака | 1400 | 20K₽ | 5% | Скидка 20% на тарифы |
| 🐺 Волк | 1900 | 30K₽ | 4% | Скидка 30%, 1 предзадача |
| 🐻 Медведь | 2400 | 40K₽ | 3% | Скидка 40%, 3 предзадачи |
| 🦅 Орёл | 3700 | 50K₽ | 3% | Подписки, Фото+согласование, Скидка 50% |
| 🐎 Лошадь | 4600 | 60K₽ | 3% | Документ+согласование |
| 🐉 Дракон | 5700 | 70K₽ | 3% | БП с предзадачами до 5 |
| 🦈 Акула | 7000 | 80K₽ | 2% | 100 предзадач, Скидка 50% |
| 🐘 Слон | 8500 | 90K₽ | 2% | 10К предзадач, Скидка 60% |
| 🦖 Тирекс | 10300 | 95K₽ | 2% | Чекеры погоды (бесплатно) |
| 🐯 Тигр | 12500 | 98K₽ | 1% | Скидка 70%, 3 публичные группы, AI для БП |
| 🦁 Лев | 20000 | 100K₽ | **0%** | Скидка 80%, ранний доступ, персональный чат |

### Монетизация

**Стратегия:**
1. **Trial период**: новые пользователи получают 🦁 Lion на 30 дней (0% комиссия)
2. **После trial**: автоматический downgrade до заработанного ранга (обычно 🐜 Ant = 8%)
3. **Два пути повышения:**
   - Органический: зарабатывать 🦅 очки выполняя задачи
   - Платный: купить любой ранг навсегда за TON

**Комиссия с вознаграждений:**
- Используется в системе bounty (задачи с вознаграждением)
- Снижается от 8% (🐜) до 0% (🦁)
- Мотивирует либо активно работать, либо покупать ранг

**Оплата:**
- Через TON кошелёк (TonConnect)
- Курс TON/RUB через Coingecko API
- Деньги идут напрямую на FEE_RECIPIENT
- Автоподтверждение через 10-20 секунд после транзакции

### Технические детали

**Получение курса TON/RUB:**
```javascript
// Node.js fetch не работает на сервере, используем curl
async function resolveTonRubRate() {
  const { execSync } = await import('child_process');

  // Пробуем toncoin
  let result = execSync(`curl -s "https://api.coingecko.com/api/v3/simple/price?ids=toncoin&vs_currencies=rub"`);
  let rub = JSON.parse(result)?.toncoin?.rub;

  // Fallback: the-open-network
  if (!rub) {
    result = execSync(`curl -s "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=rub"`);
    rub = JSON.parse(result)?.['the-open-network']?.rub;
  }

  return rub;
}
```

**TON транзакция:**
```javascript
// Комментарий для идентификации покупки
const comment = `rank|chatId:${chatId}|purchase:${purchaseId}|ts:${Date.now()}`;
const payload = buildTextCommentPayload(comment);

const transaction = {
  validUntil: Math.floor(Date.now() / 1000) + 600, // 10 минут
  messages: [{
    address: FEE_RECIPIENT,
    amount: toNano(tonAmount).toString(),
    payload,
  }],
};

// Отправка через TonConnect
await ton.sendTransaction(transaction);
```

**Автоподтверждение:**
- Frontend ждёт 10-15 секунд после отправки
- Вызывает processPendingAITokenPurchases (или аналог для рангов - TODO)
- Backend ищет транзакцию в блокчейне по комментарию
- Автоматически подтверждает и начисляет ранг


