import { useEffect, useState } from 'react';
import type { NodeStatus } from './NodeTopToolbar';

const OPTIONS: { value: NodeStatus; label: string; color: string }[] = [
  { value: 'NEW',         label: 'Новое',        color: '#9ca3af' },
  { value: 'IN_PROGRESS', label: 'В работе',     color: '#3b82f6' },
  { value: 'DONE',        label: 'Готово',       color: '#22c55e' },
  { value: 'CANCELLED',   label: 'Отмена',       color: '#ef4444' },
  { value: 'APPROVAL',    label: 'Согласование', color: '#f59e0b' },
  { value: 'WAITING',     label: 'Ждёт',         color: '#06b6d4' },
];

export default function StatusPickerModal({
  open,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  current: NodeStatus;
  onClose: () => void;
  onPick: (s: NodeStatus) => void;
}) {
  const [value, setValue] = useState<NodeStatus>(current);

  useEffect(() => setValue(current), [current]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.25)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, padding: 16, minWidth: 300, maxWidth: '92vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Статус узла</div>

        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {OPTIONS.map((o) => (
            <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="radio"
                name="node-status"
                value={o.value}
                checked={value === o.value}
                onChange={() => setValue(o.value)}
              />
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: o.color,
                  display: 'inline-block',
                }}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Отмена</button>
          <button
            onClick={() => {
              onPick(value);
              onClose();
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
