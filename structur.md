Проект: telegsар — мини‑приложение Telegram для задач, событий и процессов

Срез на: текущий коммит в каталоге `telegsar`

Цель файла
- Дать целостную картину архитектуры, данных и API.
- Быстро ориентировать по файлам: кто за что отвечает, как связаны.
- Закрыть 80/20 понимания без чтения кода целиком. Для тонкостей рядом указаны исходники.

Содержание
- Обзор архитектуры
- Бэкенд (api): сервер, роуты, планировщик, интеграции
- Данные (Prisma/DB): модели и связи
- Фронтенд (webapp): страницы, компоненты, API‑клиент
- Дерево проекта (основные файлы)
- Переменные окружения и запуск
- Договорённости и инварианты
- Потоки/сценарии: кто с кем говорит
- Примечания о внешних библиотеках

Обзор архитектуры
- Клиент: `webapp` (Vite + React + TypeScript), мини‑апп Telegram. Рендер ленты задач/событий, детальный просмотр, редактирование, «процессы» (визуальный граф), ярлыки, комментарии, напоминания, кошелёк TON и т.д.
- Сервер: `api` (Node.js >=18, Express 5, Prisma). REST API + Telegram Bot интеграции + планировщик (node-schedule) для напоминаний событий и задач, логика процессов, работа с хранилищем файлов Telegram, TON (bounty/escrow), квоты.
- БД: PostgreSQL через Prisma (схема в `api/prisma/schema.prisma`). Модели: Task/Column/Group/User/... + расширения: напоминания, лайки, наблюдатели, предзадачи, процессы, ярлыки, биллинг «звёздами» и т.д.
- Связи «групп» реализованы префиксом в имени колонки Канбана: `<groupId>::Inbox|Doing|Done|Cancel|Approval|Wait`.
- Интеграции: Telegram Bot API (уведомления, webhooks, инвайты, Stars инвойсы), TON (кошелёк и начисления), STT (опционально Whisper через скрипты).

Бэкенд (api)
- Точка входа: `api/src/server.js`. 
  - Инициализирует Express, PrismaClient, подключает роутеры.
  - Хелперы работы с Telegram API (`tg(method, payload)`), разрешения DM (`dmWriteAllowed`), определение TG‑группы задачи из колонки (`GROUP_SEP = '::'`).
  - Включает планировщики: `initReminderScheduler`, `initPreTaskScheduler` (см. `api/src/scheduler.js`).
  - Отдаёт файлы вложений: `GET /files/:mediaId` (проксирование/хранение медиа из Telegram).
  - Базовое здоровье: `GET /health`.
  - Подключает роутеры: 
    - `/notifications` → настройки уведомлений.
    - `/assign` → назначение ответственных + инвайты.
    - `/sharenewtask` → шэринг шаблонной задачи в чужую доску.
    - `/tasks` → CRUD/операции над задачами и доп. эндпоинты (комментарии, медиа, статусы, дедлайны, напоминания задач и пр.).
    - `/bounty`, `/payout-method`, `/stars`, `/wallet/ton` → выплаты/баланс/кошелёк TON.
    - `/quota` → лимиты пользователя.
    - `/likes` → лайки задач/комментариев.
    - `/watchers` → наблюдатели задачи.
    - `/reminders` и `/pre-tasks` → напоминания событий и предзадачи (создание, включение, связи).
    - `/expenses` → расходы по задаче.
    - `/accept` → условия приёмки.
    - `/deadline` → дедлайны задач.
    - `/events` → события (Task type=EVENT), участники и напоминания; процессные графы для групп (часть API также отражена в `routes/process.js`).
    - `/rating`, `/rank` → рейтинг/ранг пользователя и фичи.
    - `/labels` → ярлыки группы и привязки к задачам.
  - Прямые маршруты в `server.js` (важные):
    - `GET /tasks` — доска (колонки/задачи) с фильтрами (`chatId`, `groupId`, mineOnly и пр.).
    - `POST /webhook` — вход Telegram вебхука.
    - `GET /tasks/:id` — задача.
    - `POST /me`, `GET/POST /me/theme` — профиль/тема.
    - `POST /invites`, `POST /invites/accept` — инвайты (task/group/event/watch).
    - Загрузка медиа `POST /tasks/:id/media`, завершение/переоткрытие, форвард, share‑prepared, группы и их права/вотчеры (сервер реализует ещё часть групповых API прямо здесь).

- Планировщик/оценка условий (`api/src/scheduler.js`):
  - События: `EventReminder` — планирование и рассылка напоминаний по `fireAt`, фильтрация получателей (writeAccessGranted, не боты), TTL/tries, фатальные TG‑ошибки не ретраим.
  - Задачи: `TaskReminder` — напоминания по задачам (ME/RESPONSIBLE/ALL), DM/группа, reply‑поведение к исходному сообщению.
  - SSE‑транслятор (опционально): `setSSEBroadcaster(fn)`.
  - Предзадачи (PreTask): вычисление состояния зависимостей (done/canceled), правила срабатывания (AFTER_ALL_DONE/DATE_PLUS/DELAY_AFTER/AFTER_ALL_CANCELED), создание real Task в целевой колонке `Inbox|Cancel` с уведомлениями, денормализация соседей (`processLeftKeys/RightKeys`) для быстрых графов, отмены/перезапуски.

