import { useEffect, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { Task } from './api';
import {
  getTask,
  updateTask,
  completeTask,
  getTaskWithGroup,
  createInvite,
  deleteTask,
  reopenTask,
} from './api';

export default function TaskView({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: string;
  onClose: (groupId?: string | null) => void;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<Task | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<string | undefined>(undefined);
  const isDone = phase === 'Done';

  // куда вернуться при закрытии
  const groupIdRef = useRef<string | null | undefined>(undefined);

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
      .then((tResp) => {
        if (ignore) return;
        setTask(tResp.task);
        setText(tResp.task.text);
        return getTaskWithGroup(taskId)
          .then((gResp: any) => {
            groupIdRef.current = gResp?.groupId ?? null;
            setPhase(gResp?.phase);
          })
          .catch(() => {
            const gid = new URLSearchParams(location.search).get('group');
            groupIdRef.current = gid || null;
            setPhase(undefined);
          });
      })
      .catch(() => {
        const gid = new URLSearchParams(location.search).get('group');
        groupIdRef.current = gid || null;
        setTask(null);
      })
      .finally(() => !ignore && setLoading(false));

    return () => { ignore = true; };
  }, [taskId]);

  /* --- действия --- */
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

  /* --- UI --- */
  if (loading) return <div style={{ padding: 16 }}>Загрузка…</div>;
  if (error)   return <div style={{ padding: 16, color: 'crimson' }}>{error}</div>;
  if (!task) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1216', color: '#e8eaed', padding: 16 }}>
        <button
          onClick={() => onClose(groupIdRef.current)}
          style={{ marginBottom: 12, background: 'transparent', color: '#8aa0ff', border: 'none', cursor: 'pointer' }}
        >
          ← Назад
        </button>

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
      <button
        onClick={() => onClose(groupIdRef.current)}
        style={{ marginBottom: 12, background: 'transparent', color: '#8aa0ff', border: 'none', cursor: 'pointer' }}
      >
        ← Назад
      </button>

      <div
        style={{
          background: isDone ? '#15251a' : '#1b2030',
          border: `1px solid ${isDone ? '#2c4a34' : '#2a3346'}`,
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>ID: {task.id}</div>
        <label style={{ display: 'block', fontSize: 14, opacity: 0.85, marginBottom: 8 }}>Текст задачи</label>
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

          {/* Одна кнопка-тоггл: Завершить / Возобновить */}
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
            onClick={async () => {
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
            }}
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

          {/* Ответственный */}
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
            <button
              onClick={async () => {
                try {
                  const me =
                    WebApp?.initDataUnsafe?.user?.id ||
                    new URLSearchParams(location.search).get('from');

                  const r = await createInvite({
                    chatId: String(me || ''),
                    type: 'task',
                    taskId,
                  });

                  if (!r?.ok || !r?.link) throw new Error('invite_error');

                  const text = r.shareText || 'Вас назначают ответственным за задачу';
                  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent(text)}`;

                  WebApp?.openTelegramLink?.(shareUrl);
                  WebApp?.HapticFeedback?.notificationOccurred?.('success');
                } catch (e) {
                  console.error('[INVITE] error', e);
                  alert('Не удалось создать приглашение');
                  WebApp?.HapticFeedback?.notificationOccurred?.('error');
                }
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid #2a3346',
                background: '#204028',
                color: '#d7ffd7',
                cursor: 'pointer',
              }}
            >
              Ответственный → пригласить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
