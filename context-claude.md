# Telegsar — Контекст проекта для Claude

**Дата создания:** 2025-10-02
**Проект:** Telegram Mini App для управления задачами и процессами

---

## 📁 Структура проекта

```
/var/www/telegsar/
├── api/                    # Backend (Express.js + Prisma + PostgreSQL)
│   ├── src/
│   │   ├── server.js      # Главный сервер Express
│   │   ├── scheduler.js   # Планировщик для напоминаний и предзадач
│   │   ├── setWebhook.js  # Установка Telegram webhook
│   │   └── routes/        # API роуты (см. ниже)
│   ├── prisma/
│   │   └── schema.prisma  # Схема БД (PostgreSQL)
│   ├── opt/               # Опциональные утилиты (например, whisper.cpp)
│   └── package.json
│
├── webapp/                 # Frontend (React + Vite + TypeScript)
│   ├── src/
│   │   ├── main.tsx       # Точка входа React
│   │   ├── App.tsx        # Главный компонент приложения
│   │   ├── api.ts         # API клиент (ky, запросы к backend)
│   │   ├── components/    # React компоненты
│   │   ├── pages/         # Страницы (Home, Groups)
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Утилиты (viewportKeyboard, tgStorage)
│   ├── dist/              # Сборка production (после npm run build)
│   └── package.json
│
├── context.md             # Старый контекст (iOS keyboard issues)
├── context-claude.md      # ЭТОТ ФАЙЛ - полный контекст проекта
└── structur.md            # Дополнительная документация структуры
```

---

## 🗄️ База данных (Prisma Schema)

### Основные модели

#### **Column** (Колонки канбана)
- `id`, `chatId`, `name`, `order`, `tasks[]`, `createdAt`, `updatedAt`
- Уникальные по `[chatId, name]`
- Внутри группы имена с префиксом `groupId::...`

#### **Task** (Задачи и мероприятия)
- **Основные поля:**
  - `id`, `chatId`, `text`, `order`, `columnId`, `assigneeChatId`
  - `type`: `TASK | EVENT` (обычная задача или мероприятие)
  - `deadlineAt`, `progress` (0-100), `complexity` (1-10)
  - `createdByChatId` (кто создал)

- **Для событий (EVENT):**
  - `startAt`, `endAt` — время начала/конца
  - `participants[]` — участники мероприятия
  - `eventInviteTickets[]` — инвайты на событие

- **Приёмка задачи:**
  - `acceptCondition`: `NONE | PHOTO | APPROVAL | PHOTO_AND_APPROVAL | DOC_AND_APPROVAL`

- **Bounty (виртуальные звёзды):**
  - `bountyStars`, `bountyStatus` (`NONE | PLEDGED | PAID | REFUNDED`)
  - `bountyByChatId`

- **Связи:**
  - `comments[]`, `media[]`, `labels[]`, `reminders[]`
  - `relFrom[]`, `relTo[]` — связи между задачами
  - `preTaskLinks[]` — ссылки из предзадач
  - `watchers[]` — наблюдатели
  - `likes[]` — лайки

- **Процессы:**
  - `fromProcess` — задача создана через процесс
  - `processLeftKeys`, `processRightKeys` — денормализованные связи для графа
  - `originPreTaskId` — если создана из предзадачи

#### **Group** (Группы)
- `id`, `ownerChatId`, `title`, `members[]`, `labels[]`
- `isTelegramGroup`, `tgChatId` — интеграция с TG группами
- `isPublic`, `publicSince` — публичные группы
- **Permissions:**
  - `permViewOwnOnly`, `permChangeStatusAny`, `permCanCreateTasks`
  - `permEditJson` — дополнительные права в JSON

#### **User**
- `chatId` (PK), `username`, `firstName`, `lastName`
- `themeBg` — цвет темы UI
- **TON Wallet:**
  - `tonAddress`, `tonNetwork`, `tonWalletApp`, `tonVerifiedAt`, `tonVerifyNonce`
- **Rank/Rating:**
  - `rank`: `ANT | FISH | SCORPION | ... | LION` (enum UserRank)
  - `rankScore`, `rankLevel`, `rankUpdatedAt`

#### **PreTask** (Предзадачи)
- Запускаются по условиям (после выполнения других задач/предзадач)
- **Режимы запуска** (`triggerMode`):
  - `AFTER_ALL_DONE` — после выполнения всех зависимостей
  - `DATE_PLUS` — не раньше `startAt` + после Done всех
  - `DELAY_AFTER` — через N минут после Done
  - `AFTER_ALL_CANCELED` — после отмены всех
