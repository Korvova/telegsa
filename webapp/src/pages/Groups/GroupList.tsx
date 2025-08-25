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
  onOpen: (id: string, mineOnly?: boolean) => void; // ⬅️ второй флаг
}) {
  const mineAll = groups.filter((g) => g.kind === 'own');
  const memberAll = groups.filter((g) => g.kind === 'member');

  // Моя группа — вверх
  const mine = [...mineAll].sort((a, b) => (a.title === 'Моя группа' ? -1 : b.title === 'Моя группа' ? 1 : a.title.localeCompare(b.title)));
  const member = [...memberAll].sort((a, b) => a.title.localeCompare(b.title));

  const onCreateGroup = async () => {
    const title = prompt('Название проекта?')?.trim();
    if (!title) return;
    try {
      const r = await createGroup(chatId, title);
      if (!r.ok) throw new Error('create_failed');
      await onReload();
    } catch {
      alert('Не удалось создать проект');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Действия */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCreateGroup} style={btn('#202840')}>+ Создать проект</button>
        <button onClick={onReload} style={btn('#121a32')}>Обновить список</button>
      </div>

      {/* Мои проекты */}
      <Section title="Мои проекты">
        {mine.length === 0 ? (
          <Empty>Пока нет проектов. Создай первый ↑</Empty>
        ) : (
          mine.map((g) => (
            <GroupCard
              key={g.id}
              title={g.title}
              ownerName={g.ownerName || '—'}
              kind="own"
              onClick={() => onOpen(g.id, false)} // показываем ВСЕ задачи
            />
          ))
        )}
      </Section>

      {/* Проекты со мной */}
      <Section title="Проекты со мной">
        {member.length === 0 ? (
          <Empty>Пока нет проектов, где вы участник.</Empty>
        ) : (
          member.map((g) => {
            const displayTitle = g.title === 'Моя группа'
              ? `Личная группа ${g.ownerName || ''}`.trim()
              : g.title;
            return (
              <GroupCard
                key={g.id}
                title={displayTitle}
                ownerName={g.ownerName || '—'}
                kind="member"
                onClick={() => onOpen(g.id, false)} // ⬅️ ВАЖНО: по умолчанию показываем ВСЕ задачи проекта
              />
            );
          })
        )}
      </Section>
    </div>
  );
}

/* --- маленькие атомы для стилей --- */
function btn(bg: string) {
  return {
    padding: '10px 14px',
    borderRadius: 12,
    background: bg,
    color: '#e8eaed',
    border: '1px solid #2a3346',
    cursor: 'pointer',
  } as React.CSSProperties;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#121722', border: '1px solid #2a3346', borderRadius: 16, padding: 12 }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.8, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 12, opacity: 0.7, border: '1px dashed #2a3346', borderRadius: 12, textAlign: 'center' }}>
      {children}
    </div>
  );
}

function GroupCard({
  title,
  ownerName,
  kind,
  onClick,
}: {
  title: string;
  ownerName: string;
  kind: 'own' | 'member';
  onClick: () => void;
}) {
  const bg = kind === 'own' ? 'linear-gradient(180deg,#1b2030,#121722)' : 'linear-gradient(180deg,#182227,#10151d)';
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '14px 16px',
        borderRadius: 14,
        background: bg,
        color: '#e8eaed',
        border: '1px solid #2a3346',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span aria-hidden style={{ fontSize: 18 }}>{kind === 'own' ? '📁' : '🤝'}</span>
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{title}</div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>Владелец: {ownerName}</div>
    </button>
  );
}
