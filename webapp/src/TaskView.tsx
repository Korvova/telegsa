import { useEffect, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { Task } from './api';
import { getTask, updateTask, completeTask, getTaskWithGroup, createInvite, deleteTask } from './api';

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

  // запоминаем группу задачи, чтобы вернуться в ту же доску
  const groupIdRef = useRef<string | null | undefined>(undefined);

  // Telegram back button → onClose c groupId
// Telegram back button → onClose c groupId (работает и в старых, и в новых клиентах)
useEffect(() => {
  const onceRef = { done: false, t: 0 as any };

const handle = () => {
  console.log('[BACK] clicked'); // ← добавь
  if (onceRef.done) return;
  onceRef.done = true;
  clearTimeout(onceRef.t);
  onceRef.t = setTimeout(() => (onceRef.done = false), 300);
  onClose(groupIdRef.current);
};


  try { WebApp?.BackButton?.show?.(); } catch {}

  // старый способ
  WebApp?.onEvent?.('backButtonClicked', handle);
  // новый способ SDK
  WebApp?.BackButton?.onClick?.(handle);

  return () => {
    WebApp?.offEvent?.('backButtonClicked', handle);
    WebApp?.BackButton?.offClick?.(handle);
    try { WebApp?.BackButton?.hide?.(); } catch {}
  };
}, [onClose]);







  // загрузка задачи и её группы
useEffect(() => {
  let ignore = false;
  setLoading(true);

  // пробуем получить задачу
  getTask(taskId)
    .then((tResp) => {
      if (ignore) return;
      setTask(tResp.task);
      setText(tResp.task.text);
      // параллельно узнаем groupId (тот же эндпоинт уже отдаёт groupId)
      return getTaskWithGroup(taskId)
        .then((gResp: any) => {
          groupIdRef.current = gResp?.groupId ?? null;
        })
        .catch(() => {
          // если не вышло — возьмём из URL (&group=...)
          const gid = new URLSearchParams(location.search).get('group');
          groupIdRef.current = gid || null;
        });
    })
    .catch(() => {
      // задача не найдена/удалена → покажем «уже удалена»
      const gid = new URLSearchParams(location.search).get('group');
      groupIdRef.current = gid || null;
      setTask(null);
    })
    .finally(() => !ignore && setLoading(false));

  return () => { ignore = true; };
}, [taskId]);










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

  const complete = async () => {
    setSaving(true);
    try {
      await completeTask(taskId);
      onChanged?.();
      WebApp?.HapticFeedback?.impactOccurred?.('medium');
      onClose(groupIdRef.current); // вернёмся в нужную доску
    } catch (e: any) {
      setError(e?.message || 'Ошибка завершения');
      setSaving(false);
    }
  };

if (loading) return <div style={{ padding: 16 }}>Загрузка…</div>;
if (error)   return <div style={{ padding: 16, color: 'crimson' }}>{error}</div>;
if (!task) {
  // мягко объясняем: задача уже удалена
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

      <div style={{ background: '#1b2030', border: '1px solid #2a3346', borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>ID: {task.id}</div>
        <label style={{ display: 'block', fontSize: 14, opacity: 0.85, marginBottom: 8 }}>Текст задачи</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          style={{
            width: '100%',
            background: '#121722',
            color: '#e8eaed',
            border: '1px solid #2a3346',
            borderRadius: 12,
            padding: 12,
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
            onClick={complete}
            disabled={saving}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #2a3346',
              background: '#234324',
              color: '#d7ffd7',
              cursor: 'pointer',
            }}
          >
            Завершить → Done
          </button>






<button
  onClick={async () => {
    if (!confirm('Удалить задачу? Действие необратимо.')) return;
    try {
      const resp = await deleteTask(taskId);
      // идём на нужную доску: используем точный groupId от бэка, иначе — то, что знаем
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












          {/* ▶️ Кнопка: пригласить ответственного (через централизованный api.ts) */}
{task.assigneeChatId ? (
  // Плашка с ответственным
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
        const me = WebApp?.initDataUnsafe?.user?.id
          || new URLSearchParams(location.search).get('from');

        const r = await createInvite({
          chatId: String(me || ''),
          type: 'task',
          taskId, // текущая задача
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