- Роутеры (коротко по назначению):
  - `routes/tasks.js` — большой модуль задач: 
    - Комментарии: `GET/POST/DELETE /tasks/:id/comments` (+ уведомления об ответах, учёт group permissions).
    - Уведомления о назначении: `maybeNotifyTaskAccepted`.
    - Удаление задачи с рефандом `bounty` (асинхронный вызов) и переоценкой предзадач.
    - Отношения задач (process graph): `GET /tasks/:id/relations`.
    - Множество других операций (перемещение, прогресс, share‑prepared, upload media, complete/reopen и т.д.) — часть реализована прямо в `server.js`.
  - `routes/events.js` — задачи‑события (Task.type = 'EVENT'): создание/обновление/удаление; участники (`EventParticipant`), напоминания (`EventReminder`) и их «прайминг»; сериализация/восстановление визуального процесса группы (nodes/edges), в т.ч. seed‑узлы и созданные задачи.
  - `routes/process.js` — альтернатива/срез API процессов для групп: `GET/POST /groups/:groupId/process` (сохранение/чтение нод/рёбер, создание новых задач по seed_new_*), индексы и ключи сохранения в `metaJson`.
  - `routes/notifications.js` — настройки уведомлений по чату Telegram: 
    - `GET /notifications/:telegramId`, `POST /notifications/toggle`, `POST /notifications/me`, `POST /notifications/test`.
  - `routes/assign.js` — назначение себя/инвайты/«пинг» в ЛС Telegram, снятие назначения и т.д.
  - `routes/sharenewtask.js` — выдать startapp‑ссылку на «взять шаблон себе» + `accept` создаёт копию в нужной борде/группе (Inbox) с дедупликацией.
  - `routes/watchers.js` — наблюдатели задачи: `GET/POST/DELETE /tasks/:id/watchers`, `POST /watchers/invite` (инвайт на подписку).
  - `routes/likes.js` — лайки задач и комментариев.
  - `routes/expenses.js` — поле `expenses` задачи с проверкой прав (группа/личная доска, overrides).
  - `routes/labels.js` — ярлыки группы: CRUD, привязка к задачам, идемпотентные upsert‑ы без `skipDuplicates` (SQLite совместимость), списки ярлыков задач.
  - `routes/quota.js` — квоты пользователя (tasks+events+pretasks), dev‑покупка, invoice для Stars.
  - `routes/wallet-ton.js` — тон‑кошелёк пользователя (nonce → verify → status → disconnect).
  - `routes/bounty.js` — TON: курс TON/RUB, драфты сумм, отправка платежей из эскроу, помощники TonAPI/Toncenter, возможный USDT flow.
  - `routes/accept.js` — условие приёмки задачи (NONE/PHOTO/APPROVAL/...); проверки прав группы/личной доски/overrides.
  - `routes/deadline.js` — дедлайн задачи (валидация будущего времени, права).
  - `routes/rank.js`, `routes/rating.js` — ранги, фичи по очкам, агрегации статистик.

- Сервисные файлы:
  - `src/setWebhook.js` — установка вебхука и глобальных команд в Telegram.
  - `api/package.json` — скрипты (`start`, `set:webhook`, pm2), зависимости (Express 5, Prisma 6.x, node-schedule, TON, Busboy/Multer и т.д.).
  - `api/opt/whisper.cpp/*` — скрипты и утилиты для whisper.cpp (вендор, код не описываем).

