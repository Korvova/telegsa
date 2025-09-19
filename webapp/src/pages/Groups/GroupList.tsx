import React from 'react';
import type { Group } from '../../api';
import { createGroup, listPublicGroups, getWatchStatus, watchGroup, unwatchGroup } from '../../api';

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
  // По умолчанию показываем «Мои проекты»
  const [tab, setTab] = React.useState<'public' | 'mine' | 'member'>('mine');
  const [publicGroups, setPublicGroups] = React.useState<Array<{ id: string; title: string; ownerName?: string | null }>>([]);
  const [watching, setWatching] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (tab !== 'public') return;
    (async () => {
      try {
        const r = await listPublicGroups({ limit: 100 });
        if (r?.ok) {
          setPublicGroups((r.groups || []).map(g => ({ id: g.id, title: g.title, ownerName: g.ownerName || null })));
          const statuses: Record<string, boolean> = {};
          await Promise.all((r.groups || []).map(async (g) => {
            const st = await getWatchStatus(g.id, chatId).catch(() => ({ ok: false, watching: false }));
            statuses[g.id] = !!st?.watching;
          }));
          setWatching(statuses);
        }
      } catch {}
    })();
  }, [tab, chatId]);
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
      {/* Табы */}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={()=>setTab('public')} style={tabBtn(tab==='public')}>🌍 Публичные</button>
        <button onClick={()=>setTab('mine')} style={tabBtn(tab==='mine')}>Мои проекты</button>
        <button onClick={()=>setTab('member')} style={tabBtn(tab==='member')}>Проекты со мной</button>
      </div>
      {/* Действия */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCreateGroup} style={btn('#202840')}>+ Создать проект</button>
        <button onClick={onReload} style={btn('#121a32')}>Обновить список</button>
      </div>

      {tab === 'public' ? (
        <Section title="Публичные группы">
          {publicGroups.length === 0 ? (
            <Empty>Пока нет публичных групп.</Empty>
          ) : (
            publicGroups.map((g) => (
              <PublicGroupCard key={g.id} title={g.title} ownerName={g.ownerName || '—'} watching={!!watching[g.id]} onToggle={async ()=>{
                try {
                  const cur = !!watching[g.id];
                  if (cur) await unwatchGroup(g.id, chatId); else await watchGroup(g.id, chatId);
                  setWatching(prev => ({ ...prev, [g.id]: !cur }));
                } catch {}
              }} onOpen={()=>onOpen(g.id, false)} />
            ))
          )}
        </Section>
      ) : tab === 'mine' ? (
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
                isPublic={(g as any).isPublic === true}
                isTelegramGroup={(g as any).isTelegramGroup === true}
                onClick={() => onOpen(g.id, false)}
              />
            ))
          )}
        </Section>
      ) : (
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
                isPublic={(g as any).isPublic === true}
                isTelegramGroup={(g as any).isTelegramGroup === true}
                onClick={() => onOpen(g.id, false)}
              />
              );
            })
          )}
        </Section>
      )}
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

function tabBtn(active: boolean) {
  return {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid #2a3346',
    background: active ? '#202840' : '#121722',
    color: active ? '#8aa0ff' : '#e8eaed',
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
  isPublic = false,
  isTelegramGroup = false,
  onClick,
}: {
  title: string;
  ownerName: string;
  kind: 'own' | 'member';
  isPublic?: boolean;
  isTelegramGroup?: boolean;
  onClick: () => void;
}) {
  const bg = kind === 'own' ? 'linear-gradient(180deg,#1b2030,#121722)' : 'linear-gradient(180deg,#182227,#10151d)';
  const icon = isPublic ? '🌍' : (isTelegramGroup ? '➡️📁' : (kind === 'own' ? '📁' : '🤝'));
  const titleColor = isPublic ? '#86efac' : (isTelegramGroup ? '#42aaff' : '#e8eaed');
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
        <span aria-hidden style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: titleColor }}>{title}</div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>Владелец: {ownerName}</div>
    </button>
  );
}

function PublicGroupCard({ title, ownerName, watching, onToggle, onOpen }: { title: string; ownerName: string; watching: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 14,
        background: 'linear-gradient(180deg,#10221a,#0f1712)',
        color: '#e8eaed',
        border: '1px solid #2a3346',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        justifyContent: 'space-between',
      }}
    >
      <div onClick={onOpen} style={{ cursor: 'pointer', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span aria-hidden style={{ fontSize: 18 }}>🌍</span>
          <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: '#86efac' }}>{title}</div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>Владелец: {ownerName}</div>
      </div>
      <button onClick={onToggle} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>{watching ? '👁️ Отписаться' : '👁️ Подписаться'}</button>
    </div>
  );
}
