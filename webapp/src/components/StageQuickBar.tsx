// src/components/StageQuickBar.tsx
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import WebApp from '@twa-dev/sdk';
import { fetchBoard, moveTask, reopenTask, completeTask } from '../api';
import type { StageKey } from './StageScroller';

const ORDER: StageKey[] = ['Inbox', 'Doing', 'Done', 'Cancel', 'Approval', 'Wait'];

type Props = {
  anchorId: string;             // ← id DOM-элемента карточки (button), над которым показываем бар
  taskId: string;
  groupId: string | null;
  meChatId: string;
  currentPhase?: StageKey | string;
  onPicked?: (next: StageKey) => void;
  onRequestClose?: () => void;
  edgeInset?: number;
  onComplete?: () => Promise<boolean | void>; // если вернёт true — считаем завершено
};

const COLORS: Record<StageKey, { bg: string; brd: string; fg: string }> = {
  Inbox:    { bg: '#121722', brd: '#2a3346', fg: '#e8eaed' },
  Doing:    { bg: '#10223a', brd: '#274864', fg: '#d7eaff' },
  Done:     { bg: '#15251a', brd: '#2c4a34', fg: '#d7ffd7' },
  Cancel:   { bg: '#3a1f1f', brd: '#5a2b2b', fg: '#ffd7d7' },
  Approval: { bg: '#3a2a10', brd: '#6a4a20', fg: '#ffe5bf' },
  Wait:     { bg: '#102a3a', brd: '#274864', fg: '#d7f0ff' },
};

function labelOf(s: StageKey): string {
  switch (s) {
    case 'Inbox': return 'В новое';
    case 'Doing': return 'В работе';
    case 'Done': return 'Завершить';
    case 'Cancel': return 'Отмена';
    case 'Approval': return 'Согласование';
    case 'Wait': return 'Ждёт';
    default: return s;
  }
}

export default function StageQuickBar({
  anchorId, taskId, groupId, meChatId, currentPhase,
  onPicked, onRequestClose, edgeInset = 12, onComplete,
}: Props) {
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // загрузка колонок
  useEffect(() => {
    if (!meChatId) return;
    let alive = true;
    fetchBoard(meChatId, groupId ?? undefined)
      .then((r) => {
        if (!alive || !r?.ok) return;
        const map: Record<string, string> = {};
        for (const c of r.columns) map[c.name] = c.id;
        setColMap(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [meChatId, groupId]);

  const stages: StageKey[] = useMemo(
    () => ORDER.filter((s) => !!colMap[s]),
    [colMap]
  );

  const active: StageKey | undefined =
    (ORDER as string[]).includes(String(currentPhase)) ? (currentPhase as StageKey) : undefined;

  // ---- позиционирование модалки над карточкой
const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean }>({
  top: 0, left: 12, width: 320, above: true
});


const recompute = () => {
  const el = document.getElementById(anchorId);
  if (!el) return;

  const r = el.getBoundingClientRect();
  const GAP = 6;

  // Пытаемся показать над карточкой (с translateY), если хватает места
  const hasRoomAbove = r.top >= 52; // 44px панель + запас
  const top = hasRoomAbove ? (r.top - GAP) : (r.bottom + GAP);
  const above = hasRoomAbove;

  const viewportW = document.documentElement.clientWidth;
  const cardWidth = Math.max(0, r.width - 2 * edgeInset);

  let left = r.left + edgeInset;
  // клампы по краям
  left = Math.max(8, Math.min(left, viewportW - 8));

  // ширина — не шире карточки и вьюпорта
  const maxWidth = Math.max(120, viewportW - left - 8);
  const width = Math.max(120, Math.min(cardWidth, maxWidth));

  setPos({
    top: Math.round(top),
    left: Math.round(left),
    width: Math.round(width),
    above,
  });
};


  useEffect(() => {
    // при открытии: позиция + запрет скролла фона
    recompute();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onResize = () => recompute();
    const onScroll = () => recompute();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onRequestClose?.(); };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchorId]);

  const handlePick = async (next: StageKey) => {
    if (busy) return;
    if (!colMap[next]) return;
    if (active === next) { onRequestClose?.(); return; }

    try {
      setBusy(true);
      if (next === 'Done') {
        if (typeof onComplete === 'function') {
          const ok = await onComplete();
          if (ok) {
            try { WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
            onPicked?.(next);
            onRequestClose?.();
            return;
          }
          // если кастом не завершил — просто закрываем и выходим
          onRequestClose?.();
          return;
        }
        await completeTask(taskId);
        try { WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
        onPicked?.(next);
        onRequestClose?.();
        return;
      }
      if (active === 'Done') {
        await reopenTask(taskId);
      }
      await moveTask(taskId, colMap[next], 0);
      try { WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch {}
      onPicked?.(next);
      onRequestClose?.();
    } catch {
      alert('Не удалось сменить стадию');
    } finally {
      setBusy(false);
    }
  };

  if (!stages.length) return null;

  // ---- модальная подложка: блокирует клики и скролл фона
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'rgba(9,11,18,0.35)',
        overscrollBehavior: 'contain',
        touchAction: 'none',
      }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRequestClose?.(); }}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onTouchMove={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div
        onClick={(e) => { e.stopPropagation(); }}
        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
        onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
        onTouchMove={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}



        
       style={{
  position: 'fixed',
  top: pos.top,
  left: pos.left,
  width: pos.width,
  height: 44,
  transform: pos.above ? 'translateY(-100%)' : 'none', // ← ключ
  borderRadius: 12,
  background: '#0b1220',
  border: '1px solid #2a3346',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  overflowX: 'auto',
  overflowY: 'hidden',
  touchAction: 'pan-x',
  WebkitOverflowScrolling: 'touch',
  boxShadow: '0 8px 24px rgba(0,0,0,.35)',
  zIndex: 3001,
  userSelect: 'none',
  pointerEvents: 'auto',
}}


      >




        {stages.map((s) => {
          const c = COLORS[s];
          const isActive = s === active;
          return (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePick(s); }}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 12px',
                height: 32,
                borderRadius: 999,
                border: `1px solid ${c.brd}`,
                background: isActive ? c.brd : c.bg,
                color: c.fg,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {labelOf(s)}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
