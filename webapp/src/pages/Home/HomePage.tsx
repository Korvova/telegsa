// webapp/src/pages/Home/HomePage.tsx
import { useEffect, useMemo, useState, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import { listMyFeed, type TaskFeedItem } from '../../api';

import StoriesBar from '../../components/stories/StoriesBar';
import StoriesViewer from '../../components/stories/StoriesViewer';
import { useStoriesData } from '../../components/stories/useStoriesData';
import type { StoriesBarItem } from '../../components/stories/StoriesTypes';
import StageQuickBar from '../../components/StageQuickBar';
import type { StageKey } from '../../components/StageScroller';

type Role = 'all' | 'creator' | 'assignee' | 'watcher';
const STATUS_LABELS = ['Новые','В работе','Готово','Согласование','Ждёт'];

const LONG_PRESS_MS = 500;
const BAR_SPACE = 60;

/** Короткий формат даты для событий */
function fmtShort(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// эвристика: текущая фаза из item
function phaseOf(t: any): StageKey | string | undefined {
  const ph = String(t?.phase ?? t?.status ?? '').trim();
  const low = ph.toLowerCase();
  if (['inbox','новые','новое'].includes(low)) return 'Inbox';
  if (['doing','в работе'].includes(low)) return 'Doing';
  if (['done','готово','готов'].includes(low)) return 'Done';
  if (['cancel','отмена','отменено','отменена'].includes(low)) return 'Cancel';
  if (['approval','согласование','на согласовании'].includes(low)) return 'Approval';
  if (['wait','ждет','ждёт','ожидание'].includes(low)) return 'Wait';
  return ph || undefined;
}

function statusTextFromStage(s: StageKey): string {
  return s === 'Inbox' ? 'Новые'
    : s === 'Doing' ? 'В работе'
    : s === 'Done' ? 'Готово'
    : s === 'Cancel' ? 'Отмена'
    : s === 'Approval' ? 'Согласование'
    : s === 'Wait' ? 'Ждёт'
    : String(s);
}

function colorsForPhase(p?: StageKey | string) {
  switch (p) {
    case 'Done':     return { bg: '#E8F5E9', brd: '#C8E6C9', chip: '#2e7d32' };
    case 'Cancel':   return { bg: '#FDECEC', brd: '#F5C2C2', chip: '#8a2b2b' };
    case 'Doing':    return { bg: '#E3F2FD', brd: '#BBDEFB', chip: '#1e3a8a' };
    case 'Wait':     return { bg: '#E7F5FF', brd: '#B8E1FF', chip: '#1f4d6b' };
    case 'Approval': return { bg: '#FFF3E0', brd: '#FFE0B2', chip: '#7a4a12' };
    default:         return { bg: '#FFFFFF', brd: '#e5e7eb', chip: '#3b4b7a' };
  }
}






type Badge = { text: string; bg: string; fg: string; brd: string };
function badgeForPhase(p?: StageKey | string): Badge | null {
  switch (p) {
   case 'Done':     return { text: '✓ Готово',        bg: '#D1F2DC', fg: '#0f5132', brd: '#A3DFB9' };
    case 'Cancel':   return { text: '❌ Отмена',        bg: '#FDDCDC', fg: '#7a1f1f', brd: '#F3B3B3' };
    case 'Doing':    return { text: '🔨 В работе',      bg: '#D7E6FF', fg: '#123a7a', brd: '#BBD6FF' };
    case 'Approval': return { text: '👉👈 Согласов',    bg: '#FFE9CC', fg: '#6b3d06', brd: '#FFD59A' };
    case 'Wait':     return { text: '🥶 Ждёт',         bg: '#E0F2FF', fg: '#063f5c', brd: '#B9E4FF' };
    case 'Inbox':    return { text: '🆕 В новое',      bg: '#ECEAFE', fg: '#2e1065', brd: '#DBD7FF' };
    default:         return null;
  }
}







export default function HomePage({
  chatId,
  onOpenTask,
}: { chatId: string; onOpenTask: (id: string) => void }) {
  const [role, setRole] = useState<Role>('all');
  const [statuses, setStatuses] = useState<Record<string, boolean>>(
    Object.fromEntries(STATUS_LABELS.map(s => [s, true]))
  );
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'updated_desc' | 'updated_asc'>('updated_desc');

  const [items, setItems] = useState<TaskFeedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const meChatId = String(WebApp?.initDataUnsafe?.user?.id || new URLSearchParams(location.search).get('from') || '');

  const [currentProject, setCurrentProject] = useState<StoriesBarItem | null>(null);
  const onOpenProjectStories = (item: StoriesBarItem) => {
    setCurrentProject(item);
    setViewerOpen(true);
  };

  const [viewerOpen, setViewerOpen] = useState(false);
  const { items: storyItems, markSeen } = useStoriesData(meChatId);

  const selectedStatuses = useMemo(
    () => Object.entries(statuses).filter(([,v]) => v).map(([k]) => k),
    [statuses]
  );

  // загрузка фида
  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const r = await listMyFeed({
          chatId,
          role,
          statuses: selectedStatuses,
          q,
          sort,
          offset: 0,
          limit: 30,
        });
        if (!alive) return;
        if (r.ok) {
          setItems(r.items);
          setOffset(r.nextOffset);
          setHasMore(r.hasMore);
        }
      } finally { setLoading(false); }
    };
    load();
    return () => { alive = false; };
  }, [chatId, role, selectedStatuses.join('|'), q, sort]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const r = await listMyFeed({
        chatId, role, statuses: selectedStatuses, q, sort, offset, limit: 30,
      });
      if (r.ok) {
        setItems(prev => [...prev, ...r.items]);
        setOffset(r.nextOffset);
        setHasMore(r.hasMore);
      }
    } finally { setLoading(false); }
  };

  // QUICK BAR (долгий тап)
  const [openQBarId, setOpenQBarId] = useState<string | null>(null);
  const lpTimer = useRef<any>(null);

  const startLongPress = (taskId: string) => {
    clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      setOpenQBarId(taskId);
      try { WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch {}
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => { clearTimeout(lpTimer.current); };
  const closeQBar = () => setOpenQBarId(null);

  // локальный патч только выбранного айтема
  const patchItem = (id: string, patch: Partial<TaskFeedItem> & Record<string, any>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } as any : it));
  };

  return (
    <div style={{ padding: 12, paddingBottom: 96 }}>
      <StoriesBar items={storyItems} onOpen={onOpenProjectStories} />

      {viewerOpen && currentProject && (
        <StoriesViewer
          project={currentProject}
          onClose={() => setViewerOpen(false)}
          onSeen={(slideIndex) => {
            markSeen(currentProject.projectId, slideIndex);
          }}
        />
      )}

      {/* Шапка */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: '#0f1216',
          paddingBottom: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setFiltersOpen(v => !v)}
            title="Фильтры"
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: '1px solid #2a3346',
              background: filtersOpen ? '#30416d' : '#1b2030',
              color: '#e5e7eb',
              cursor: 'pointer',
              minWidth: 40,
            }}
          >
            ☰
          </button>

          <input
            placeholder="Поиск по задачам и комментариям…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              flex: 1,
              background:'#0b1220',
              color:'#e5e7eb',
              border:'1px solid #2a3346',
              borderRadius: 10,
              padding:'8px 10px'
            }}
          />
        </div>

        {filtersOpen && (
          <div
            style={{
              marginTop: 8,
              background: '#121722',
              border: '1px solid #2a3346',
              borderRadius: 12,
              padding: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {[
                {key:'all', label:'Все'},
                {key:'creator', label:'Поручил'},
                {key:'assignee', label:'Делаю'},
                {key:'watcher', label:'Наблюдаю'},
              ].map(it => (
                <button
                  key={it.key}
                  onClick={() => setRole(it.key as Role)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 10,
                    border: '1px solid #2a3346',
                    background: role === it.key ? '#30416d' : '#1b2030',
                    color: '#e5e7eb',
                    cursor: 'pointer'
                  }}
                >
                  {it.label}
                </button>
              ))}

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                style={{
                  marginLeft: 'auto',
                  background:'#0b1220',
                  color:'#e5e7eb',
                  border:'1px solid #2a3346',
                  borderRadius: 10,
                  padding:'6px 8px'
                }}
              >
                <option value="updated_desc">по дате изменения ↓</option>
                <option value="updated_asc">по дате изменения ↑</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {STATUS_LABELS.map(s => (
                <label
                  key={s}
                  style={{
                    display:'flex',
                    gap:6,
                    alignItems:'center',
                    background:'#0b1220',
                    border:'1px solid #2a3346',
                    borderRadius: 8,
                    padding:'4px 8px'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!statuses[s]}
                    onChange={(e) => setStatuses(prev => ({ ...prev, [s]: e.target.checked }))}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', marginTop: 10, gap: 8 }}>
              <button
                onClick={() => setFiltersOpen(false)}
                style={{
                  padding:'6px 10px',
                  borderRadius:10,
                  border:'1px solid #2a3346',
                  background:'#1b2030',
                  color:'#e5e7eb',
                  cursor:'pointer'
                }}
              >
                Готово
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Список */}
      <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
        {items.map((t) => {
          const ph = phaseOf(t);
          const { bg: cardBg, brd: cardBrd, chip: groupChipBg } = colorsForPhase(ph);

          const eventTypeRaw = String(
            (t as any).type ??
            (t as any).taskType ??
            (t as any).kind ??
            (t as any).task_kind ??
            ''
          ).toUpperCase();

          const isEvent =
            eventTypeRaw === 'EVENT' ||
            (t as any).isEvent === true ||
            Boolean((t as any).startAt || (t as any).eventStart || (t as any).start_at);

          const startAt =
            ((t as any).startAt ??
             (t as any).eventStart ??
             (t as any).start_at) as string | undefined;

          const endAt =
            ((t as any).endAt ??
             (t as any).eventEnd ??
             (t as any).end_at) as string | undefined;

          const dateLine = isEvent && startAt
            ? `${fmtShort(startAt)}–${fmtShort(endAt || startAt)}`
            : null;

          const opened = openQBarId === t.id;
          const currentPhase = ph;
          const groupId = (t as any)?.groupId ?? null;

 const badge = badgeForPhase(currentPhase);
 const activeRing = opened ? '0 0 0 2px rgba(138,160,255,.45) inset, 0 8px 20px rgba(0,0,0,.20)' : '0 2px 8px rgba(0,0,0,.06)';




          return (
     // вместо: <div key={t.id} style={{ position: 'relative', paddingTop: opened ? BAR_SPACE : 0 }}>
<div key={t.id} style={{ position: 'relative' }}>
  {opened && (
    <StageQuickBar
      taskId={t.id}

      edgeInset={12} // ← поставь 0 чтобы растянуть по краям контейнера
      groupId={groupId}
      meChatId={meChatId}
      currentPhase={currentPhase}
      onPicked={(next) => {
        // локально обновим только выбранную карточку
        patchItem(t.id, { phase: next, status: statusTextFromStage(next) });
      }}
      onRequestClose={closeQBar}
    />
  )}

  {/* карточка смещается ВНИЗ, освобождая место ПЕРЕД собой */}
 <button
    style={{
      marginTop: opened ? BAR_SPACE : 0,
      textAlign: 'left',
      background: cardBg,
      color: '#0f1216',
     border: `1px solid ${opened ? '#30416d' : cardBrd}`,
      borderRadius: 16,
      padding: 12,
      cursor: 'pointer',
     boxShadow: activeRing,
      width: '100%',
      userSelect: 'none' as const,
      WebkitUserSelect: 'none' as const,
      msUserSelect: 'none' as const,
      touchAction: 'manipulation',
      transition: 'box-shadow 140ms ease, border-color 140ms ease, margin-top 140ms ease'
    }}
   onClick={() => { if (!opened) { onOpenTask(t.id); WebApp?.HapticFeedback?.impactOccurred?.('light'); }}}
    onMouseDown={(e) => { e.preventDefault(); startLongPress(t.id); }}
    onMouseUp={cancelLongPress}
    onMouseLeave={cancelLongPress}
    onTouchStart={() => startLongPress(t.id)}
    onTouchEnd={cancelLongPress}
    onTouchCancel={cancelLongPress}
    onContextMenu={(e) => e.preventDefault()}
    onDragStart={(e) => e.preventDefault()}
  >




                <div style={{ fontSize:12, opacity:.6, marginBottom:4 }}>#{t.id.slice(0,6)}</div>

                <div style={{ display:'flex', alignItems:'start', gap:8, marginBottom:6 }}>
                  <div style={{ fontSize:16, whiteSpace:'pre-wrap', wordBreak:'break-word', flex:1 }}>
                    {isEvent ? '📅 ' : ''}{(t as any).text}
                  </div>
                     {badge && (
     <span
       title={badge.text}
       style={{
         background: badge.bg,
         color: badge.fg,
         border: `1px solid ${badge.brd}`,
         padding:'2px 8px',
         borderRadius: 999,
         fontSize:12,
         whiteSpace:'nowrap'
       }}
     >
       {badge.text}
     </span>
   )}
                </div>

                {dateLine && (
                  <div style={{ fontSize:12, opacity:.75, marginBottom: 6 }}>{dateLine}</div>
                )}

                <div
                  style={{
                    display:'inline-block',
                    background: groupChipBg,
                    color:'#fff',
                    padding:'3px 8px',
                    borderRadius:8,
                    fontSize:12,
                    marginBottom:6
                  }}
                >
                  {(t as any).groupTitle}
                </div>

                <div style={{ fontSize:12, opacity:.8, display:'flex', gap:10 }}>
                  <span>👤 {(t as any).creatorName}</span>
                  {(t as any).assigneeName ? <span>→ {(t as any).assigneeName}</span> : null}
                  <span style={{ marginLeft:'auto' }}>{new Date((t as any).updatedAt).toLocaleString()}</span>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Показать ещё */}
      <div style={{ display:'flex', justifyContent:'center', marginTop: 12 }}>
        {hasMore ? (
          <button
            onClick={loadMore}
            disabled={loading}
            style={{ padding:'10px 16px', borderRadius: 12, border:'1px solid #2a3346', background:'#202840', color:'#e5e7eb', minWidth:160 }}
          >
            {loading ? 'Загружаю…' : 'Показать ещё'}
          </button>
        ) : (
          <div style={{ fontSize:12, opacity:.6 }}>Больше задач нет</div>
        )}
      </div>
    </div>
  );
}
