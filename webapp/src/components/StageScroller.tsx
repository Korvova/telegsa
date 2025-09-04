import { useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { fetchBoard, moveTask, reopenTask } from '../api';

export type StageKey = 'Inbox' | 'Doing' | 'Done' | 'Cancel' | 'Approval' | 'Wait';

const ORDER: StageKey[] = ['Inbox', 'Doing', 'Done', 'Cancel', 'Approval', 'Wait'];

type Props = {
  taskId: string;
  type?: 'TASK' | 'EVENT';
  currentPhase?: StageKey | string;  // допустимы и кастомные имена, но подсветим только базовые
  groupId: string | null;            // null = личная доска
  meChatId: string;                  // для fetchBoard
  onPhaseChanged?: (next: StageKey) => void;
  onRequestComplete?: () => void;    // для Done — вызвать вашу анимацию/completeTask
};

export default function StageScroller(props: Props) {
  const {
    taskId,
    type: _type = 'TASK',
    currentPhase,
    groupId,
    meChatId,
    onPhaseChanged,
    onRequestComplete,
  } = props;

  // не показываем для событий


  const [colMap, setColMap] = useState<Record<string, string>>({}); // name -> columnId
  const [busy, setBusy] = useState(false);

  // загружаем маппинг колонок текущей доски
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
      .catch(() => {})
      ;
    return () => { alive = false; };
  }, [meChatId, groupId]);

  // какие стадии реально доступны (есть соответствующая колонка)
  const stages: StageKey[] = useMemo(
    () => ORDER.filter((s) => !!colMap[s]),
    [colMap]
  );

  const active: StageKey | undefined =
    (ORDER as string[]).includes(String(currentPhase)) ? (currentPhase as StageKey) : undefined;

  const handlePick = async (next: StageKey) => {
    if (busy) return;
    if (!colMap[next]) return; // на всякий
    if (active === next) return;

    try {
      setBusy(true);

      // особый случай "Done" → отдаём наверх (ваша логика completeTask + анимация)
      if (next === 'Done') {
        onRequestComplete?.();
        return;
      }

      // если были в Done — сначала reopen, затем move
      if (active === 'Done') {
        await reopenTask(taskId);
      }

      await moveTask(taskId, colMap[next], 0);
      onPhaseChanged?.(next);
      try { WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch {}

    } catch (e) {
      alert('Не удалось сменить стадию');
      // можно залогировать e
    } finally {
      setBusy(false);
    }
  };

  if (!stages.length) return null;

  return (
    <div
      style={{
        margin: '8px 0 6px',
        // контейнер
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        WebkitOverflowScrolling: 'touch',
        borderRadius: 12,
        border: '1px solid #2a3346',
        background: '#1b2030',
        padding: 6,
        maxWidth: '100%',
      }}
    >
      {stages.map((s) => {
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
              marginRight: 6,
              padding: '8px 12px',
              height: 38,                // примерно как у вашей кнопки "Сохранить"
              borderRadius: 999,
              border: '1px solid #2a3346',
              background: isActive ? '#202840' : '#121722',
              color: isActive ? '#8aa0ff' : '#e8eaed',
              fontSize: 14,
              cursor: 'pointer',
              userSelect: 'none',
              opacity: busy ? 0.8 : 1,
            }}
          >
            {labelOf(s)}
          </button>
        );
      })}
    </div>
  );
}

function labelOf(s: StageKey): string {
  switch (s) {
    case 'Inbox': return 'В новое';
    case 'Doing': return 'В работе';
    case 'Done': return 'Завершить';
    case 'Cancel': return 'Отмена';
    case 'Approval': return 'На согласовании';
    case 'Wait': return 'Ждёт';
    default: return s;
  }
}
