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


import FeedScopeTabs, { type FeedScope } from '../../components/FeedScopeTabs';



const LONG_PRESS_MS = 500;


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
    case 'Inbox':    return { text: '🌱 Новое',      bg: '#ECEAFE', fg: '#2e1065', brd: '#DBD7FF' };
    default:         return null;
  }
}




// после colorsForPhase / badgeForPhase
type PageKey = 'all' | StageKey;

const PAGES: { key: PageKey; label: string }[] = [
  { key: 'all',     label: 'Все' },
  { key: 'Inbox',   label: 'Новые' },
  { key: 'Doing',   label: 'В работе' },
  { key: 'Approval',label: 'Согласование' },
  { key: 'Wait',    label: 'Ждёт' },
  { key: 'Done',    label: 'Готово' },
  { key: 'Cancel',  label: 'Отмена' },
];








export default function HomePage({
  chatId,
  onOpenTask,
}: { chatId: string; onOpenTask: (id: string) => void }) {




  const [items, setItems] = useState<TaskFeedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

const DEFAULT_STATUSES = ['Новые','В работе','Готово','Согласование','Ждёт'] as const;

  const meChatId = String(WebApp?.initDataUnsafe?.user?.id || new URLSearchParams(location.search).get('from') || '');

  const [currentProject, setCurrentProject] = useState<StoriesBarItem | null>(null);
  const onOpenProjectStories = (item: StoriesBarItem) => {
    setCurrentProject(item);
    setViewerOpen(true);
  };

  const [viewerOpen, setViewerOpen] = useState(false);
  const { items: storyItems, markSeen } = useStoriesData(meChatId);




// индекс текущей "страницы" канбана










  // выбранная вкладка таб-бара
 const [scope, setScope] = useState<FeedScope>({ kind: 'all' });


 const filteredItems = useMemo(() => {
    if (scope.kind === 'all') return items;
    if (scope.kind === 'personal') {
      return items.filter((t: any) =>
        String(t.creatorChatId) === String(chatId) ||
        String(t.assigneeChatId || '') === String(chatId)
      );
    }


        // группа
    return items.filter((t: any) => String(t.groupId || '') === String(scope.groupId));
  }, [items, scope, chatId]);












  // загрузка фида
  useEffect(() => {
  let alive = true;
  const load = async () => {
    setLoading(true);
    try {
      const r = await listMyFeed({
        chatId,
        role: 'all',
        statuses: Array.from(DEFAULT_STATUSES),
        q: '',
        sort: 'updated_desc',
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
}, [chatId]);


  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
   const r = await listMyFeed({
  chatId,
  role: 'all',
  statuses: Array.from(DEFAULT_STATUSES),
  q: '',
  sort: 'updated_desc',
  offset,
  limit: 30,
});
      if (r.ok) {
        setItems(prev => [...prev, ...r.items]);
        setOffset(r.nextOffset);
        setHasMore(r.hasMore);
      }
    } finally { setLoading(false); }
  };


  // локальный патч только выбранного айтема
  const patchItem = (id: string, patch: Partial<TaskFeedItem> & Record<string, any>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } as any : it));
  };


// QUICK BAR (долгий тап)
const [openQBarId, setOpenQBarId] = useState<string | null>(null);
const lpTimer = useRef<any>(null);

// ref на горизонтальный слайдер (канбан-лента)
const sliderRef = useRef<HTMLDivElement | null>(null);

// открыт ли быстрый бар
const isQuickBarOpen = openQBarId !== null;