- **Статус** (`status`): `PREVIEW | ARMED | FIRED | CANCELED | FAILED`
- **Связи:**
  - `links[]` — зависимости на Task или другие PreTask
  - `processLeftKeys`, `processRightKeys` — граф процесса

#### **GroupProcess** (Процессы)
- `id`, `groupId`, `title`, `runMode` (`MANUAL | SCHEDULE`)
- `scheduleRRule` — правила расписания (RRULE)
- `nodes[]` → `ProcessNode[]` — узлы процесса
- `edges[]` → `ProcessEdge[]` — связи между узлами

#### **ProcessNode** (Узлы процесса)
- `type`: `TASK | EVENT`
- `status`: `PLANNED`, `assigneeChatId`, `posX`, `posY`
- `startMode`: `AFTER_ANY | AFTER_SELECTED | AT_DATE | ...`
- `taskId` — ссылка на реальную задачу (после создания)

#### Другие важные модели:
- **TaskMedia** — вложения (photo/voice/document из TG)
- **Comment** — комментарии к задачам
- **TaskLabel** / **GroupLabel** — ярлыки для группировки
- **TaskReminder** / **EventReminder** — напоминания
- **InviteTicket** — инвайты (на группу/задачу/событие/подписку)
- **StarLedger** — история операций со звёздами
- **UserQuota** — лимиты на создание задач/событий
- **NotificationSetting** — настройки уведомлений пользователя

---

## 🔌 Backend API (Express.js)

**Базовый URL:** `process.env.API_BASE` (обычно `/api` или полный URL сервера)

### Главный файл: `api/src/server.js`

- **Middleware:** `express.json()` для парсинга JSON
- **Prisma Client:** глобальный `prisma` для работы с БД
- **Telegram helper:** `tg(method, payload)` — вызов Telegram Bot API
- **SSE:** Server-Sent Events для real-time обновлений

### API Routes (в `api/src/routes/`)

#### 1. **tasks.js** — Управление задачами
- `GET /tasks` — список задач (доска)
- `POST /tasks` — создать задачу
- `PATCH /tasks/:id` — обновить задачу
- `DELETE /tasks/:id` — удалить задачу
- `POST /tasks/:id/move` — переместить задачу в колонку
- `POST /tasks/:id/complete` — завершить задачу
- `POST /tasks/:id/media` — загрузить вложение (multipart)
- `GET /tasks/:id/media/:mediaId/url` — получить TG file URL
- `POST /tasks/:id/comments` — добавить комментарий

#### 2. **assign.js** — Назначение ответственных
- `POST /tasks/:id/assign` — назначить ответственного

#### 3. **deadline.js** — Дедлайны
- `POST /tasks/:id/deadline` — установить/обновить дедлайн

#### 4. **accept.js** — Условия приёмки
- `POST /tasks/:id/accept-condition` — установить условие

#### 5. **events.js** — Мероприятия
- `POST /events` — создать событие
- `POST /events/:id/participants` — добавить участника
- `DELETE /events/:id/participants/:chatId` — удалить участника

#### 6. **pretasks.js** — Предзадачи
- `POST /pretasks` — создать предзадачу
- `GET /pretasks/:id` — получить предзадачу
- `PATCH /pretasks/:id` — обновить предзадачу
- `DELETE /pretasks/:id` — удалить предзадачу
- `POST /pretasks/:id/arm` — взвести предзадачу (ARMED)

#### 7. **process.js** — Процессы
- `POST /process` — создать процесс
- `GET /process/:id` — получить процесс
- `POST /process/:id/nodes` — добавить узел
- `PATCH /process/:id/nodes/:nodeId` — обновить узел
- `POST /process/:id/edges` — добавить связь
- `DELETE /process/:id/edges/:edgeId` — удалить связь

#### 8. **labels.js** — Ярлыки
- `GET /groups/:groupId/labels` — список ярлыков группы
- `POST /groups/:groupId/labels` — создать ярлык
- `POST /tasks/:id/labels` — прикрепить ярлык к задаче
- `DELETE /tasks/:id/labels/:labelId` — открепить ярлык

#### 9. **reminders.js** — Напоминания
- `POST /tasks/:id/reminders` — создать напоминание
- `GET /tasks/:id/reminders` — список напоминаний
- `DELETE /tasks/:id/reminders/:reminderId` — удалить напоминание

