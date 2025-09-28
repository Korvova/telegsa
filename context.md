Telegsar — working context and notes

Date: 2025-09-28

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

Files changed
- webapp/src/components/create-task/IosQuickCreatePanel.tsx
  - Compute `vvLift = window.innerHeight - visualViewport.height`.
  - Compute `ideal = max(kbBottom, kbFallback)`.
  - Apply `lift = vvLift > 0 ? min(ideal, vvLift) : max(kbBottom, 0)`.
  - Use `lift` for panel `transform` and pass as `dockBottom` to `GroupPicker`.
  - Only set `kbFallback` on iOS.

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
