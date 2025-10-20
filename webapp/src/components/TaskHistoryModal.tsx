// src/components/TaskHistoryModal.tsx
import { useEffect, useState } from 'react';
import { getTaskHistory, type TaskHistoryItem } from '../api';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

type Props = {
  taskId: string;
  onClose: () => void;
};

const ACTION_LABELS: Record<string, string> = {
  task_created: '✨ Создал задачу',
  text_changed: '✏️ Изменил текст',
  status_changed: '🔄 Изменил статус',
  assignee_changed: '👤 Изменил ответственного',
  label_added: '🏷️ Добавил ярлык',
  label_removed: '🏷️ Удалил ярлык',
  watcher_added: '👁️ Добавил наблюдателя',
  watcher_removed: '👁️ Удалил наблюдателя',
  deadline_set: '🚩 Установил дедлайн',
  deadline_removed: '🚩 Удалил дедлайн',
  deadline_changed: '🚩 Изменил дедлайн',
  expenses_changed: '💰 Изменил затраты',
  accept_condition_changed: '☝️ Изменил условия приёма',
  comment_added: '💬 Добавил комментарий',
  comment_deleted: '💬 Удалил комментарий',
  reminder_added: '⏰ Создал напоминание',
  reminder_removed: '⏰ Удалил напоминание',
};

function formatHistoryItem(item: TaskHistoryItem): { label: string; detail: string } {
  const label = ACTION_LABELS[item.action] || `❓ ${item.action}`;

  let detail = '';
  if (item.action === 'task_created') {
    detail = item.newValue ? `"${item.newValue.slice(0, 50)}${item.newValue.length > 50 ? '...' : ''}"` : '';
  } else if (item.action === 'status_changed') {
    detail = `${item.oldValue || '—'} → ${item.newValue || '—'}`;
  } else if (item.action === 'assignee_changed') {
    const oldName = item.oldValue || 'Не назначен';
    const newName = item.newValue || 'Не назначен';
    detail = `${oldName} → ${newName}`;
  } else if (item.action === 'text_changed') {
    detail = item.newValue ? `"${item.newValue.slice(0, 50)}${item.newValue.length > 50 ? '...' : ''}"` : '';
  } else if (item.action === 'comment_added' && item.metadata?.text) {
    detail = `"${item.metadata.text.slice(0, 50)}${item.metadata.text.length > 50 ? '...' : ''}"`;
  } else if (item.action === 'expenses_changed') {
    detail = `${item.oldValue || '0'} ₽ → ${item.newValue || '0'} ₽`;
  } else if (item.action === 'deadline_set' && item.newValue) {
    detail = format(new Date(item.newValue), 'dd MMM yyyy HH:mm', { locale: ru });
  } else if (item.action === 'deadline_changed' && item.oldValue && item.newValue) {
    const oldDate = format(new Date(item.oldValue), 'dd MMM yyyy HH:mm', { locale: ru });
    const newDate = format(new Date(item.newValue), 'dd MMM yyyy HH:mm', { locale: ru });
    detail = `${oldDate} → ${newDate}`;
  } else if (item.action === 'reminder_added' && item.newValue) {
    detail = format(new Date(item.newValue), 'dd MMM yyyy HH:mm', { locale: ru });
  } else if (item.action === 'reminder_removed' && item.oldValue) {
    detail = format(new Date(item.oldValue), 'dd MMM yyyy HH:mm', { locale: ru });
  } else if (item.oldValue || item.newValue) {
    detail = `${item.oldValue || '—'} → ${item.newValue || '—'}`;
  }

  return { label, detail };
}

export default function TaskHistoryModal({ taskId, onClose }: Props) {
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await getTaskHistory(taskId);
        setHistory(res.history || []);
      } catch (e: any) {
        console.error('Failed to load task history:', e);
        setError(e.message || 'Не удалось загрузить историю');
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 999,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90%',
          maxWidth: 600,
          maxHeight: '80vh',
          background: '#0f1422',
          border: '1px solid #2a3346',
          borderRadius: 12,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #2a3346',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, color: '#e8eaed' }}>История задачи</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#e8eaed',
              fontSize: 24,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {loading && (
            <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>
              Загрузка...
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', padding: 20, color: '#ff6b6b' }}>
              {error}
            </div>
          )}

          {!loading && !error && history.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>
              История пуста
            </div>
          )}

          {!loading && !error && history.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {history.map((item) => {
                const { label, detail } = formatHistoryItem(item);
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 12,
                      background: '#131a2a',
                      borderRadius: 8,
                      border: '1px solid #2a3346',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#999' }}>
                        {format(new Date(item.createdAt), 'dd.MM.yyyy HH:mm', { locale: ru })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, color: '#4a9eff' }}>
                        {item.actorName}
                      </span>
                      <span style={{ fontSize: 14, color: '#e8eaed' }}>
                        {label}
                      </span>
                    </div>
                    {detail && (
                      <div style={{ marginTop: 6, fontSize: 13, color: '#aaa' }}>
                        {detail}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