#### 10. **bounty.js** — Вознаграждения (виртуальные звёзды)
- `POST /tasks/:id/bounty` — установить bounty
- `POST /tasks/:id/bounty/pay` — выплатить bounty

#### 11. **stars.js** — Операции со звёздами
- `GET /stars/balance` — баланс пользователя
- `POST /stars/transfer` — перевод звёзд

#### 12. **quota.js** — Квоты на создание
- `GET /quota/:chatId` — получить квоту
- `POST /quota/purchase` — купить пакет квот (Telegram Stars)

#### 13. **watchers.js** — Наблюдатели
- `POST /tasks/:id/watchers` — добавить наблюдателя
- `DELETE /tasks/:id/watchers/:chatId` — удалить наблюдателя
- `POST /groups/:groupId/watchers` — подписаться на публичную группу

#### 14. **likes.js** — Лайки
- `POST /tasks/:id/like` — лайкнуть задачу
- `DELETE /tasks/:id/like` — убрать лайк

#### 15. **sharenewtask.js** — Поделиться задачей
- `POST /share-new-task` — создать инвайт для новой задачи

#### 16. **wallet-ton.js** — TON Wallet
- `POST /wallet-ton/verify` — верифицировать кошелёк
- `GET /wallet-ton/status` — статус верификации

#### 17. **expenses.js** — Затраты по задачам
- `POST /tasks/:id/expenses` — записать затраты (₽)

#### 18. **rank.js** — Ранги пользователей
- `GET /rank/:chatId` — получить ранг
- `POST /rank/:chatId/recalc` — пересчитать ранг

#### 19. **rating.js** — Рейтинги
- `GET /rating/top` — топ пользователей по очкам

#### 20. **notifications.js** — Настройки уведомлений
- `GET /notifications/settings` — получить настройки
- `POST /notifications/settings` — обновить настройки
- `POST /notifications/grant-write` — разрешить боту писать в ЛС

#### 21. **payoutMethod.js** — Методы выплат
- `POST /payout-method` — установить СБП телефон

---

## ⚙️ Scheduler (`api/src/scheduler.js`)

- **initReminderScheduler()** — запускает cron для отправки EventReminder и TaskReminder
- **initPreTaskScheduler()** — запускает cron для проверки условий предзадач
- **reevaluatePreTasksByTaskId(taskId)** — пересчитывает предзадачи после изменения задачи
- **scheduleRemindersForEvent(eventId)** — планирует напоминания для события
- **setSSEBroadcaster(fn)** — устанавливает функцию для SSE real-time уведомлений

---

## 🎨 Frontend (React + Vite)

### Технологии:
- **React 19.1.1** + **TypeScript**
- **Vite** для сборки
- **@twa-dev/sdk** — Telegram Web App SDK
- **@tonconnect/ui** — TON Wallet интеграция
- **@dnd-kit** — Drag & Drop для канбана
- **reactflow** — визуализация процессов
- **ky** — HTTP клиент для API
- **date-fns**, **moment** — работа с датами
- **eruda** — отладка в мобильном браузере

### Главные файлы:

#### **main.tsx**
- Точка входа, рендерит `<App />`
- Импортирует `lib/viewportKeyboard.ts` для управления CSS переменной `--kb` (высота клавиатуры)

#### **App.tsx**
- Главный компонент приложения
- **Роутинг по табам:** `BottomNav` переключает `HomePage`, `GroupList`, `CalendarView`, `NotificationsView`, Settings
- **DnD Context:** `DndContext` для drag-and-drop задач на канбане
- **CreateTaskFab** — FAB кнопка "+" для создания задач
- **Инвайты:** парсинг `start_param` для обработки инвайтов (assign, join, event, task, newtask, watch)

#### **api.ts**
- Централизованный API клиент (ky)
- Функции:
  - `listGroups(chatId)` — список групп
  - `fetchBoard(chatId, groupId?)` — получить канбан
  - `createTask(chatId, text, groupId?, complexity?)` — создать задачу
  - `updateTask(taskId, text, chatId)` — обновить задачу
  - `deleteTask(taskId)` — удалить задачу
  - `moveTask(taskId, columnId, order)` — переместить задачу
  - `completeTask(taskId, chatId)` — завершить задачу
  - `setTaskDeadline(taskId, chatId, deadlineAt)` — установить дедлайн
  - `uploadTaskMedia(taskId, chatId, file)` — загрузить файл
  - `addComment(taskId, chatId, text)` — добавить комментарий
  - ... и многие другие (labels, reminders, bounty, pretasks, process, etc.)

