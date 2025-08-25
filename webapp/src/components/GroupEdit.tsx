// src/components/GroupEdit.tsx
import { useState } from 'react';
import WebApp from '@twa-dev/sdk';

type Group = {
  id: string;
  title: string;
  ownerChatId: string;
  kind?: 'own' | 'member';
};

type Props = {
  group: Group;
  chatId: string; // текущий пользователь
  onClose: () => void;
  onRenamed: (newTitle: string) => void;
  onDeleted: () => void;
};

export default function GroupEdit({ group, chatId, onClose, onRenamed, onDeleted }: Props) {
  const isOwner = String(group.ownerChatId) === String(chatId) || group.kind === 'own';
  const [title, setTitle] = useState(group.title);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!isOwner) return;
    const val = title.trim();
    if (!val) return;
    setBusy(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, title: val }),
      }).then((r) => r.json());
      if (!r?.ok) throw new Error(r?.error || 'save_failed');
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onRenamed(val);
      onClose();
    } catch (e) {
      console.error('[GroupEdit] save error', e);
      alert('Не удалось сохранить новое имя группы');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!isOwner) return;
    const sure1 = confirm('Удалить группу? ВНИМАНИЕ: будут удалены ВСЕ задачи этой группы.');
    if (!sure1) return;
    const sure2 = confirm('Точно удалить? Действие необратимо.');
    if (!sure2) return;

    setBusy(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/groups/${group.id}?chatId=${encodeURIComponent(chatId)}`, {
        method: 'DELETE',
      }).then((r) => r.json());
      if (!r?.ok) throw new Error(r?.error || 'delete_failed');
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onDeleted();
      onClose();
    } catch (e) {
      console.error('[GroupEdit] delete error', e);
      alert('Не удалось удалить группу');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 92vw)',
          background: '#1b2030',
          border: '1px solid #2a3346',
          borderRadius: 16,
          padding: 16,
          color: '#e8eaed',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 16 }}>Редактирование группы</div>

        <label style={{ display: 'block', fontSize: 13, opacity: 0.85, marginBottom: 6 }}>Название группы</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!isOwner || busy}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 12,
            background: '#121722',
            color: '#e8eaed',
            border: '1px solid #2a3346',
            marginBottom: 12,
          }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={save}
            disabled={!isOwner || busy || !title.trim()}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: '#202840',
              color: '#e8eaed',
              border: '1px solid #2a3346',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Сохранить
          </button>

          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: '#1a2030',
              color: '#e8eaed',
              border: '1px solid #2a3346',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Отмена
          </button>

          <div style={{ flex: 1 }} />

          <button
            onClick={remove}
            disabled={!isOwner || busy}
            title={isOwner ? 'Удалить группу (без возврата)' : 'Удалять может только владелец'}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: isOwner ? '#3a1f1f' : '#2a2a2a',
              color: '#ffd7d7',
              border: '1px solid #472a2a',
              cursor: isOwner && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            Удалить группу
          </button>
        </div>

        {!isOwner && (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            Редактировать и удалять группу может только её владелец.
          </div>
        )}
      </div>
    </div>
  );
}
