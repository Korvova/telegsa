Telegsar — working context and notes

Date: 2025-09-28

ВАЖНО!
- На iPhone для гарантированного показа клавиатуры недостаточно вызвать `.focus()` на поле ввода — необходимо также выставить каретку внутрь поля (например, через `setSelectionRange(len, len)`), иначе iOS может проигнорировать подъем клавиатуры.

Topic: iOS quick create panel (IosQuickCreatePanel.tsx) docks above keyboard too high on iPhone when pressing (+) on the main screen.

Symptoms
- On iOS, the quick panel initially appears lifted far above the keyboard on first open, then settles; on Android it’s OK.
- In Settings → 🧪 Тест клавиатуры the input field docks correctly above the keyboard.

Root cause
- `IosQuickCreatePanel` used a fallback lift `kbFallback=340` during open and directly applied `transform: translateY(-max(kbBottom, kbFallback))`.
- When the iOS keyboard wasn’t yet reported by VisualViewport (`vvLift == 0`), this fallback pre‑lifted the panel, making it float too high above the keyboard.

Fix
- Cap the applied lift by the current VisualViewport overlap (same pattern used in `CreateTaskModal`).
- Ignore the fallback until the keyboard is actually open (i.e., when `vvLift > 0`).
- Minor: apply the fallback only on iOS; add a small transform transition for smoother motion.
- Add dimmed + blurred backdrop to overlay; lock html/body overflow+height and call `WebApp.disableVerticalSwipes()` + `WebApp.expand()` while open to prevent background feed jumps/bounce.

29 Sep — Flicker fix
- Found a regression: early `return` in the open-effect skipped focus + arming on iOS. Restored arming/focus and kept iOS fallback.
- Removed transform animation; freeze applied lift to the maximum seen during open to prevent bouncing while VisualViewport settles.
- Close panel immediately on empty-area touchstart/pointerdown/mousedown (not waiting for a click event) for more natural dismiss.

Files changed
- webapp/src/components/create-task/IosQuickCreatePanel.tsx
  - Compute `vvLift = window.innerHeight - visualViewport.height`.
  - Compute `ideal = max(kbBottom, kbFallback)`.
  - Apply `lift = vvLift > 0 ? min(ideal, vvLift) : max(kbBottom, 0)`.
  - Use `lift` for panel `transform` and pass as `dockBottom` to `GroupPicker`.
  - Only set `kbFallback` on iOS.
  - Add backdrop (rgba + backdrop-filter), lock html/body overflow/height, and use TWA APIs to stabilize viewport.

Structure (App/main/index) — notes
- Entry: `webapp/src/main.tsx` рендерит `<App />` и импортирует `src/lib/viewportKeyboard.ts` (глобальный апдейтер CSS‑переменной `--kb` на основе VisualViewport + TWA). В iOS‑панели `--kb` не используется; расчёт лифта локальный.
- Корень: `index.html` с `#root`. Глобальные стили (`src/index.css`) фиксируют `html, body, #root { height: 100% }` и `min-height: 100dvh`; `body` имеет `overflow-x:hidden` и `overscroll-behavior-x: contain`.
- Панель открывается из `CreateTaskFab` (`App.tsx:1250`), который для iOS рендерит `IosQuickCreatePanel`.
- Возможный источник «ложного лифта»: TWA viewport бывает меньше `innerHeight` до открытия клавиатуры. Это давало `raw>threshold` и поднимало панель.

30 Sep — Pre‑lift mitigation
- В `useKeyboardInsets` добавлен флаг `useTWA` (по умолчанию true).
- Для iOS‑панели `useTWA=false` — расчёт лифта только по VisualViewport; TWA не влияет до реального открытия клавиатуры.
- Порог поднят до 120px, чтобы исключить системные бары.

Next steps (if needed)
- Вынести логику из `SettingsKeyboardTest` (hook `useKeyboardDock`) и переиспользовать в панели.
- Опционально рендерить панель без portal (в дереве ленты) и замкнуть события на контейнер ленты.
- Добавить dev‑метрики (vv.height/offsetTop/raw) для диагностики конкретных моделей iOS.