### Компоненты (в `webapp/src/components/`)

#### Создание задач:
- **CreateTaskFab.tsx** — FAB кнопка "+" (зелёная на iOS, синяя на Android)
- **CreateTaskModal.tsx** — панель создания задачи (стеклянный эффект на iOS/Android)
  - Поддерживает: текст, группу, ярлыки, дедлайн, напоминания, условия приёмки, bounty, вложения
  - Режимы: создание, редактирование, предзадача, процесс
- **IosQuickCreatePanel.tsx** — быстрая панель создания на iOS (докинг к клавиатуре)
- **TextComposer.tsx** — текстовое поле с STT (распознавание голоса)
- **AttachBar.tsx** — панель инструментов (📎 файлы, 📸 камера, 🚩 дедлайн, ☝️ условия, ⏰ напоминания, 🔘 сложность)
- **GroupPicker.tsx** — выбор группы (свои/участник)
- **DeadlinePicker.tsx** — выбор даты/времени дедлайна
- **RemindersModal.tsx** — настройка напоминаний (ME/RESPONSIBLE/ALL)
- **AcceptConditionsModal.tsx** — условия приёмки (PHOTO/APPROVAL/...)
- **BountyPicker.tsx** — установка вознаграждения в TON
- **CameraCaptureModal.tsx** — захват фото через камеру
- **VoiceRecorder.tsx** — запись голосовых сообщений

#### Предзадачи (PreTasks):
- **PreTaskActionsLauncher.tsx** — кнопка создания предзадачи
- **PreTaskToggle.tsx** — переключатель режимов запуска
- **PreTaskCard.tsx** — карточка предзадачи
- **PreTaskEditModal.tsx** — редактирование предзадачи
- **EdgePreTaskBadge.tsx** — бейдж связи с предзадачей

#### Роботы (автоматизация):
- **RobotPicker.tsx** — выбор типа робота (🕒 расписание, 🌦️ погода)
- **WeatherScheduleModal.tsx** — настройка запуска по погоде

#### Процессы:
- **taskfeedprocess/TaskFeedProcessPage.tsx** — визуализация процесса (ReactFlow)
- **taskfeedprocess/FeedTaskNode.tsx** — узел задачи в процессе
- **taskfeedprocess/PreTaskNode.tsx** — узел предзадачи в процессе

#### Канбан/Лента:
- **feed/FeedTaskCard.tsx** — карточка задачи в ленте
- **StageCarousel.tsx** — карусель колонок
- **StageScroller.tsx** — горизонтальный скролл колонок
- **StageQuickBar.tsx** — быстрая панель смены статуса
- **TaskCard** (в App.tsx) — карточка задачи на канбане

#### Задачи:
- **TaskView.tsx** — детальный просмотр задачи
- **TaskCommentsOverlay.tsx** — оверлей с комментариями
- **TaskLabelDrawer.tsx** — drawer с ярлыками
- **TaskPreTaskLinkManager.tsx** — управление связями с предзадачами
- **WatchersBlock.tsx** — блок наблюдателей
- **ResponsibleActions.tsx** — действия с ответственным

#### Группы:
- **GroupList.tsx** — список групп (свои/участник)
- **GroupTabs.tsx** — табы групп
- **GroupEdit.tsx** — редактирование группы
- **GroupMembers.tsx** — участники группы
- **CreateGroupModal.tsx** — создание группы
- **GroupFilterModal.tsx** — фильтр по группам

#### Ярлыки:
- **LabelFilterModal.tsx** — фильтр по ярлыкам
- **LabelFilterWheel.tsx** — колесо выбора ярлыков

#### События:
- **EventPanel.tsx** — панель события
- **EventCreateModal.tsx** — создание события
- **CreateEventDialog.tsx** — диалог создания события

#### Достижения/Ранги:
- **Achievements.tsx** — достижения пользователя
- **AchievementsRulesModal.tsx** — правила начисления очков
- **RankName.tsx** — отображение ранга
- **SettingsRank.tsx** — настройки ранга
- **StarBadge.tsx** — бейдж со звёздами

