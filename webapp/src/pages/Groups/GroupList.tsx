import React from 'react';
import type { Group } from '../../api';
import { listPublicGroups, getWatchStatus, watchGroup, unwatchGroup } from '../../api';
import CreateGroupModal from '../../components/CreateGroupModal';

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
  const swipeRef = React.useRef<{ x: number; y: number } | null>(null);
  const draggingRef = React.useRef(false);
  const [dragDx, setDragDx] = React.useState(0); // текущий сдвиг при перетаскивании
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [vw, setVw] = React.useState(0); // измеренная ширина в px
  const TABS: Array<'public' | 'mine' | 'member'> = ['public', 'mine', 'member'];
  const tabIndex = TABS.indexOf(tab);
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

  const [createOpen, setCreateOpen] = React.useState(false);
  const onCreateGroup = () => setCreateOpen(true);

  const beginSwipe = (x: number, y: number) => { swipeRef.current = { x, y }; draggingRef.current = true; setDragDx(0); };
  const moveSwipe = (x: number, y: number) => {
    const st = swipeRef.current; if (!st || !draggingRef.current) return;
    const dx = x - st.x; const dy = Math.abs(y - st.y);
    // Если движение в основном горизонтальное — обновляем визуальный сдвиг
    if (Math.abs(dx) > dy) setDragDx(dx);
  };
  const endSwipe = (x: number, y: number) => {
    const st = swipeRef.current; if (!st) return; swipeRef.current = null;
    const dx = x - st.x; const dy = Math.abs(y - st.y);
    const TH = 32; // px threshold
    if (Math.abs(dx) > TH && Math.abs(dx) > dy) {
      const dir = dx < 0 ? 1 : -1; // left -> next, right -> prev
      const next = Math.max(0, Math.min(tabIndex + dir, TABS.length - 1));
      setTab(TABS[next]);
    }
    draggingRef.current = false; setDragDx(0);
  };

  // Измерить ширину вьюпорта (для корректной первой отрисовки)
  React.useEffect(() => {
    const measure = () => setVw(viewportRef.current?.clientWidth || 0);
    measure();
    window.addEventListener('resize', measure);
    // в случае поздней раскладки — повторим чуть позже
    const t = setTimeout(measure, 50);
    return () => { window.removeEventListener('resize', measure); clearTimeout(t); };
  }, []);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      onTouchStart={(e)=>{ const t=e.touches[0]; if (t) beginSwipe(t.clientX, t.clientY); }}
      onTouchMove={(e)=>{ const t=e.touches[0]; if (t) moveSwipe(t.clientX, t.clientY); }}
      onTouchEnd={(e)=>{ const t=e.changedTouches[0]; if (t) endSwipe(t.clientX, t.clientY); }}
      onMouseDown={(e)=>beginSwipe(e.clientX, e.clientY)}
      onMouseMove={(e)=>moveSwipe(e.clientX, e.clientY)}
      onMouseUp={(e)=>endSwipe(e.clientX, e.clientY)}
    >
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

      {/* Слайдер вкладок */}
      <div ref={viewportRef} style={{ overflow:'hidden' }}>
        {(() => {
          const w = vw;
          const translate = w > 0
            ? `translateX(${(-tabIndex * w) + (draggingRef.current ? dragDx : 0)}px)`
            : `translateX(${(-tabIndex * 100)}%)`;
          return (
            <div style={{ display:'flex', width: w>0 ? 'auto' : '300%', transform: translate, transition: draggingRef.current ? 'none' : 'transform 280ms ease' }}>
              {/* public */}
              <div style={w>0 ? { flex:'0 0 100%' } : { minWidth:'100%' }}>
                <Section title="Публичные группы">
                  {publicGroups.length === 0 ? (
                    <Empty>Пока нет публичных групп.</Empty>
                  ) : (
                    publicGroups.map((g) => (
                      <PublicGroupCard key={g.id} title={g.title} ownerName={g.ownerName || '—'} watching={!!watching[g.id]} onToggle={async ()=>{
                        try { const cur = !!watching[g.id]; if (cur) await unwatchGroup(g.id, chatId); else await watchGroup(g.id, chatId); setWatching(prev => ({ ...prev, [g.id]: !cur })); } catch {}
                      }} onOpen={()=>onOpen(g.id, false)} />
                    ))
                  )}
                </Section>
              </div>
              {/* mine */}
              <div style={w>0 ? { flex:'0 0 100%' } : { minWidth:'100%' }}>
                <Section title="Мои проекты">
                  {mine.length === 0 ? (
                    <Empty>Пока нет проектов. Создай первый ↑</Empty>
                  ) : (
                    mine.map((g) => (
                      <GroupCard key={g.id} title={g.title} ownerName={g.ownerName || '—'} kind="own" isPublic={(g as any).isPublic === true} isTelegramGroup={(g as any).isTelegramGroup === true} onClick={() => onOpen(g.id, false)} />
                    ))
                  )}
                </Section>
              </div>
              {/* member */}
              <div style={w>0 ? { flex:'0 0 100%' } : { minWidth:'100%' }}>
                <Section title="Проекты со мной">
                  {member.length === 0 ? (
                    <Empty>Пока нет проектов, где вы участник.</Empty>
                  ) : (
                    member.map((g) => {
                      const displayTitle = g.title === 'Моя группа' ? `Личная группа ${g.ownerName || ''}`.trim() : g.title;
                      return (
                        <GroupCard key={g.id} title={displayTitle} ownerName={g.ownerName || '—'} kind="member" isPublic={(g as any).isPublic === true} isTelegramGroup={(g as any).isTelegramGroup === true} onClick={() => onOpen(g.id, false)} />
                      );
                    })
                  )}
                </Section>
              </div>
            </div>
          );
        })()}
      </div>
      {/* Floating square create-project button above task FAB */}
      <button
        onClick={() => setCreateOpen(true)}
        title="Создать проект"
        style={{
          position:'fixed', right:16, bottom:160,
          width:56, height:56,
          borderRadius:12,
          background:'#facc15',
          color:'#111827',
          border:'1px solid #856a0e',
          fontWeight:900,
          fontSize:22,
          boxShadow:'0 6px 16px rgba(0,0,0,.35)',
          cursor:'pointer', zIndex:60,
        }}
      >+
      </button>

      <CreateGroupModal
        open={createOpen}
        chatId={chatId}
        onClose={()=>setCreateOpen(false)}
        onCreated={async ()=>{ await onReload(); }}
      />
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
    <div style={{ background: 'var(--app-bg, #0b1220)', border: '1px solid #2a3346', borderRadius: 16, padding: 12 }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.8, marginBottom: 8, color: (title === 'Мои проекты' || title === 'Публичные группы' || title === 'Проекты со мной') ? '#111827' : undefined }}>{title}</div>
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
  const bg = 'linear-gradient(180deg, #e5e7eb, #cbd5e1)';
  const icon = isPublic ? '🌍' : (isTelegramGroup ? '➡️📁' : (kind === 'own' ? '📁' : '🤝'));
  const titleColor = '#374151';
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '14px 16px',
        borderRadius: 14,
        background: bg,
        color: '#374151',
        border: '1px solid #D1D5DB',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span aria-hidden style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: titleColor }}>{title}</div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.8, color: '#4b5563' }}>Владелец: {ownerName}</div>
    </button>
  );
}

function PublicGroupCard({ title, ownerName, watching, onToggle, onOpen }: { title: string; ownerName: string; watching: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 14,
        background: 'linear-gradient(180deg, #e5e7eb, #cbd5e1)',
        color: '#374151',
        border: '1px solid #D1D5DB',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        justifyContent: 'space-between',
      }}
    >
      <div onClick={onOpen} style={{ cursor: 'pointer', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span aria-hidden style={{ fontSize: 18 }}>🌍</span>
          <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: '#374151' }}>{title}</div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.85, color: '#4b5563' }}>Владелец: {ownerName}</div>
      </div>
      <button onClick={onToggle} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #D1D5DB', background: '#f3f4f6', color: '#374151' }}>{watching ? '👁️ Отписаться' : '👁️ Подписаться'}</button>
    </div>
  );
}
