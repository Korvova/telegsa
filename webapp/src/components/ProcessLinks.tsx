import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { getTaskRelations, fetchProcess } from '../api';

type Links = { id: string; text: string };
type Deg = { in: number; out: number } | null;

type Props = {
  taskId: string;
  taskText?: string;
  taskAssigneeChatId?: string | null;
  groupId: string | null | undefined;
  meChatId: string;
  onClose?: (groupId?: string | null) => void;
  /** Показать списки входящих/исходящих связей под карточкой */
  showLists?: boolean;
};

export default function ProcessLinks({
  taskId,
  taskAssigneeChatId,
  groupId,
  meChatId,
  onClose,
  showLists = true,
}: Props) {
  const [relations, setRelations] = useState<{ outgoing: Links[]; incoming: Links[] }>({ outgoing: [], incoming: [] });
  const [procDeg, setProcDeg] = useState<Deg>(null);

  // связи задачи
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getTaskRelations(taskId);
        if (!alive) return;
        setRelations({ outgoing: r?.outgoing || [], incoming: r?.incoming || [] });
      } catch {}
    })();
    return () => { alive = false; };
  }, [taskId]);

  // степени в групповом процессе
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!groupId) { setProcDeg(null); return; }
      try {
        const r = await fetchProcess(String(groupId));
        if (!r?.ok) return;
        const nodes = r.nodes || [];
        const edges = r.edges || [];
        const taskIdByNode = new Map<string, string>();
        for (const n of nodes) {
          const meta = (() => { try { return JSON.parse(n.metaJson || '{}'); } catch { return {}; } })() as any;
          const tId = meta?.taskId ? String(meta.taskId) : '';
          if (tId) taskIdByNode.set(String(n.id), tId);
        }
        const degByTask = new Map<string, { in: number; out: number }>();
        for (const e of edges as Array<{ sourceNodeId: string | number; targetNodeId: string | number }>) {
          const sTask = taskIdByNode.get(String(e.sourceNodeId));
          const tTask = taskIdByNode.get(String(e.targetNodeId));
          if (sTask) degByTask.set(sTask, { in: (degByTask.get(sTask)?.in || 0), out: (degByTask.get(sTask)?.out || 0) + 1 });
          if (tTask) degByTask.set(tTask, { in: (degByTask.get(tTask)?.in || 0) + 1, out: (degByTask.get(tTask)?.out || 0) });
        }
        if (!alive) return;
        setProcDeg(degByTask.get(String(taskId)) || null);
      } catch {}
    })();
    return () => { alive = false; };
  }, [groupId, taskId]);

  const hasIncoming = (relations.incoming.length > 0) || ((procDeg?.in ?? 0) > 0);
  const hasOutgoing = (relations.outgoing.length > 0) || ((procDeg?.out ?? 0) > 0);

  // левая кнопка
  const openLeft = () => {
    try { WebApp?.HapticFeedback?.impactOccurred?.('soft'); } catch {}
    const inProcess = !!procDeg;

    if (hasIncoming) {
      window.dispatchEvent(new CustomEvent('open-process', {
        detail: { groupId, focusTaskId: taskId, backToTaskId: taskId },
      }));
    } else if (inProcess) {
      window.dispatchEvent(new CustomEvent('open-process', {
        detail: { groupId, focusTaskId: taskId, spawnPrevForFocus: true, backToTaskId: taskId },
      }));
    } else {
      window.dispatchEvent(new CustomEvent('open-process', {
        detail: {
          groupId,
          seedTaskId: taskId,
          seedAssigneeChatId: (taskAssigneeChatId || meChatId || null),
          seedPrev: true, // 👈 новый флаг «посев слева»
          backToTaskId: taskId,
        },
      }));
    }
    onClose?.(groupId || null);
  };

  // правая кнопка
  const openRight = () => {
    try { WebApp?.HapticFeedback?.impactOccurred?.('soft'); } catch {}
    const inProcess = !!procDeg;

    if (hasOutgoing) {
      window.dispatchEvent(new CustomEvent('open-process', {
        detail: { groupId, focusTaskId: taskId, backToTaskId: taskId },
      }));
    } else if (inProcess) {
      window.dispatchEvent(new CustomEvent('open-process', {
        detail: { groupId, focusTaskId: taskId, seedNewRight: true, backToTaskId: taskId }, // 👈 App ждёт seedNewRight
      }));
    } else {
      window.dispatchEvent(new CustomEvent('open-process', {
        detail: {
          groupId,
          seedTaskId: taskId,
          seedAssigneeChatId: (taskAssigneeChatId || meChatId || null),
          backToTaskId: taskId,
        },
      }));
    }
    onClose?.(groupId || null);
  };

  return (
    <>
      {/* КНОПКИ-ТОЧКИ. Родитель должен быть position:relative */}
      <button
        aria-label="Связи слева / добавить предыдущую"
        onClick={openLeft}
        style={{
          position: 'absolute', left: -12, bottom: 8,
          width: 24, height: 24, borderRadius: '50%',
          border: '1px solid #2a3346',
          background: hasIncoming ? '#111' : '#9aa0a6',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}
        title={hasIncoming ? 'Открыть процесс (входящие связи)' : 'Добавить предыдущую задачу в процессе'}
      />
      <button
        aria-label="Связи справа / продолжить процесс"
        onClick={openRight}
        style={{
          position: 'absolute', right: -12, bottom: 8,
          width: 24, height: 24, borderRadius: '50%',
          border: '1px solid #2a3346',
          background: hasOutgoing ? '#111' : '#9aa0a6',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}
        title={hasOutgoing ? 'Открыть процесс (есть продолжение)' : 'Продолжить процесс (создать связь)'}
      />

      {/* Списки связей (по желанию) */}
      {showLists && (relations.incoming.length > 0 || relations.outgoing.length > 0) && (
        <div style={{ marginTop: 16, borderTop: '1px solid #2a3346', paddingTop: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {relations.outgoing.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>→ Связанные</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {relations.outgoing.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('open-task', { detail: { taskId: t.id } }));
                        onClose?.(groupId || null);
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid #2a3346',
                        borderRadius: 8,
                        padding: '6px 8px',
                        color: '#8aa0ff',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                      title={t.text}
                    >
                      {t.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {relations.incoming.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, marginTop: 8, marginBottom: 6 }}>← Связаны с этой</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {relations.incoming.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('open-task', { detail: { taskId: t.id } }));
                        onClose?.(groupId || null);
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid #2a3346',
                        borderRadius: 8,
                        padding: '6px 8px',
                        color: '#8aa0ff',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                      title={t.text}
                    >
                      {t.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
