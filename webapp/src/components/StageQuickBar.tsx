import { useEffect, useMemo, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { fetchBoard, moveTask, reopenTask, completeTask } from '../api';
import type { StageKey } from './StageScroller';

const ORDER: StageKey[] = ['Inbox', 'Doing', 'Done', 'Cancel', 'Approval', 'Wait'];

type Props = {
  taskId: string;
  groupId: string | null;
  meChatId: string;
  /** Текущая фаза задачи (если знаем). Можно строку — подсветим только базовые */
  currentPhase?: StageKey | string;
  /** вызываем после успешного изменения стадии */
  onPicked?: (next: StageKey) => void;
  /** закрыть панель */
  onRequestClose?: () => void;

  edgeInset?: number;
};

const COLORS: Record<StageKey, { bg: string; brd: string; fg: string }> = {
  Inbox:    { bg: '#121722', brd: '#2a3346', fg: '#e8eaed' },
  Doing:    { bg: '#10223a', brd: '#274864', fg: '#d7eaff' },     // синий
  Done:     { bg: '#15251a', brd: '#2c4a34', fg: '#d7ffd7' },     // зелёный
  Cancel:   { bg: '#3a1f1f', brd: '#5a2b2b', fg: '#ffd7d7' },     // красный
  Approval: { bg: '#3a2a10', brd: '#6a4a20', fg: '#ffe5bf' },     // оранжевый
  Wait:     { bg: '#102a3a', brd: '#274864', fg: '#d7f0ff' },     // голубой
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
  taskId, groupId, meChatId, currentPhase, onPicked, onRequestClose, edgeInset = 12,
}: Props) {
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // загрузка колонок текущей доски
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

  const wrapRef = useRef<HTMLDivElement | null>(null);

  // клик вне — закрыть
  useEffect(() => {
    const onDocDown = (e: Event) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) onRequestClose?.();
    };
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('touchstart', onDocDown, true as any);
    return () => {
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('touchstart', onDocDown, true as any);
    };
  }, [onRequestClose]);

  const handlePick = async (next: StageKey) => {
    if (busy) return;
    if (!colMap[next]) return;
    if (active === next) { onRequestClose?.(); return; }

    try {
      setBusy(true);

      if (next === 'Done') {
        await completeTask(taskId);
        try { WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
        onPicked?.(next);
        onRequestClose?.();
        return;
      }

      // если были в Done — сначала reopen
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

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'absolute',
      left: edgeInset,
      right: edgeInset,
        top: 0,
       
        height: 44,
        borderRadius: 12,
        background: '#0b1220',
        border: '1px solid #2a3346',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        overflowX: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,.35)',
        zIndex: 5,
        userSelect: 'none',
      }}


      onContextMenu={(e) => e.preventDefault()}
    >
      {stages.map((s) => {
        const c = COLORS[s];
        const isActive = s === active;
        return (
          <button
            key={s}
            disabled={busy}
            onClick={() => handlePick(s)}
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
  );
}
