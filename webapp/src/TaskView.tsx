import { useEffect, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { Task } from './api';
import { getTask, updateTask, completeTask, getTaskWithGroup } from './api';

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
  useEffect(() => {
    WebApp?.BackButton?.show?.();
    const handler = () => onClose(groupIdRef.current);
    WebApp?.onEvent?.('backButtonClicked', handler);
    return () => {
      WebApp?.BackButton?.hide?.();
      WebApp?.offEvent?.('backButtonClicked', handler);
    };
  }, [onClose]);

  // загрузка задачи и её группы
  useEffect(() => {
    let ignore = false;
    setLoading(true);

    Promise.all([
      getTask(taskId),
      getTaskWithGroup(taskId).catch(() => ({ groupId: undefined as string | null | undefined })),
    ])
      .then(([tResp, gResp]) => {
        if (ignore) return;
        setTask(tResp.task);
        setText(tResp.task.text);
        groupIdRef.current = (gResp as any).groupId ?? null; // null = "Моя группа", undefined = не знаем
      })
      .catch((e) => !ignore && setError(e?.message || 'Ошибка загрузки'))
      .finally(() => !ignore && setLoading(false));

    return () => {
      ignore = true;
    };
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
  if (!task)   return <div style={{ padding: 16 }}>Задача не найдена</div>;

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
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
        </div>
      </div>
    </div>
  );
}