Данные (Prisma/DB) — ключевые модели
- Колонки/задачи
  - `Column(id, chatId, name, order)` — имя уникально в рамках `chatId`. Группы кодируются префиксом `<groupId>::`.
  - `Task(id, chatId, text, order, columnId, createdByChatId?, assigneeChatId?, type(TASK|EVENT), startAt/endAt, deadlineAt, progress, acceptCondition, fromProcess, ...)
    - Коммуникации: `comments`, `media`, `labels`, `likes`, `watchers`.
    - Напоминания по задачам: `TaskReminder(taskId, target(ME|RESPONSIBLE|ALL), fireAt, createdBy, sentAt, tries, replyToMessageId)`.
    - Связи процесса: `TaskRelation(fromTaskId→toTaskId, groupId?, createdBy)`, денормализованные ключи `processLeftKeys/RightKeys`, `originPreTaskId`.
    - Bounty: `bountyStars`, `bountyStatus`, движения — `StarLedger(taskId, fromChatId, toChatId?, amount, kind)`.
    - Расходы: `expenses`.
- Комментарии/уведомления/лайки/наблюдатели
  - `Comment(taskId, authorChatId, text)` + `CommentLike(commentId, chatId)`.
  - `NotificationSetting(telegramId, receiveTaskAccepted, receiveTaskCompletedMine, receiveTaskComment, writeAccessGranted)`.
  - `TaskLike(taskId, chatId)`, `TaskWatcher(taskId, chatId)`.
- Группы и участники
  - `Group(id, ownerChatId, title, isTelegramGroup, tgChatId?, isPublic, permEditJson JSON c правами по полям)`.
  - `GroupMember(groupId, chatId, role, description?, permOverrides JSON)`.
  - `GroupShortcut(chatId, groupId, code)` — короткие коды `/g_...`.
  - `GroupWatcher(groupId, chatId)` — подписки на публичные группы.
  - Ярлыки: `GroupLabel(groupId, title, color?, order)` и связка `TaskLabel(taskId, labelId, assignedBy, assignedAt)`.
- Инвайты
  - Legacy: `Invite` (TASK assign), New: `InviteTicket(token, type(TASK|GROUP|EVENT|WATCH), status, groupId, taskId?, eventId?, invitedByChatId, expiresAt?)`.
- События
  - `Task` с `type = EVENT` + `EventParticipant(eventId, chatId, role)`, `EventReminder(eventId, chatId, offsetMinutes, fireAt, replyToMessageId?, sentAt, tries)`.
- Кошелёк/квоты/ранги
  - `User(chatId, username, first/lastName, themeBg, ton*, rank, rankScore, rankUpdatedAt...)`.
  - `UserQuota(chatId, totalCapacity)`, `UserQuotaPurchase(chatId, pack, stars)`.
  - `UserPayoutMethod(chatId, phone, bankCode?)`.
  - Ранги: `User.rank (enum)` + расчёт фичей на лету в `routes/rating.js`.
- Процессы/предзадачи
  - `GroupProcess(id, groupId, runMode, scheduleRRule?, timezone?, isActive, createdBy)`.
  - `ProcessNode(processId, title, posX/posY, type, status, taskId?, assignee/createdBy, startMode/date/afterDays, cancelMode, metaJson)` и `ProcessEdge(processId, sourceNodeId, targetNodeId, enabled)`.
  - `PreTask(id, creatorChatId, groupId?, text, plannedAssigneeChatId?, triggerMode, startAt?, delayMinutes?, autoCancelOnAny, status, targetTaskId?, timezone?, fireAt?, processLeft/RightKeys)` + `PreTaskLink(preTaskId → taskId | depPreTaskId)`.

Фронтенд (webapp)
- Вход: `webapp/src/main.tsx`, `webapp/src/App.tsx`.
  - Определяет `chatId` из Telegram SDK (`@twa-dev/sdk`) или query string.
  - Навигация вкладками (BottomNav): лента, календарь, группы, настройки.
  - Встраивает CreateTask FAB/модалки, уведомления, профили, ранги, квоты/Stars.
  - Обработка `start_param` (инвайты: `assign|join|event|newtask|watch` и `task_<id>`).
- API‑клиент: `webapp/src/api.ts` (+ мелкие модули в `webapp/src/api/`).
  - Базовый `API_BASE` из `VITE_API_BASE`.
  - Обёртки для всех серверных эндпоинтов: board, tasks, comments, labels, events (участники, напоминания), process (`fetchProcess/saveProcess`), invites, groups (public watch/unwatch), quota, rating/rank, likes/watchers, forward/share, reminders задач (`api/reminders.ts`), assign (`api/assign.ts`), share‑new‑task (`api/sharenewtask.ts`).
- Страницы:
  - `pages/Home/HomePage.tsx` — лента задач: фильтры по стадиям, группам, drag&drop (dnd-kit), статус/прогресс/дедлайны/комментарии/ярлыки, открытие `TaskView`, оверлей Process (React Flow), интеграция с CreateTask.
  - `pages/Groups/GroupList.tsx` — список «Мои/Со мной/Публичные», watch/unwatch публичных, создание группы.
  - `pages/i` — зарезервированный файл‑заглушка (пустой).
- Ключевые компоненты:
  - `TaskView.tsx` — детальная карточка: текст, медиа (фото/voice/doc), дедлайны (`DeadlinePicker`), напоминания задач, ярлыки (`TaskLabelDrawer`), комментарии (`CommentsThread`/`CommentsStrip`), назначение/права/перемещение между колонками, выплаты (`PayoutPromptModal`), наблюдатели (`WatchersBlock`), share, forward.
  - `components/create-task/*` — модалки создания/редактирования, выбор группы, вложения, условия приёмки (`AcceptConditionsModal`), роботы для погоды/и т.п., предпросмотр аудио.
  - `components/taskfeedprocess/*` — визуальный процесс на полотне (React Flow):
    - `TaskFeedProcessPage.tsx` — контейнер оверлея, загрузка/сохранение графа через API, подсветка ребра, масштабирование, слежение viewport.
    - `FeedTaskNode.tsx` — узел с карточкой задачи, right‑handle для связей.
    - `PreTaskNode.tsx` — узел предзадачи (рендер через `PreTaskCard`).
    - `CondEdge.tsx` — рёбра.
    - CSS: `TaskFeedProcessPage.css` — увеличенные handle для мобилки.
  - `CreateTaskFab.tsx` — плавающая кнопка/модалки, взаимодействует с «процессом» и лентой через CustomEvent‑ы.
  - Остальные: `DeadlinePicker`, `RemindersModal`, `GroupTabs`, `GroupEdit`, `GroupMembers`, `StageScroller/StageQuickBar`, `EdgePreTaskBadge`, `EdgeCreatePreTaskModal`, `PreTaskEditModal`, `PreTaskPreviewModal`, `FeedTaskCard`, `TonWalletConnect`, `Settings*`, `WatchersBlock`, `LabelFilterModal/Wheel`, `ShareNewTaskMenu`, `VoiceRecorder`, `CameraCaptureModal`, `OverlayModal`.
  - Хуки/утилиты: `hooks/useKeyboardInsets|Dock`, `hooks/useMyRankIcon`, `lib/tgStorage`, `lib/viewportKeyboard`.
  - Верхний уровень UI: `BottomNav.tsx` — нижняя навигация вкладок; `NotificationsView.tsx` — экран настроек уведомлений; `SettingsStars.tsx` — экран тарифов/Stars; `WriteAccessGate.tsx` — гейт разрешения на отправку уведомлений; `CalendarView.tsx` — календарь событий.

Хуки/утилиты (webapp/src/hooks, webapp/src/lib)
- `hooks/useKeyboardInsets.ts` — управляет инсетами/вьюпортом клавиатуры на мобильных.
- `hooks/useKeyboardDock.ts` — «докинг» клавиатуры и элементов ввода.
- `hooks/useMyRankIcon.ts` — вычисляет/кэширует иконку ранга пользователя.
- `lib/tgStorage.ts` — удобная обёртка для хранения в Telegram WebApp storage/localStorage.
- `lib/viewportKeyboard.ts` — вспомогательные функции по работе с вьюпортом и клавиатурой.

Приложение компонентов (перечень `webapp/src/components`)
- Achievements.tsx — достижения/ранги (UI‑блоки, связаны с `/rating`, `/rank`).
- AchievementsRulesModal.tsx — модалка правил достижений.
- BountyPicker.tsx — UI выбора/отображения bounty (TON), работает вместе с `/bounty/*`.
- CameraCaptureModal.tsx — модалка камеры (фото/видео) для вложений задачи.
- CommentsStrip.tsx — компактная полоска последних комментариев.
- CommentsThread.tsx — тред комментариев в `TaskView`.
- CondEdge.tsx — рёбра для React Flow в процессах.
- ConditionsToolbar.tsx — тулбар условий (этапы/фильтры) в ленте.
- CreateEventDialog.tsx — модалка создания события (обёртка над API `/events`).
- CreateGroupModal.tsx — создание группы.
- CreateTaskFab.tsx — FAB/модалки создания/редактирования/edge‑привязок.
- DeadlinePicker.tsx — выбор/изменение дедлайна (PATCH `/tasks/:id/deadline`).
- EdgeCreatePreTaskModal.tsx — модалка создания предзадачи при «перетяжке» ребра.
- EdgePreTaskBadge.tsx/Portal.tsx — индикатор/портал для связи задачи с предзадачей.
- EventCreateModal.tsx — создание события (альтернатива/вариант диалога).
- EventPanel.tsx — панель события в `TaskView` (даты/участники/напоминания).
- FeedScopeTabs.tsx — табы охвата ленты (все/группа/т.п.).
- GroupEdit.tsx — редактирование свойств группы (название/публичность и т.п.).
- GroupFilterModal.tsx — фильтры по группам в ленте.
- GroupMembers.tsx — участники группы (список/управление).
- GroupTabs.tsx — табы «Мои/Со мной/Публичные» (для экранов групп).
- LabelFilterModal.tsx / LabelFilterWheel.tsx — фильтрация по ярлыкам.
- LongPressOutline.tsx — визуальная обратная связь долгого нажатия.
- OverlayModal.tsx — базовая обёртка модальных окон.
- PayoutPromptModal.tsx — подсказка выплаты исполнителю при `Done` и невыплаченной bounty.
- PostCreateActionsLauncher.tsx/Sheet.tsx — быстрые действия после создания задачи.
- PreTaskCard.tsx — карточка предзадачи (используется и в процессе).
- PreTaskEditModal.tsx — редактирование предзадачи.
- PreTaskPreviewModal.tsx — предпросмотр предзадачи.
- RelationsBadge.tsx — бейдж наличия связей (process relations).
- RemindersModal.tsx — управление напоминаниями задачи (`/tasks/:id/reminders`).
- ResponsibleActions.tsx — быстрые действия ответственного.
- SelectPreTasksModal.tsx — выбор предзадач‑зависимостей.
- SettingsKeyboardTest.tsx — отладка клавиатуры (вьюпорт/смещения).
- SettingsProfile.tsx — профиль пользователя.
- SettingsQuota.tsx — квоты/покупки (`/quota`).
- SettingsRank.tsx — текущий ранг.
- SettingsTheme.tsx — настройка темы/фона.
- ShareNewTaskMenu.tsx — шэринг шаблонной задачи (`/sharenewtask`).
- StageScroller.tsx / StageQuickBar.tsx — управление стадиями.
- StarBadge.tsx — бейдж «звёзд»/bounty.
- TaskCommentsOverlay.tsx — оверлей комментариев.
- TaskLabelDrawer.tsx — ярлыки задачи (attach/detach через `/tasks/:id/labels`).
- TaskPreTaskLinkManager.tsx — менеджер связей задачи с предзадачами (UI).
- TonWalletConnect.tsx — подключение кошелька TON.
- VoiceRecorder.tsx — запись голоса (вложения).
- WatchersBlock.tsx — наблюдатели задачи (список/подписка/отписка).
- WheelPicker.tsx — колёсный пикер значений.
- `_internal/PreTaskToggleEmbed.tsx` — внутренний компонент для переключения предзадач.
- `feed/FeedTaskCard.tsx` — карточка задачи в ленте.
- `stories/*` — мини‑сториз (визуальные компоненты и данные).
- `taskfeedprocess/*` — узлы/ребра/страница процесса для ленты (см. выше).

Дерево проекта (ядро)
- Корень `telegsar/`
  - `api/` — сервер
    - `src/server.js` — основной сервер/маршруты/хелперы Telegram/SSE/файлы.
    - `src/scheduler.js` — планировщик событий/задач, предзадачи, utils.
    - `src/routes/*.js` — модули по функциональным зонам (см. раздел «Роутеры» выше).
    - `prisma/schema.prisma` — схема БД, индексы/enum/связи.
    - `info/info.md` — заметки по фронту/процессам.
    - `opt/whisper.cpp/*` — внешний вендор (описание опущено).
    - `.env` — секреты (см. «Переменные окружения»).
    - `package.json` — скрипты/зависимости.
  - `webapp/` — фронтенд
    - `src/App.tsx`, `main.tsx` — вход/композиция страниц.
    - `src/api.ts` + `src/api/*.ts` — HTTP‑клиент к серверу.
    - `src/pages/*` — страницы ленты/групп.
    - `src/components/*` — UI‑блоки (см. выше).
    - `vite.config.ts`, `tsconfig*.json`, `eslint.config.js` — конфиг сборки.
  - `context.md` — текущие заметки.
  - `git-commits-*.txt` — выгрузки истории git.
  - `.gitignore` — игнор env/кэшей/IDE.

Переменные окружения (минимум)
- Общие Telegram:
  - `BOT_TOKEN` — токен бота (для webhook/отправок).
  - `BOT_USERNAME` — username бота (ссылки mini app).
  - `WEBHOOK_SECRET` — секрет вебхука.
- БД:
  - `DATABASE_URL` — строка подключения PostgreSQL.
- Напоминания/уведомления:
  - флаги в БД `NotificationSetting.*` регулируются API `/notifications`.
- TON/биллинг:
  - `TON_NETWORK` (`mainnet|testnet`), `TONAPI_BASE_URL`, `TONAPI_KEY`.
  - `TONCENTER_*` — альтернативный провайдер (URL/API_KEY).
  - `ESCROW_WALLET_MNEMONIC`, `ESCROW_WALLET_ADDRESS` — эскроу‑кошелёк.
  - `FEE_BPS`, `FEE_RECIPIENT` — комиссионные.
- Прочее:
  - `PORT` — порт API (по умолчанию 3300 в логике ссылок).

Запуск (локально)
- API:
  - Установить зависимости в `api/`, сконфигурировать `.env` (см. переменные).
  - Применить миграции Prisma по `schema.prisma` (используется PostgreSQL).
  - Старт: `npm run start` из `api/`.
  - Вебхук (если нужен): `npm run set:webhook`.
- Webapp:
  - В `webapp/` настроить `VITE_API_BASE` (например, `http://localhost:3300`).
  - `npm run dev` (Vite), `npm run build` — прод.

Договорённости/инварианты
- Префикс имён колонок для групп — `GROUP_SEP = '::'`. Имя колонки = `<groupId>::Phase`. Фазы: Inbox, Doing, Done, Cancel, Approval, Wait.
- Права в группах задаются `Group.permEditJson`, индивидуальные оверрайды в `GroupMember.permOverrides`.
- Визуальные процессы сохраняют для каждого узла `metaJson.key`: `task:<id>` или `pretask:<id>` (особенно для task‑scope `groupId = task:<rootId>`).
- Напоминания событий по offset‑ам «праймятся» и перезапускаются при изменениях; просроченные досылаются немедленно.
- DM только при `writeAccessGranted = true` и адресат не бот.

Потоки/сценарии
- Создание задачи в группе: фронт `POST /tasks` → сервер создаёт задачу в колонке `<groupId>::Inbox` владельца группы; в ленте появляется карточка.
- Назначение ответственного: фронт `POST /assign/self` или инвайт → `tasks.js`/уведомления уведомляют исполнителя/группу.
- Комментарий к задаче: `POST /tasks/:id/comments` → `notifyAboutComment` отправляет одно сообщение в TG‑группу (или DM постановщику), кнопка «Ответить» открывает mini‑app.
- Напоминание к задаче: фронт `POST /tasks/:id/reminders` → `scheduler.js` планирует/шлёт DM/группу, учитывая reply_to.
- Событие: `POST /events` → создаётся Task(type=EVENT) + участники; `prime` создаёт `EventReminder` по offsets; срабатывание через планировщик.
- Предзадача: фронт `POST /pre-tasks` (+links) → `ARM`/`force-fire` → `evaluatePreTask` → создаёт Task в целевой фазе, уведомляет; денормализует graph‑ключи.
- Процесс (визуальный граф): фронт `saveProcess({nodes,edges})` → сервер upsert ноды (создаёт задачи по seed_new_*), хранит рёбра; фронт `fetchProcess` восстанавливает вид.
- Дедлайн/расходы/ярлыки/лайки/наблюдатели — прямые REST‑вызовы в соответствующие роутеры с проверками прав.
- Квота: при создании task/event/pretask сервер сверяет `UserQuota` и может вернуть `402 quota_exceeded`.
- Bounty/TON: расчёт курса, драфты, выплатные реквизиты (SBP), escrow‑переводы.

Покрытие файлов (назначение кратко)
- `api/src/server.js` — центральный сервер/маршрутизация/интеграция TG, часть ручек.
- `api/src/scheduler.js` — напоминания событий/задач, предзадачи, SSE.
- `api/src/routes/accept.js` — PATCH `/tasks/:id/accept-condition`.
- `api/src/routes/assign.js` — self‑assign, инвайты на назначение, пинг участнику, снятие назначения и пр.
- `api/src/routes/bounty.js` — TON курс/инвойсы/escrow/отправка.
- `api/src/routes/deadline.js` — PATCH дедлайна задачи.
- `api/src/routes/events.js` — CRUD событий, участники, напоминания, процесс‑граф группы.
- `api/src/routes/expenses.js` — PATCH расходов задачи.
- `api/src/routes/labels.js` — CRUD ярлыков группы, attach/detach к задачам, список ярлыков задачи.
- `api/src/routes/likes.js` — лайки задач и комментариев.
- `api/src/routes/notifications.js` — настройки уведомлений/тест.
- `api/src/routes/payoutMethod.js` — метод выплаты (SBP).
- `api/src/routes/pretasks.js` — CRUD предзадач, связи, ARM/CANCEL/force‑fire, защита от циклов.
- `api/src/routes/process.js` — сохранение/загрузка процесса группы (узлы/рёбра).
- `api/src/routes/quota.js` — квоты + покупки (Stars dev/инвойс).
- `api/src/routes/rank.js`, `api/src/routes/rating.js` — ранги/рейтинг/фичи.
- `api/src/routes/sharenewtask.js` — share шаблонной задачи (accept → копия в Inbox).
- `api/src/routes/stars.js` — агрегаты по StarLedger.
- `api/src/routes/tasks.js` — комментарии, отношения, удаление/вспом. логика (остальной CRUD в `server.js`).
- `api/src/routes/wallet-ton.js` — подключение/верификация TON кошелька.
- `api/src/setWebhook.js` — команды и webhook бота.
- `api/prisma/schema.prisma` — все модели (см. раздел «Данные»).
- `webapp/src/api.ts` (+`src/api/*.ts`) — клиент ко всем API.
- `webapp/src/App.tsx` — каркас UI, вкладки, интеграции.
- `webapp/src/pages/Home/HomePage.tsx` — лента задач/процесс оверлей.
- `webapp/src/pages/Groups/GroupList.tsx` — группы/публичные/вотчинг.
- `webapp/src/TaskView.tsx` — детальное редактирование задачи.
- `webapp/src/components/*` — UI подмодули (см. раздел «Фронтенд»).

Примечания о внешних библиотеках
- `api/opt/whisper.cpp` — вендорные скрипты: не документируем, используются для STT (Whisper); интеграция в сервере минимальна (эндпоинт `/stt/whisper`).
- `node_modules` — опущены.

FAQ / быстрые ориентиры
- Как понять, в какую TG‑группу слать уведомление по задаче? → см. `GROUP_SEP` и `resolveTaskGroup()` в `routes/tasks.js` и аналог в `server.js`.
- Где логика one‑shot напоминаний по событиям? → `scheduler.js` → `fireReminder/planOne/initReminderScheduler` + `EventReminder`.
- Как хранятся раскладки «процесса»? → `routes/events.js|process.js` (сервер), `TaskFeedProcessPage.tsx` (клиент), поля `ProcessNode.posX/posY`, `metaJson` и рёбра `ProcessEdge`.
- Откуда берутся Inbox/Doing/... в новых бордах? → `ensureDefaultColumns` (в нескольких местах: `events.js`, `server.js`).
- Как считаются ранги/фичи? → `routes/rating.js` (агрегации + `computeFeatures`).

Концы для доработок
- Если добавляете новые поля прав группы — синхронизировать проверки в соответствующих роутерах (`permEditJson` и `permOverrides`).
- При расширении процесса учитывать `metaJson.key` для стабильных «привязок» и денормализованные ключи в `Task/PreTask`.
- Для нотификаций/DM не забывать `writeAccessGranted`.

Контакты точек входа (коротко)
- Список задач/колонок: `GET /tasks?chatId=...&groupId=...` (см. фронт `fetchBoard`).
- Комментарии: `GET/POST/DELETE /tasks/:id/comments` (см. фронт `listComments/addComment/deleteComment`).
- Напоминания задач: `GET/POST/DELETE /tasks/:id/reminders` (`webapp/src/api/reminders.ts`).
- События: `POST/PATCH/DELETE /events`, участники `/events/:id/participants`, напоминания `/events/:id/reminders`, `prime`.
- Процесс: `GET/POST /groups/:groupId/process` (`fetchProcess/saveProcess`).
- Шэринг шаблонной задачи: `/sharenewtask/*`.
- Наблюдатели: `/tasks/:id/watchers`, `POST /watchers/invite`.
- Лайки: `/tasks/:id/likes`, `/tasks/:taskId/comments/:cid/likes`.
- Дедлайны: `PATCH /tasks/:id/deadline`.
- Ярлыки: `/groups/:gid/labels`, `/tasks/:tid/labels`.
- TON/кошелёк: `/wallet/ton/*`, bounty `/bounty/*`, выплаты `/payout-method`.
- Квоты: `/quota`, `/quota/purchase`.

---

## Важные технические заметки и решения

### 🔄 Повторяющиеся задачи (Recurring Tasks)

**Проблема:** Повторяющиеся задачи не создавались после первого срабатывания.

**Причины:**
1. При создании первой повторяющейся задачи через фронтенд не устанавливалось поле `startAt`
2. Планировщик (`scheduler.js`) требует `startAt` для режима `DATE_PLUS`, но его не было → задача не планировалась
3. При создании следующей повторяющейся задачи функция `calculateNextRecurringDate` не учитывала timezone пользователя → время сдвигалось на +3 часа (для Москвы)

**Решения:**
1. **Фронтенд** (`CreateTaskModal.tsx:864-917`):
   - Добавлена логика вычисления `startAt` на основе `recurringConfig.time` при создании задачи
   - Учитывается текущее время, паттерн (daily/monthly), исключенные дни, число месяца
   - Используется `setHours()` для работы в локальном времени, `toISOString()` конвертирует в UTC

2. **Бэкенд** (`scheduler.js:803,711`):
   - Исправлена сигнатура `createNextRecurringPreTask` для получения объекта `tg`
   - В функции `calculateNextRecurringDate:873-923` добавлен учёт timezone через `Intl.DateTimeFormat`
   - Вычисляется offset между UTC и локальным timezone пользователя
   - Следующая задача создаётся в **то же локальное время** (17:48 Москва → 17:48 Москва на следующий день)

**Ключевые файлы:**
- `webapp/src/components/create-task/CreateTaskModal.tsx` - вычисление `startAt` при создании
- `api/src/scheduler.js` - функции `calculateNextRecurringDate`, `createNextRecurringPreTask`

---

### 🔗 Значки связей на карточках задач (Process Indicators)

**Проблема:** На карточках задач показывались кружки со стрелками (индикаторы связей), но при клике на полотне ничего не было.

**Причина:**
- API эндпоинты `GET /tasks/:id` и `GET /tasks` (список) не возвращали вычисленные поля:
  - `processLeftCount` - количество входящих связей
  - `processRightCount` - количество исходящих связей
  - `preChildrenCount` - количество связанных предзадач
  - `processHasEdges` - булевый флаг наличия связей
- В базе хранятся только массивы `processLeftKeys` и `processRightKeys`
- Фронтенд полагался на эти вычисленные поля для отображения индикаторов

**Решение:**
1. **API** (`server.js:1350-1370` и `server.js:447-469`):
   - В эндпоинте `GET /tasks/:id` добавлено вычисление полей на основе `processLeftKeys` и `processRightKeys`
   - В функции `enrichColumnsWithAssignees` (используется в `GET /tasks`) добавлена та же логика
   - Вычисление: `processLeftCount = processLeftKeys.length`, аналогично для `Right`
   - `preChildrenCount` = количество ключей вида `"pretask:*"` в `processRightKeys`

2. **Логика отображения** (`HomePage.tsx:1830-1831`):
   - Значок показывается только если `processLeftCount > 0` или `processRightCount > 0`
   - Для задач без связей индикатор не отображается (даже если `fromProcess: true`)

**Ключевые файлы:**
- `api/src/server.js` - функция `enrichColumnsWithAssignees`, эндпоинт `GET /tasks/:id`
- `api/src/routes/tasks.js` - эталонная логика вычисления (строки 790-796)
- `webapp/src/pages/Home/HomePage.tsx` - отображение `EdgePreTaskBadge`

---

### 🏋🏻 Отображение сложности задачи (Complexity Display)

**Фича:** Добавлено отображение сложности задачи (1-10) в карточках ленты.

**Реализация:**
1. **Фронтенд - компонент FeedTaskCard** (`components/feed/FeedTaskCard.tsx:19,49,157-161`):
   - Добавлен проп `complexity?: number | null`
   - Если `complexity > 0`, отображается `🏋🏻 (N)` с tooltip "Сложность: N/10"
   - Отображается после напоминания, перед условиями приёмки

2. **Фронтенд - HomePage** (`pages/Home/HomePage.tsx:2169-2179`):
   - В основном рендере карточек в ленте добавлен инлайн-блок с complexity
   - Используется `(t as any).complexity` из данных API
   - Также добавлено в объекты `card` для процессного полотна (строки 1872, 2440, 2555)

3. **API** (уже было реализовано):
   - Поле `complexity` уже возвращается в эндпоинтах `/tasks` и `/tasks/:id`
   - Хранится в базе в таблице `Task.complexity: Int`

**Отображение:**
```
⏰ 15:30
🏋🏻 (5)
```

**Ключевые файлы:**
- `webapp/src/components/feed/FeedTaskCard.tsx` - компонент карточки
- `webapp/src/pages/Home/HomePage.tsx` - рендер в ленте и на полотне
- `api/prisma/schema.prisma` - модель Task с полем complexity

---

### 📊 API: Сериализация данных задач

**Важно:** При добавлении новых полей в карточки задач нужно обновить в **трёх местах**:

1. **GET /tasks/:id** (`server.js:1350-1375`) - одна задача
2. **GET /tasks** через `enrichColumnsWithAssignees` (`server.js:447-469`) - список задач в колонках
3. **GET /api/tasks** через `routes/tasks.js:780-831` - альтернативный эндпоинт списка (используется реже)

**Стандартные вычисляемые поля:**
```javascript
// Process graph stats
const leftKeys = Array.isArray(t.processLeftKeys) ? t.processLeftKeys : [];
const rightKeys = Array.isArray(t.processRightKeys) ? t.processRightKeys : [];
const processLeftCount = leftKeys.length;
const processRightCount = rightKeys.length;
const preChildrenCount = rightKeys.filter(k => String(k).startsWith('pretask:')).length;
const processHasEdges = (processLeftCount + processRightCount) > 0;
```

**Примечание:** Фронтенд ожидает эти поля для правильного отображения индикаторов и связей.

---

### 🕐 Timezone и работа с датами

**Важно:** При работе с повторяющимися задачами и напоминаниями:

1. **Хранение в БД:** Все даты хранятся в UTC (`DateTime` в Prisma)
2. **Timezone пользователя:** Хранится в `PreTask.timezone` (например, "Europe/Moscow")
3. **Конвертация:**
   - Фронтенд: использует `setHours()` (работает в локальном времени) → `toISOString()` (конвертирует в UTC)
   - Бэкенд: использует `Intl.DateTimeFormat` с `timeZone` для работы в локальном времени пользователя
   - Вычисляется offset между UTC и локальным временем для корректных расчётов

**Пример:** Пользователь в Москве (UTC+3) создаёт задачу на 17:48:
- В БД: `startAt: 2025-10-08T14:48:00.000Z` (UTC)
- Отображается: 17:48 (локальное время)
- Следующая задача: `startAt: 2025-10-09T14:48:00.000Z` (UTC) → 17:48 по Москве (не 20:48!)

**Ключевая функция:** `calculateNextRecurringDate` в `scheduler.js:873-950`

---

### 🎨 Сборка и деплой

**Процесс обновления после изменений:**

```bash
# 1. Сборка фронтенда
cd /var/www/telegsar/webapp
npm run build

# 2. Перезапуск API (если были изменения в бэкенде)
pm2 restart telegsar-api

# 3. Проверка логов
pm2 logs telegsar-api --lines 20

# 4. Для пользователей: полное закрытие Telegram для обновления WebApp
```

**Важно:**
- Telegram WebApp агрессивно кэширует статику
- Пользователям нужно **полностью закрыть Telegram** (свайпнуть из списка приложений) для обновления
- Или использовать hard refresh в WebApp (зависит от платформы)

---

## 🪄 AI-помощник создания процессов

**Дата:** 2025-10-08

### Описание функции

AI-помощник для создания процессов с использованием OpenAI GPT-4o. Интегрирован в полотно процессов (TaskFeedProcessPage).

### Компоненты

**Frontend** (`webapp/src/components/ai-process/`):
- `AIProcessButton.tsx` - кнопка 🪄 на полотне процессов (справа внизу)
- `AIProcessModal.tsx` - полноэкранная модалка с чатом
- `AIProcessChat.tsx` - область сообщений с auto-scroll
- `AIProcessMessage.tsx` - пузырьки сообщений (user/assistant)
- `AIProcessInput.tsx` - поле ввода с авто-ресайзом

**Backend** (`api/src/`):
- `services/openai.js` - сервис работы с OpenAI API
- `routes/ai-process.js` - роуты `/ai/process/message` и `/ai/process/create`

### Особенности реализации

**System Prompt:**
- Объясняет DSL-формат процессов (@->@, ×->@, ×->×, @->@*, @->@[ids])
- Атрибуты задач: 🚩 deadline, ⏰ reminder, ⚫ complexity, 💶 bounty, ☝️ approval, 🤳 photo, 📄 document
- Запланированное создание: @[date,time]Name
- Маркер готовности: [PROCESS_READY] в конце описания процесса

**Контекст группы:**
```javascript
// buildContext в routes/ai-process.js
{
  groupInfo: { title, description },
  members: [{ name, role, description }],
  existingTasksCount: number
}
```

**Хранение диалога:**
- Диалог хранится в памяти (useState в AIProcessModal)
- Не сохраняется в БД (MVP)
- При закрытии модалки диалог теряется

**Парсинг DSL:**
- Функция `parseProcessDSL()` пока stub
- Будущая задача: парсить текстовое описание процесса в nodes/edges
- Кнопка "✅ Создать процесс" появляется при наличии processResult

### Позиционирование кнопки

```css
position: fixed;
right: 16px;
bottom: calc(84px + env(safe-area-inset-bottom, 0px));
width: 56px;
height: 56px;
```

Совпадает с позиционированием кнопки + на полотне процессов.

### Environment

Требуется добавить в `api/.env`:
```
OPENAI_API_KEY=your_openai_api_key_here
```

### API Endpoints

**POST /ai/process/message**
```json
Request: {
  "messages": [{ "role": "user", "content": "..." }],
  "groupId": "uuid",
  "chatId": "tg_chat_id"
}

Response: {
  "message": { "role": "assistant", "content": "..." },
  "processReady": false
}
```

**POST /ai/process/create** (stub)
```json
Request: {
  "description": "текстовое описание процесса",
  "groupId": "uuid",
  "chatId": "tg_chat_id"
}

Response: {
  "nodes": [],
  "edges": []
}
```

### Интеграция в TaskFeedProcessPage

```typescript
// Line 122: state
const [aiModalOpen, setAiModalOpen] = useState(false);

// Line 725-735: components
<AIProcessButton onClick={() => setAiModalOpen(true)} />
<AIProcessModal
  isOpen={aiModalOpen}
  onClose={() => setAiModalOpen(false)}
  groupId={resolvedGroupId}
  chatId={chatId}
/>
```

### Будущие улучшения

1. **Парсинг DSL** - реализовать parseProcessDSL для создания nodes/edges
2. **Streaming** - добавить потоковую передачу ответов OpenAI
3. **Сохранение диалога** - опционально в БД для продолжения сессии
4. **Редактирование** - возможность редактировать процесс перед созданием
5. **Weather API** - условные задачи на основе погоды (@[weather:rain]...)

---

Конец файла.