Final stabilized implementation (Oct 01)
- Docking logic: переиспользован стабильный алгоритм из `SettingsKeyboardTest.tsx` как хук `useKeyboardDock` — управляет `transform` панели по VisualViewport (без TWA), делает короткое «follow» при открытии клавиатуры и блокирует рывки.
- Overlay close: панель закрывается только при тапе ВНЕ самой панели; клики по элементам панели не закрывают её. Проверка выполняется по `microRef.contains(target)`.
- Background lock (минимальный): фиксируем `body.position=fixed` + сохраняем `scrollY`, у `html` `overscroll-behavior-y: contain`. Без изменения `overflow/height`, что убирает «чёрный экран» при глубоком скролле.
- Blur: отключён на iOS — используем только прозрачное затемнение `rgba(0,0,0,.35)`, чтобы карточки оставались видны на любом смещении.
- TWA: вклад TWA‑высоты игнорируется для панели, расчёты выполняются только по VisualViewport, чтобы не было ложного лифта до открытия клавиатуры.
- Caret bootstrap: при открытии многократно ставим каретку в конец textarea до подтверждения открытия клавиатуры.
- Paperclip/Robot focus: при нажатии на 📎/🤖 клавиатура остаётся открытой, фокус и каретка удерживаются в textarea (обработчики `onMouseDownCapture/onTouchStartCapture` + `ensureCaretFocus()` после клика).
- Только для 📎/🤖: дополнительно поддерживаем фокус при любом переключении панели инструментов (`toolsOpen`) через `useEffect([toolsOpen])` — клавиатура остаётся открытой и при открытии, и при закрытии инструментов.
- На iOS важно не только `focus`, но и наличие каретки: при обработке 📎/🤖 на `mousedown/touchstart` вызываем `preventDefault()` чтобы кнопка не уводила фокус, а затем несколько раз подряд восстанавливаем каретку (`refocusWithCaretStrong`) — сразу, через `requestAnimationFrame`, и через 80–160 мс, чтобы перекрыть перерисовку.
- Выбор группы по центру: при открытии GroupPicker инпут блюрится, а сам пикер рендерится строго по центру экрана (в панели передаём `dockBottom={0}`, чтобы на iOS не влияла высота клавиатуры).

Files (final)
- webapp/src/hooks/useKeyboardDock.ts — новый хук (экстракт из SettingsKeyboardTest), управляет докингом панели к клавиатуре.
- webapp/src/components/create-task/IosQuickCreatePanel.tsx — подключение `useKeyboardDock`, минимальный lock фона, оверлей закрывает только «снаружи», фокус при 📎/🤖, игнор TWA для панели.
- webapp/src/hooks/useKeyboardInsets.ts — добавлен флаг `useTWA` (по умолчанию true), но панель им не пользуется для лифта.

Build
- Ran `npm run build` in `webapp` after changes to ensure the bundle updates. Build succeeded.

Commit & push
- Branch: `process` (tracking `origin/process`).
- Commit: iOS quick panel fix + context (hash to start: recorded in repo at push time).
- Remote: `origin` `git@github.com:Korvova/telegsa.git`.
- Pushed successfully.

Notes for future changes
- Keep iOS docking logic consistent across components: prefer keyboard HEIGHT only and cap by current VisualViewport overlap.
- Avoid applying fallback lift before keyboard is actually open.

02 Oct — Center regressions + fix
- Симптом: окна «Условия/Напоминания» оказывались внизу. Причины: низкий z-index модалок (2200) относительно фонового слоя панели (999999), фон панели перехватывал клики.
- Исправление: у модалок zIndex=1000005, фон панели делает pointerEvents: none при открытой модалке; добавлены стопы pointer‑событий (mouse/pointer/touch) на контейнерах модалок. Затемнение — 0.8 (+ blur на non‑iOS).
- Восстановление каретки после закрытия X: для модалок и чипов — серия refocus (0/80/160мс).
ВАЖНО!
- На iPhone для гарантированного показа клавиатуры недостаточно вызвать `.focus()` на поле ввода — необходимо также выставить каретку внутрь поля (например, через `setSelectionRange(len, len)`), иначе iOS может проигнорировать подъем клавиатуры.
02 Oct — Centering modals restored
- Проблема: окна на панели (☝️/⏰/Группа/🚩) показывались внизу. Причины — отсутствие portal в body для части модалок и конкуренция по z-index/событиям с фоновым слоем панели.
- Исправление:
  - GroupPicker и DeadlinePicker рендерятся через createPortal в document.body, z-index=1000005.
  - Accept/Reminders: стоп pointer‑событий на контейнере, усиленный z-index, фон панели делает pointerEvents: none при открытой модалке.
  - Затемнение 0.8; blur только на non‑iOS (на iOS отключён).
  - После закрытия — always refocus (0/80/160мс).

2025-09-28 — iOS: модальные окна по центру (стабильно)
- Исправлено центрирование «☝️ Условия приёма», «⏰ Напоминание», «📸 Камера»: теперь рендерятся через portal в `document.body`, учитывают `dockBottom` и блокируют всплытие pointer‑событий, как «Выбор группы» и «🚩 Дедлайн».
- Оверлей панели не закрывает панель, пока открыта любая модалка.
- Укреплён хендлинг событий в `DeadlinePicker` (mousedown/pointerdown/touchstart + capture).
- `CameraCaptureModal` поддерживает `dockBottom` и такой же стоп событий.
- Сборка: `webapp` — `npm run build` успешно.
