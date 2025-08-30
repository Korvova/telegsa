// src/components/AssigneePickerModal.tsx
import { useMemo, useState } from 'react';
import type { GroupMember } from '../api';

export default function AssigneePickerModal({
  open,
  owner,
  members,
  currentName,
  onClose,
  onPick,
}: {
  open: boolean;
  owner: GroupMember | null;
  members: GroupMember[];
  currentName?: string | null;
  onClose: () => void;
  onPick: (member: GroupMember) => void;
}) {
  const sorted = useMemo(() => {
    const arr = [...members];
    // владельца наверх и без дубля
    const withoutOwner = arr.filter((m) => String(m.chatId) !== String(owner?.chatId));
    return owner ? [owner, ...withoutOwner] : arr;
  }, [owner, members]);

  const [selected, setSelected] = useState<string | null>(null);

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
        style={{ background: '#fff', borderRadius: 12, padding: 16, minWidth: 320, maxWidth: '92vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Выбрать ответственного</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '50vh', overflow: 'auto' }}>
          {sorted.map((m) => {
            const display = m.name || m.chatId;
            const id = String(m.chatId);
            const checked = selected ? selected === id : (currentName || '') === display;
            return (
              <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="assignee"
                  checked={checked}
                  onChange={() => setSelected(id)}
                />
                <span style={{ fontWeight: 600 }}>{display}</span>
                {String(owner?.chatId) === id ? <span style={{ opacity: 0.6 }}>(владелец)</span> : null}
              </label>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose}>Отмена</button>
          <button
            onClick={() => {
              const chosen = sorted.find((m) => String(m.chatId) === selected) || sorted[0];
              if (chosen) onPick(chosen);
            }}
            disabled={sorted.length === 0}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
