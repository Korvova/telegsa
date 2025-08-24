import React from 'react';
import type { Group } from '../../api';
import { createGroup } from '../../api';

export default function GroupList({
  chatId,
  groups,
  onReload,
  onOpen,
}: {
  chatId: string;
  groups: Group[];
  onReload: () => void;
  onOpen: (id: string) => void;
}) {
  const mine = groups.filter((g) => g.kind === 'own');
  const member = groups.filter((g) => g.kind === 'member');

  const onCreateGroup = async () => {
    const title = prompt('Название группы?')?.trim();
    if (!title) return;
    try {
      const r = await createGroup(chatId, title);
      if (!r.ok) throw new Error('create_failed');
      await onReload();
    } catch (e) {
      alert('Не удалось создать группу');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Кнопки действий */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onCreateGroup}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: '#202840',
            color: '#e8eaed',
            border: '1px solid #2a3346',
            cursor: 'pointer',
          }}
        >
          + Создать группу
        </button>

        <button
          onClick={onReload}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: '#121a32',
            color: '#e8eaed',
            border: '1px solid #2a3346',
            cursor: 'pointer',
          }}
        >
          Обновить список
        </button>
      </div>

      {/* Блок: Мои группы */}
      {mine.length > 0 && (
        <Section title="Мои группы">
          {mine.map((g) => (
            <GroupRow key={g.id} title={g.title} onClick={() => onOpen(g.id)} />
          ))}
        </Section>
      )}

      {/* Блок: Где участвую */}
      {member.length > 0 && (
        <Section title="Где участвую">
          {member.map((g) => (
            <GroupRow key={g.id} title={g.title} onClick={() => onOpen(g.id)} />
          ))}
        </Section>
      )}

      {/* Пустое состояние */}
      {mine.length === 0 && member.length === 0 && (
        <div
          style={{
            padding: 16,
            background: '#1b2030',
            border: '1px solid #2a3346',
            borderRadius: 16,
            textAlign: 'center',
            opacity: 0.8,
          }}
        >
          Пока нет групп. Создай первую через кнопку выше.
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: '#1b2030',
        border: '1px solid #2a3346',
        borderRadius: 16,
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 12,
          textTransform: 'uppercase',
          opacity: 0.8,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function GroupRow({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderRadius: 12,
        background: '#121722',
        color: '#e8eaed',
        border: '1px solid #2a3346',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 15 }}>{title}</span>
      <span aria-hidden>⟶</span>
    </button>
  );
}