#### Настройки:
- **SettingsProfile.tsx** — профиль пользователя
- **SettingsTheme.tsx** — выбор темы (цвет фона)
- **SettingsQuota.tsx** — квоты на создание
- **SettingsStars.tsx** — баланс звёзд
- **SettingsKeyboardTest.tsx** — тест клавиатуры (для отладки iOS)

#### Прочее:
- **BottomNav.tsx** — нижняя навигация (Лента/Группы/Календарь/Уведомления/Настройки)
- **NotificationsView.tsx** — страница уведомлений
- **CalendarView.tsx** — календарь (react-big-calendar)
- **ShareNewTaskMenu.tsx** — меню "поделиться задачей"
- **PostCreateActionsLauncher.tsx** — действия после создания задачи (назначить/поделиться)
- **TonWalletConnect.tsx** — подключение TON кошелька
- **OverlayModal.tsx** — универсальный overlay modal
- **WheelPicker.tsx** — колесо выбора (iOS-style)
- **LongPressOutline.tsx** — outline для long-press
- **ConditionsToolbar.tsx** — панель условий
- **CondEdge.tsx** — условная связь (edge)
- **EdgeCreatePreTaskModal.tsx** — создание предзадачи из связи
- **PayoutPromptModal.tsx** — запрос метода выплаты
- **RelationsBadge.tsx** — бейдж связей между задачами
- **CommentsThread.tsx** — поток комментариев
- **CommentsStrip.tsx** — компактная полоса комментариев
- **FeedScopeTabs.tsx** — табы области видимости ленты

### Страницы (в `webapp/src/pages/`)

#### **Home/HomePage.tsx**
- Главная страница с лентой задач
- Поддерживает скоупы: `inbox`, `assigned`, `watching`, `completed`
- Фильтры по группам, ярлыкам, дедлайнам
- Real-time обновления через SSE

#### **Groups/GroupList.tsx**
- Список групп пользователя (свои/участник)
- Создание новых групп
- Статистика по группам

#### **CalendarView.tsx**
- Календарь событий и задач с дедлайнами
- Использует `react-big-calendar`

#### **NotificationsView.tsx**
- История уведомлений
- Настройки уведомлений

---

## 🪝 Custom Hooks (в `webapp/src/hooks/`)

- **useKeyboardInsets.ts** — отслеживание высоты клавиатуры (iOS VisualViewport + TWA)
- **useKeyboardDock.ts** — управление докингом панели к клавиатуре
- **useMyRankIcon.ts** — получение иконки ранга пользователя
- **useStoriesData.ts** — данные для stories

---

## 🔧 Утилиты (в `webapp/src/lib/`)

- **viewportKeyboard.ts** — глобальный listener для CSS переменной `--kb` (высота клавиатуры)
- **tgStorage.ts** — обёртка для Telegram Cloud Storage API

---

## 🎨 UI/UX особенности

### iOS Keyboard Handling (ВАЖНО!)
- **На iPhone** для показа клавиатуры недостаточно `.focus()` — нужно также `setSelectionRange(len, len)`
- **useKeyboardInsets** и **useKeyboardDock** управляют подъёмом панелей над клавиатурой
- **IosQuickCreatePanel** использует VisualViewport без TWA для точного докинга
- При открытии модалок (📎/🤖/🚩/⏰/☝️) фокус остаётся в textarea, клавиатура не скрывается
- **Backdrop:** на iOS отключён blur для производительности, только `rgba(0,0,0,0.35)`

### Стеклянный эффект (Glass Morphism)
- **CreateTaskModal**: `background: rgba(17, 24, 39, 0.85)`, `backdrop-filter: blur(20px) saturate(150%)`
- **CreateTaskFab**: кнопка "+" с backdrop blur (зелёная на iOS, синяя на Android)

### Drag & Drop
- **@dnd-kit** для перетаскивания задач между колонками канбана
- Поддерживает touch и mouse

### Real-time обновления
- SSE (Server-Sent Events) для мгновенных уведомлений об изменениях задач/предзадач
- События: `task-created`, `task-patched`, `task-removed`, `pre-task-created`, `pretask-patched`

---

## 🔐 Безопасность

- **Telegram Web App initData** валидация на backend
- **chatId** из TWA SDK как идентификатор пользователя
- **Permissions** на группы (view, change status, create tasks)
- **TON Wallet** верификация через proof of ownership

---

## 📦 Deployment

### Backend (API)
- **PM2:** `npm run pm2:start` / `pm2:restart` / `pm2:stop`
- **Webhook:** `npm run set:webhook` — установка Telegram webhook
- **Scheduler:** автоматически стартует в `server.js` через `initReminderScheduler()` и `initPreTaskScheduler()`