const startLongPress = (taskId: string) => {
  clearTimeout(lpTimer.current);
  lpTimer.current = setTimeout(() => {
    setOpenQBarId(taskId);
    try { WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch {}
  }, LONG_PRESS_MS);
};
const cancelLongPress = () => { clearTimeout(lpTimer.current); };
const closeQBar = () => setOpenQBarId(null);



// Блокируем ТОЛЬКО горизонтальную прокрутку канбан-ленты, когда меню открыто
useEffect(() => {
  const el = sliderRef.current;
  if (!el) return;

  let startX = 0, startY = 0, active = false;

  const onTouchStart = (e: TouchEvent) => {
    if (!isQuickBarOpen) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; active = true;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!isQuickBarOpen || !active) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    // Глушим только горизонтальные движения
    if (Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onTouchEnd = () => { active = false; };

  const onWheel = (e: WheelEvent) => {
    if (!isQuickBarOpen) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  el.addEventListener('touchstart', onTouchStart, { passive: false });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd, { passive: true });
  el.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    el.removeEventListener('touchstart', onTouchStart as any);
    el.removeEventListener('touchmove', onTouchMove as any);
    el.removeEventListener('touchend', onTouchEnd as any);
    el.removeEventListener('wheel', onWheel as any);
  };
}, [isQuickBarOpen]);








  return (
    <div style={{ padding: 12, paddingBottom: 96 }}>
      <StoriesBar items={storyItems} onOpen={onOpenProjectStories} />





 {/* таб-бар c «Все | Личные | Группы…» */}
      <FeedScopeTabs
        chatId={chatId}
        value={scope}
        onChange={setScope}
      />





      {viewerOpen && currentProject && (
        <StoriesViewer
          project={currentProject}
          onClose={() => setViewerOpen(false)}
          onSeen={(slideIndex) => {
            markSeen(currentProject.projectId, slideIndex);
          }}
        />
      )}




   

      

      {/* Список */}
{/* Канбан-слайдер (горизонтальные страницы со snap) */}
<div
  ref={sliderRef}
  style={{
    display: 'flex',
    overflowX: 'auto',            // ← всегда auto
    touchAction: 'auto',          // ← разрешаем и pan-x, и pan-y
    overscrollBehaviorX: 'contain' as any,
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    gap: 0,
    scrollBehavior: 'smooth',
  }}
>



{PAGES.map((pg) => {
  const pageItems = filteredItems.filter((t: any) => {
    if (pg.key === 'all') return true;
    return String(phaseOf(t)) === pg.key;
  });







  return (
    <section
      key={pg.key}
      style={{
        minWidth: '100%',
        scrollSnapAlign: 'start',
        paddingTop: 8,
      }}
    >



      {/* Заголовок страницы – “прикреплён” к самой странице */}
      <div style={{
        fontSize: 12,
        opacity: .6,
        padding: '0 12px 6px'
        // если захочешь, можно сделать локально липким:
        // position: 'sticky', top: 0, background: '#0f1216', zIndex: 1
      }}>
        ({pg.label.toLowerCase()})
      </div>



        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pageItems.length ? (
            pageItems.map((t) => {
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
              const activeRing = opened
                ? '0 0 0 2px rgba(138,160,255,.45) inset, 0 8px 20px rgba(0,0,0,.20)'
                : '0 2px 8px rgba(0,0,0,.06)';

              return (
<div
  key={t.id}
  style={{
    position: 'relative',
    zIndex: opened ? 1200 : 'auto',
  }}
>



{opened && (
  <StageQuickBar
    anchorId={`task-card-${t.id}`}   // ← НОВОЕ
    taskId={t.id}
    groupId={groupId}
    meChatId={meChatId}
    currentPhase={currentPhase}
    edgeInset={12}
    onPicked={(next) => patchItem(t.id, { phase: next, status: statusTextFromStage(next) })}
    onRequestClose={closeQBar}
  />
)}







                  <button
                  id={`task-card-${t.id}`}
                    style={{
                   
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
                    onClick={() => {
                      if (!opened) {
                        onOpenTask(t.id);
                        try { WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch {}
                      }
                    }}
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
            })
          ) : (
            <div style={{ opacity:.6, padding:'12px' }}>Нет задач</div>
          )}
        </div>
      </section>
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


