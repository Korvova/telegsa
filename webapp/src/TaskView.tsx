// src/TaskView.tsx
import { useEffect, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { Task } from './api';
import { listGroups } from './api';
import ResponsibleActions from './components/ResponsibleActions';

import {
  getTask,
  getTaskWithGroup,
  updateTask,
  completeTask,
  reopenTask,
  deleteTask,
  // участники группы
  type GroupMember,
  getGroupMembers,
} from './api';

type Props = {
  taskId: string;
  onClose: (groupId?: string | null) => void;
  onChanged: () => void;
};

export default function TaskView({ taskId, onClose, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<Task | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<string | undefined>(undefined);
  const isDone = phase === 'Done';

  // заголовок группы
  const [groupTitle, setGroupTitle] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  // куда возвращаться при закрытии
  const groupIdRef = useRef<string | null | undefined>(undefined);

  // мягкий «тик» для обновления карточки после назначений
  const [refreshTick, setRefreshTick] = useState(0);

  // кто я (для «Сделать ответственным себя»)
  const meChatId = String(
    WebApp?.initDataUnsafe?.user?.id ||
      new URLSearchParams(window.location.search).get('from') ||
      ''
  );

  // участники текущей группы (для «Выбрать из группы»)
  const [members, setMembers] = useState<GroupMember[]>([]);

  // когда узнали groupId — подтягиваем участников
  useEffect(() => {
    if (!groupId) return;
    getGroupMembers(groupId)
      .then((r) => {
        if (r.ok) setMembers(r.members || []);
      })
      .catch(() => {});
  }, [groupId]);

  /* --- системная кнопка "Назад" --- */
  useEffect(() => {
    const onceRef = { done: false, t: 0 as any };

    const handle = () => {
      if (onceRef.done) return;
      onceRef.done = true;
      clearTimeout(onceRef.t);
      onceRef.t = setTimeout(() => (onceRef.done = false), 300);
      onClose(groupIdRef.current);
    };

    try { WebApp?.BackButton?.show?.(); } catch {}
    WebApp?.onEvent?.('backButtonClicked', handle);
    WebApp?.BackButton?.onClick?.(handle);

    return () => {
      WebApp?.offEvent?.('backButtonClicked', handle);
      WebApp?.BackButton?.offClick?.(handle);
      try { WebApp?.BackButton?.hide?.(); } catch {}
    };
  }, [onClose]);

  /* --- загрузка задачи + группы/фазы --- */
  useEffect(() => {
    let ignore = false;
    setLoading(true);

    getTask(taskId)
      .then(async (tResp) => {
        if (ignore) return;
        setTask(tResp.task);
        setText(tResp.task.text);
        try {
          const gResp = await getTaskWithGroup(taskId);
          groupIdRef.current = gResp?.groupId ?? null;
          setGroupId(groupIdRef.current);
          setPhase(gResp?.phase);
        } catch {
          const gid = new URLSearchParams(location.search).get('group');
          groupIdRef.current = gid || null;
          setGroupId(groupIdRef.current);
          setPhase(undefined);
        }
      })
      .catch(() => {
        const gid = new URLSearchParams(location.search).get('group');
        groupIdRef.current = gid || null;
        setGroupId(groupIdRef.current);
        setTask(null);
      })
      .finally(() => !ignore && setLoading(false));

    return () => { ignore = true; };
  }, [taskId]);

  /* --- подтянуть название группы по groupId --- */
  useEffect(() => {
    if (!groupId) {
      setGroupTitle(null);
      return;
    }
    const me =
      WebApp?.initDataUnsafe?.user?.id ||
      new URLSearchParams(location.search).get('from');
    if (!me) return;

    listGroups(String(me))
      .then((r) => {
        if (r.ok) {
          const g = r.groups.find((x: any) => x.id === groupId);
          setGroupTitle(g ? g.title : null);
        }
      })
      .catch(() => {});
  }, [groupId]);

  /* --- мягкий поллинг (обновляем ответственного/фазу) --- */
  useEffect(() => {
    let t: any = null;
    let alive = true;

    const tick = async () => {
      try {
        const r = await getTask(taskId);
        if (!alive) return;
        setTask(r.task);
        if (typeof (r as any)?.phase === 'string') setPhase((r as any).phase);
      } catch {}
      t = setTimeout(tick, 4000);
    };

    t = setTimeout(tick, 4000);
    return () => { alive = false; clearTimeout(t); };
  }, [taskId, refreshTick]);

  /* --- действия с задачей --- */
  const save = async () => {
    const val = text.trim();
    if (!val) return;
    setSaving(true);
    try {
      await updateTask(taskId, val);
      onChanged?.();
      WebApp?.HapticFeedback?.impactOccurred?.('light');
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async () => {
    setSaving(true);
    try {
      if (isDone) {
        await reopenTask(taskId);
        setPhase('Doing');
      } else {
        await completeTask(taskId);
        setPhase('Done');
      }
      onChanged?.();
      WebApp?.HapticFeedback?.impactOccurred?.('medium');
    } catch (e: any) {
      setError(e?.message || 'Ошибка операции');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить задачу? Действие необратимо.')) return;
    try {
      const resp = await deleteTask(taskId);
      const gid = (resp && 'groupId' in resp) ? (resp as any).groupId : groupIdRef.current;
      onChanged?.();
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onClose(gid ?? undefined);
    } catch (e) {
      console.error('[DELETE] error', e);
      alert('Не удалось удалить задачу');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    }
  };

  // === Поделиться → открываем системный шэр с prepared message ===


  /* --- UI --- */
  if (loading) return <div style={{ padding: 16 }}>Загрузка…</div>;
  if (error) return <div style={{ padding: 16, color: 'crimson' }}>{error}</div>;

  // заголовок с «назад» и именем группы
  const Header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <button
        onClick={() => onClose(groupIdRef.current)}
        style={{ background: 'transparent', color: '#8aa0ff', border: 'none', cursor: 'pointer', fontSize: 13 }}
      >
        ← Назад
      </button>
      {groupTitle && <span style={{ fontSize: 13, opacity: 0.8 }}>{groupTitle}</span>}
    </div>
  );

  if (!task) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1216', color: '#e8eaed', padding: 16 }}>
        {Header}

        <div style={{ background: '#1b2030', border: '1px solid #2a3346', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Задача уже удалена</div>
          <div style={{ opacity: 0.8, marginBottom: 16 }}>
            Этой задачи больше нет. Можешь вернуться в доску.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => onClose(null)}
              style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
            >
              Моя доска
            </button>
            {groupIdRef.current ? (
              <button
                onClick={() => onClose(groupIdRef.current)}
                style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #2a3346', background: '#1f2e4a', color: '#e8eaed' }}
              >
                Открыть группу
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1216', color: '#e8eaed', padding: 16 }}>
      {Header}

      <div
        style={{
          background: isDone ? '#15251a' : '#1b2030',
          border: `1px solid ${isDone ? '#2c4a34' : '#2a3346'}`,
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>ID: {task.id}</div>

        <label style={{ display: 'block', fontSize: 14, opacity: 0.85, marginBottom: 8 }}>
          Текст задачи
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          style={{
            width: '95%',
            background: '#121722',
            color: '#e8eaed',
            border: '1px solid #2a3346',
            borderRadius: 12,
            padding: 10,
            resize: 'vertical',
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            onClick={save}
            disabled={saving || !text.trim()}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #2a3346',
              background: '#202840',
              color: '#e8eaed',
              cursor: 'pointer',
            }}
          >
            Сохранить
          </button>

          <button
            onClick={toggleDone}
            disabled={saving}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #2a3346',
              background: isDone ? '#3a2b1f' : '#234324',
              color: isDone ? '#ffe7c7' : '#d7ffd7',
              cursor: 'pointer',
            }}
          >
            {isDone ? 'Возобновить → Doing' : 'Завершить → Done'}
          </button>

          <button
            onClick={handleDelete}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #472a2a',
              background: '#3a1f1f',
              color: '#ffd7d7',
              cursor: 'pointer',
            }}
          >
            Удалить задачу
          </button>

          {/* Постановщик */}
          {(task as any).creatorName ? (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid #2a3346',
                background: '#1a2030',
                color: '#e8eaed',
                display: 'inline-flex',
                gap: 8,
                alignItems: 'center',
              }}
              title="Постановщик задачи"
            >
              <span style={{ opacity: 0.8 }}>Постановщик:</span>
              <strong>{(task as any).creatorName}</strong>
            </div>
          ) : null}

          {/* Ответственный / действия назначения */}
          {task.assigneeChatId ? (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid #2a3346',
                background: '#15251a',
                color: '#d7ffd7',
                display: 'inline-flex',
                gap: 8,
                alignItems: 'center',
              }}
              title="Ответственный по задаче"
            >
              <span style={{ opacity: 0.8 }}>Ответственный:</span>
              <strong>{task.assigneeName || task.assigneeChatId}</strong>
            </div>
          ) : (
            <ResponsibleActions
              taskId={taskId}
              taskTitle={text}
              groupId={groupId || undefined}
              meChatId={meChatId}
              currentAssigneeChatId={task?.assigneeChatId ?? null}
              // передаём имя как firstName — компонент сам сформирует подпись
              members={members.map((m) => ({
                chatId: String(m.chatId),
                firstName: m.name || undefined,
              }))}
              canAssign={true}
              onAssigned={() => setRefreshTick((t) => t + 1)}
            />
          )}

    
        </div>
      </div>
    </div>
  );
}