### Frontend (Webapp)
- **Dev:** `npm run dev` — Vite dev server
- **Build:** `npm run build` — сборка в `dist/`
- **Preview:** `npm run preview` — просмотр production сборки

---

## 🐛 Частые проблемы и решения

### 1. **iOS клавиатура не поднимается**
- ✅ **Решение:** Всегда вызывать `focus()` + `setSelectionRange(len, len)`
- Пример: `refocusWithCaretStrong()` в `IosQuickCreatePanel`

### 2. **Панель создания слишком высоко/низко на iOS**
- ✅ **Решение:** Использовать `useKeyboardDock` с VisualViewport (без TWA)
- Кэпить lift по `vvLift = window.innerHeight - visualViewport.height`

### 3. **Модалки показываются не по центру**
- ✅ **Решение:** Рендерить через `createPortal(ui, document.body)` с высоким `z-index` (1000005)
- Блокировать pointer-events на оверлее панели при открытой модалке

### 4. **Предзадачи не срабатывают**
- ✅ **Решение:** Проверить scheduler logs, убедиться что `status=ARMED` и `fireAt` корректный
- Вызвать `reevaluatePreTasksByTaskId(taskId)` после изменения задачи

### 5. **TON Wallet не подключается**
- ✅ **Решение:** Проверить `tonVerifyNonce`, убедиться что `@tonconnect/ui` инициализирован

---

## 📝 Примеры кода

### Создать задачу через API:
```javascript
import { createTask } from './api';

const task = await createTask(
  chatId,           // ID пользователя
  'Новая задача',   // Текст задачи
  groupId,          // ID группы (необязательно)
  5                 // Сложность 1-10 (необязательно)
);
```

### Создать предзадачу:
```javascript
const preTask = await fetch(`${API_BASE}/pretasks`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chatId,
    groupId,
    text: 'Предзадача',
    triggerMode: 'AFTER_ALL_DONE',
    links: [{ taskId: 'cuid123' }], // Зависимость от задачи
    arm: true // Сразу взвести
  })
}).then(r => r.json());
```

### Переместить задачу в колонку:
```javascript
await moveTask(taskId, columnId, 0); // 0 = в начало колонки
```

### Установить дедлайн:
```javascript
await setTaskDeadline(taskId, chatId, '2025-10-15T18:00:00Z');
```

---

## 🚀 Roadmap (потенциальные улучшения)

- [ ] Темы оформления (тёмная/светлая)
- [ ] Экспорт задач в Excel/CSV
- [ ] Интеграция с внешними календарями (Google Calendar, iCal)
- [ ] Шаблоны задач и процессов
- [ ] Статистика и аналитика (графики, отчёты)
- [ ] Мобильные push-уведомления (через Telegram Bot)
- [ ] Поддержка подзадач (subtasks)
- [ ] Recurring tasks (повторяющиеся задачи)

---

## 📚 Полезные ссылки

- **Telegram Bot API:** https://core.telegram.org/bots/api
- **Telegram Web Apps:** https://core.telegram.org/bots/webapps
- **TON Connect:** https://docs.ton.org/develop/dapps/ton-connect/overview
- **Prisma Docs:** https://www.prisma.io/docs
- **React:** https://react.dev
- **Vite:** https://vitejs.dev
- **@dnd-kit:** https://dndkit.com

---

## 🎯 Главные принципы работы с проектом

1. **Читай схему БД первым делом** — вся логика в `schema.prisma`
2. **Используй существующие API функции** — не дублируй запросы
3. **iOS Keyboard — всегда `focus() + setSelectionRange()`**
4. **Модалки через `createPortal` с высоким `z-index`**
5. **Real-time через SSE** — слушай события `task-created`, `task-patched`, etc.
6. **Permissions** — проверяй права перед действиями (backend + frontend)
7. **TypeScript** — используй типы из `api.ts` (Group, Task, Column, etc.)
8. **Тестируй на iOS и Android** — поведение клавиатуры разное!

---

## 📞 Контакты для вопросов

- **Git:** `git@github.com:Korvova/telegsa.git`
- **Branch:** `process` (основная разработка)
- **Main branch:** (не указан, возможно `main` или `master`)

---

**Создано для быстрого входа в контекст проекта при работе с Claude Code.**
**Обновлено:** 2025-10-02
