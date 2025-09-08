// webapp/src/pages/Home/HomePage.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import {
  listMyFeed,
  type TaskFeedItem,
  getTaskLabels,
  type GroupLabel,
  listGroups,
  API_BASE,
} from '../../api';
import StageQuickBar from '../../components/StageQuickBar';
import type { StageKey } from '../../components/StageScroller';
import GroupFilterModal from '../../components/GroupFilterModal';
import LabelFilterWheel from '../../components/LabelFilterWheel';

const LONG_PRESS_MS = 500;

function fmtShort(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function phaseOf(t: any): StageKey | string | undefined {
  const ph = String(t?.phase ?? t?.status ?? '').trim();
  const low = ph.toLowerCase();
  if (['inbox', 'новые', 'новое'].includes(low)) return 'Inbox';
  if (['doing', 'в работе'].includes(low)) return 'Doing';
  if (['done', 'готово', 'готов'].includes(low)) return 'Done';
  if (['cancel', 'отмена', 'отменено', 'отменена'].includes(low)) return 'Cancel';
  if (['approval', 'согласование', 'на согласовании'].includes(low)) return 'Approval';
  if (['wait', 'ждет', 'ждёт', 'ожидание'].includes(low)) return 'Wait';
  return ph || undefined;
}

function statusTextFromStage(s: StageKey): string {
  return s === 'Inbox'
    ? 'Новые'
    : s === 'Doing'
    ? 'В работе'
    : s === 'Done'
    ? 'Готово'
    : s === 'Cancel'
    ? 'Отмена'
    : s === 'Approval'
    ? 'Согласование'
    : s === 'Wait'
    ? 'Ждёт'
    : String(s);
}

function colorsForPhase(p?: StageKey | string) {
  switch (p) {
    case 'Done':
      return { bg: '#E8F5E9', brd: '#C8E6C9', chip: '#2e7d32' };
    case 'Cancel':
      return { bg: '#FDECEC', brd: '#F5C2C2', chip: '#8a2b2b' };
    case 'Doing':
      return { bg: '#E3F2FD', brd: '#BBDEFB', chip: '#1e3a8a' };
    case 'Wait':
      return { bg: '#E7F5FF', brd: '#B8E1FF', chip: '#1f4d6b' };
    case 'Approval':
      return { bg: '#FFF3E0', brd: '#FFE0B2', chip: '#7a4a12' };
    default:
      return { bg: '#FFFFFF', brd: '#e5e7eb', chip: '#3b4b7a' };
  }
}

type Badge = { text: string; bg: string; fg: string; brd: string };
function badgeForPhase(p?: StageKey | string): Badge | null {
  switch (p) {
    case 'Done':
      return { text: '✓ Готово', bg: '#D1F2DC', fg: '#0f5132', brd: '#A3DFB9' };
    case 'Cancel':
      return { text: '❌ Отмена', bg: '#FDDCDC', fg: '#7a1f1f', brd: '#F3B3B3' };
    case 'Doing':
      return { text: '🔨 В работе', bg: '#D7E6FF', fg: '#123a7a', brd: '#BBD6FF' };
    case 'Approval':
      return { text: '👉👈 Согласов', bg: '#FFE9CC', fg: '#6b3d06', brd: '#FFD59A' };
    case 'Wait':
      return { text: '🥶 Ждёт', bg: '#E0F2FF', fg: '#063f5c', brd: '#B9E4FF' };
    case 'Inbox':
      return { text: '🌱 Новое', bg: '#ECEAFE', fg: '#2e1065', brd: '#DBD7FF' };
    default:
      return null;
  }
}

type PageKey = 'all' | StageKey;
const PAGES: { key: PageKey; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'Inbox', label: 'Новые' },
  { key: 'Doing', label: 'В работе' },
  { key: 'Approval', label: 'Согласование' },
  { key: 'Wait', label: 'Ждёт' },
  { key: 'Done', label: 'Готово' },
  { key: 'Cancel', label: 'Отмена' },
];

type FeedScope = { kind: 'all' } | { kind: 'group'; groupId: string };

export default function HomePage({
  chatId,
  onOpenTask,
}: {
  chatId: string;
  onOpenTask: (id: string) => void;
}) {
  // 🏷️ кэш ярлыков по задачам
  const [labelsByTask, setLabelsByTask] = useState<Record<string, GroupLabel[]>>({});

  // состояние ленты
  const [items, setItems] = useState<TaskFeedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  // выбор области
  const [scope, setScope] = useState<FeedScope>({ kind: 'all' });
  const [currentGroupTitle, setCurrentGroupTitle] = useState<string | null>(null);

  // модалки
  const [isGroupPickerOpen, setGroupPickerOpen] = useState(false);

  // показ FAB 🏷️ (только когда юзер ткнул название группы)
  const [showLabelFab, setShowLabelFab] = useState(false);

  // кэш ярлыков по группе
  const [groupLabelsCache, setGroupLabelsCache] = useState<Record<string, GroupLabel[]>>({});

  // выбранный ярлык (фильтр)
  const [selectedLabel, setSelectedLabel] = useState<{ id: string; title: string } | null>(null);

  // колесо выбора ярлыка
  const [isLabelWheelOpen, setLabelWheelOpen] = useState(false);

  // поиск
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');

  const meChatId = String(
    WebApp?.initDataUnsafe?.user?.id || new URLSearchParams(location.search).get('from') || ''
  );

  const DEFAULT_STATUSES = ['Новые', 'В работе', 'Готово', 'Согласование', 'Ждёт'] as const;

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
          q: search.trim(),
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
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [chatId, search]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const r = await listMyFeed({
        chatId,
        role: 'all',
        statuses: Array.from(DEFAULT_STATUSES),
        q: search.trim(),
        sort: 'updated_desc',
        offset,
        limit: 30,
      });
      if (r.ok) {
        setItems((prev) => [...prev, ...r.items]);
        setOffset(r.nextOffset);
        setHasMore(r.hasMore);
      }
    } finally {
      setLoading(false);
    }
  };

  // сбрасываем выбранный ярлык, если вышли из режима группы
  useEffect(() => {
    if (scope.kind !== 'group') {
      setSelectedLabel(null);
      setShowLabelFab(false);
    }
  }, [scope]);

  // подгрузка ярлыков задач (ленивая)
  useEffect(() => {
    let alive = true;
    const missing = items
      .filter((t: any) => {
        const hasFromFeed = Array.isArray(t.labels) || Array.isArray(t.labelTitles);
        if (hasFromFeed) return false;
        if (labelsByTask[t.id]) return false;
        return true;
      })
      .slice(0, 15);
    if (!missing.length) return;

    (async () => {
      const results = await Promise.allSettled(
        missing.map(async (it) => {
          const r = await getTaskLabels(it.id);
          const arr: GroupLabel[] = Array.isArray(r) ? r : Array.isArray((r as any)?.labels) ? (r as any).labels : [];
          return [it.id, arr] as const;
        })
      );
      if (!alive) return;
      setLabelsByTask((prev) => {
        const next = { ...prev };
        for (const res of results) {
          if (res.status === 'fulfilled') {
            const [id, labels] = res.value;
            next[id] = labels;
          }
        }
        return next;
      });
    })();

    return () => {
      alive = false;
    };
  }, [items, labelsByTask]);

  // узнаём название текущей группы по id
  useEffect(() => {
    if (scope.kind !== 'group' || !scope.groupId) {
      setCurrentGroupTitle(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const r = await listGroups(meChatId);
        if (!alive) return;
        if ((r as any)?.ok) {
          const g = (r as any).groups?.find((x: any) => x.id === scope.groupId);
          setCurrentGroupTitle(g ? g.title : null);
        }
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [scope, meChatId]);

  // базовая фильтрация + по ярлыку
  const filteredItems = useMemo(() => {
    const base = items.filter((t: any) => {
      if (scope.kind === 'all') return true;
      return String(t.groupId || '') === String(scope.groupId);
    });

    if (!(scope.kind === 'group') || !selectedLabel) return base;

    const matchTitle = selectedLabel.title.trim().toLowerCase();
    const hasLabel = (t: any) => {
      const fromFeedObj = Array.isArray(t.labels) ? (t.labels as { id?: string; title: string }[]) : [];
      const fromFeedStr = Array.isArray(t.labelTitles) ? (t.labelTitles as string[]) : [];
      const fromCache = labelsByTask[t.id] || [];

      const hitObj = (arr: { id?: string; title: string }[]) =>
        arr.some(
          (l) => (l.id && l.id === selectedLabel.id) || l.title?.trim().toLowerCase() === matchTitle
        );

      if (fromFeedObj.length && hitObj(fromFeedObj)) return true;
      if (fromCache.length && hitObj(fromCache)) return true;
      if (fromFeedStr.length && fromFeedStr.some((tt) => tt.trim().toLowerCase() === matchTitle))
        return true;
      return false;
    };

    return base.filter(hasLabel);
  }, [items, scope, selectedLabel, labelsByTask]);

  // локальный патч только выбранного айтема
  const patchItem = (id: string, patch: Partial<TaskFeedItem> & Record<string, any>) => {
    setItems((prev) => (prev.map((it) => (it.id === id ? ({ ...it, ...patch } as any) : it))));
  };

  // QUICK BAR
  const [openQBarId, setOpenQBarId] = useState<string | null>(null);
  const lpTimer = useRef<any>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const isQuickBarOpen = openQBarId !== null;

  const startLongPress = (taskId: string) => {
    clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      setOpenQBarId(taskId);
      try {
        WebApp?.HapticFeedback?.impactOccurred?.('light');
      } catch {}
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    clearTimeout(lpTimer.current);
  };
  const closeQBar = () => setOpenQBarId(null);

  // загрузка ярлыков группы (для колеса)
  async function ensureGroupLabels(groupId: string): Promise<GroupLabel[]> {
    if (groupLabelsCache[groupId]) return groupLabelsCache[groupId];
    try {
      const res = await fetch(`${API_BASE}/groups/${groupId}/labels?by=${meChatId}`);
      const j = await res.json();
      const labels: GroupLabel[] = Array.isArray(j?.labels) ? j.labels : Array.isArray(j) ? j : [];
      setGroupLabelsCache((prev) => ({ ...prev, [groupId]: labels }));
      return labels;
    } catch {
      return [];
    }
  }

  // блокируем горизонтальный скролл ленты при открытом qbar
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    let startX = 0,
      startY = 0,
      active = false;
    const onTouchStart = (e: TouchEvent) => {
      if (!isQuickBarOpen) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      active = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isQuickBarOpen || !active) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onTouchEnd = () => {
      active = false;
    };
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

  // прокрутка по страницам колёсиком
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    let wheelLock = false;
    const onWheelStep = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (wheelLock) return;
      wheelLock = true;
      const dir = e.deltaX > 0 ? 1 : -1;
      const page = Math.round(el.scrollLeft / el.clientWidth);
      const next = Math.max(0, Math.min(page + dir, PAGES.length - 1));
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
      setTimeout(() => {
        wheelLock = false;
      }, 350);
    };
    el.addEventListener('wheel', onWheelStep, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheelStep as any);
    };
  }, []);

  // ---- UI ----
  return (
    <div style={{ padding: 12, paddingBottom: 96 }}>
      {/* Хедер: Все | <группа>  🔎 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button
          onClick={() => {
            setScope({ kind: 'all' });
            setShowLabelFab(false);
            setSelectedLabel(null);
          }}
          style={{ background: 'transparent', border: 'none', color: '#c7d2fe', cursor: 'pointer', fontSize: 14 }}
          title="Показать все задачи"
        >
          Все
        </button>
        <span style={{ opacity: 0.35 }}>|</span>
        <button
          onClick={() => {
            if (scope.kind === 'group') {
              setShowLabelFab((v) => !v); // показать/скрыть 🏷️
            } else {
              setGroupPickerOpen(true); // сначала выберем группу
            }
          }}
          style={{ background: 'transparent', border: 'none', color: '#c7d2fe', cursor: 'pointer', fontSize: 14 }}
          title="Текущая группа / показать фильтр по ярлыкам"
        >
          {scope.kind === 'group' ? currentGroupTitle || 'Выбрана группа' : 'Выбрать группу'}
        </button>
        <div style={{ marginLeft: 'auto' }} />
        <button
          onClick={() => setSearchOpen((v) => !v)}
          style={{ background: 'transparent', border: 'none', color: '#c7d2fe', cursor: 'pointer', fontSize: 18 }}
          title="Поиск"
        >
          🔎
        </button>
      </div>

      {searchOpen && (
        <div style={{ marginBottom: 8 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск…"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid #2a3346',
              background: '#121722',
              color: '#e8eaed',
            }}
          />
        </div>
      )}

      {/* Канбан-слайдер */}
      <div
        ref={sliderRef}
        style={{
          display: 'flex',
          overflowX: 'auto',
          touchAction: 'auto',
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
              style={{ minWidth: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always', paddingTop: 8 }}
            >
              {/* шапка страницы с фильтром-ярлыком */}
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  padding: '6px 12px 8px',
                  background: 'linear-gradient(180deg, rgba(11,14,22,0.9) 0%, rgba(11,14,22,0.0) 100%)',
                  backdropFilter: 'blur(2px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    background: '#1b2234',
                    color: '#c7d2fe',
                    border: '1px solid #2a3346',
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: 0.2,
                  }}
                >
                  {pg.label}
                </span>

                {scope.kind === 'group' && (
                  <button
                    onClick={async () => {
                      if (scope.kind !== 'group') return;
                      await ensureGroupLabels(scope.groupId);
                      setLabelWheelOpen(true);
                    }}
                    title="Фильтр по ярлыку"
                    style={{
                      background: '#121722',
                      color: '#e8eaed',
                      border: '1px solid #2a3346',
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    🏷️ {selectedLabel?.title || 'Все ярлыки'}
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pageItems.length ? (
                  pageItems.map((t) => {
                    const ph = phaseOf(t);
                    const { bg: cardBg, brd: cardBrd, chip: groupChipBg } = colorsForPhase(ph);
                    const eventTypeRaw = String(
                      (t as any).type ?? (t as any).taskType ?? (t as any).kind ?? (t as any).task_kind ?? ''
                    ).toUpperCase();
                    const isEvent =
                      eventTypeRaw === 'EVENT' ||
                      (t as any).isEvent === true ||
                      Boolean((t as any).startAt || (t as any).eventStart || (t as any).start_at);
                    const startAt = ((t as any).startAt ?? (t as any).eventStart ?? (t as any).start_at) as
                      | string
                      | undefined;
                    const endAt = ((t as any).endAt ?? (t as any).eventEnd ?? (t as any).end_at) as
                      | string
                      | undefined;
                    const dateLine = isEvent && startAt ? `${fmtShort(startAt)}–${fmtShort(endAt || startAt)}` : null;
                    const opened = openQBarId === t.id;
                    const currentPhase = ph;
                    const groupId = (t as any)?.groupId ?? null;
                    const badge = badgeForPhase(currentPhase);
                    const activeRing = opened
                      ? '0 0 0 2px rgba(138,160,255,.45) inset, 0 8px 20px rgba(0,0,0,.20)'
                      : '0 2px 8px rgba(0,0,0,.06)';
                    const anchorId = `task-card-${pg.key}-${t.id}`;

                    return (
                      <div key={`${pg.key}-${t.id}`} style={{ position: 'relative', zIndex: opened ? 1200 : 'auto' }}>
                        {opened && (
                          <StageQuickBar
                            anchorId={anchorId}
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
                          id={anchorId}
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
                            transition: 'box-shadow 140ms ease, border-color 140ms ease, margin-top 140ms ease',
                          }}
                          onClick={() => {
                            if (!opened) {
                              onOpenTask(t.id);
                              try {
                                WebApp?.HapticFeedback?.impactOccurred?.('light');
                              } catch {}
                            }
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            startLongPress(t.id);
                          }}
                          onMouseUp={cancelLongPress}
                          onMouseLeave={cancelLongPress}
                          onTouchStart={() => startLongPress(t.id)}
                          onTouchEnd={cancelLongPress}
                          onTouchCancel={cancelLongPress}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                        >
                          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>#{t.id.slice(0, 6)}</div>

                          <div style={{ display: 'flex', alignItems: 'start', gap: 8, marginBottom: 6 }}>
                            <div style={{ fontSize: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
                              {isEvent ? '📅 ' : ''}
                              {(t as any).text}
                            </div>
                            {badge && (
                              <span
                                title={badge.text}
                                style={{
                                  background: badge.bg,
                                  color: badge.fg,
                                  border: `1px solid ${badge.brd}`,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: 12,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {badge.text}
                              </span>
                            )}
                          </div>

                          {dateLine && (
                            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{dateLine}</div>
                          )}

                          <div
                            style={{
                              display: 'inline-block',
                              background: groupChipBg,
                              color: '#fff',
                              padding: '3px 8px',
                              borderRadius: 8,
                              fontSize: 12,
                              marginBottom: 6,
                            }}
                          >
                            {(t as any).groupTitle}
                          </div>

                          {/* ярлыки карточки */}
                          {(() => {
                            const raw = (t as any).labels as { id?: string; title: string }[] | undefined;
                            const titles = (t as any).labelTitles as string[] | undefined;
                            const labels: { id: string; title: string }[] = Array.isArray(raw)
                              ? raw.map((l, i) => ({ id: l.id || `${t.id}_f${i}`, title: l.title }))
                              : Array.isArray(titles)
                              ? titles.map((title, i) => ({ id: `${t.id}_ft${i}`, title }))
                              : (labelsByTask[t.id] || []).map((l, i) => ({
                                  id: l.id || `${t.id}_c${i}`,
                                  title: l.title,
                                }));
                            if (!labels.length) return null;
                            return (
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 6,
                                  flexWrap: 'wrap',
                                  marginTop: 4,
                                  marginBottom: 6,
                                }}
                              >
                                {labels.slice(0, 3).map((l) => (
                                  <span
                                    key={l.id}
                                    title={`Ярлык: ${l.title}`}
                                    style={{
                                      display: 'inline-block',
                                      padding: '2px 8px',
                                      borderRadius: 999,
                                      border: '1px solid #dbeafe',
                                      background: '#eff6ff',
                                      color: '#1e40af',
                                      fontSize: 12,
                                      lineHeight: '16px',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    🏷️ {l.title}
                                  </span>
                                ))}
                                {labels.length > 3 && (
                                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                                    +{labels.length - 3}
                                  </span>
                                )}
                              </div>
                            );
                          })()}

                          <div style={{ fontSize: 12, opacity: 0.8, display: 'flex', gap: 10 }}>
                            <span>👤 {(t as any).creatorName}</span>
                            {(t as any).assigneeName ? <span>→ {(t as any).assigneeName}</span> : null}
                            <span style={{ marginLeft: 'auto' }}>
                              {new Date((t as any).updatedAt).toLocaleString()}
                            </span>
                          </div>
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ opacity: 0.6, padding: '12px' }}>Нет задач</div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Показать ещё */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        {hasMore ? (
          <button
            onClick={loadMore}
            disabled={loading}
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              border: '1px solid #2a3346',
              background: '#202840',
              color: '#e5e7eb',
              minWidth: 160,
            }}
          >
            {loading ? 'Загружаю…' : 'Показать ещё'}
          </button>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.6 }}>Больше задач нет</div>
        )}
      </div>

      {/* 📁 фильтр по группе */}
      <button
        onClick={() => setGroupPickerOpen(true)}
        aria-label="Фильтр по группе"
        style={{
          position: 'fixed',
          right: 16,
          bottom: `calc(152px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 1200,
          width: 56,
          height: 56,
          borderRadius: 28,
          border: 'none',
          background: '#ffffff',
          boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
          fontSize: 28,
          lineHeight: '56px',
          textAlign: 'center',
          cursor: 'pointer',
        }}
      >
        📁
      </button>

      {/* 🏷️ появляется над 📁 только для группы и после клика по названию группы */}
      {scope.kind === 'group' && showLabelFab && (
        <button
          onClick={async () => {
            if (scope.kind !== 'group') return;
            await ensureGroupLabels(scope.groupId);
            setLabelWheelOpen(true);
          }}
          aria-label="Фильтр по ярлыку"
          style={{
            position: 'fixed',
            right: 16,
            bottom: `calc(212px + env(safe-area-inset-bottom, 0px))`,
            zIndex: 1200,
            width: 56,
            height: 56,
            borderRadius: 28,
            border: 'none',
            background: '#ffffff',
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
            fontSize: 28,
            lineHeight: '56px',
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          🏷️
        </button>
      )}

      {/* Модалки */}
      <GroupFilterModal
        isOpen={isGroupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        chatId={chatId}
        initialGroupId={scope.kind === 'group' ? scope.groupId : undefined}
        onApply={(groupId) => {
          setGroupPickerOpen(false);
          if (groupId) {
            setScope({ kind: 'group', groupId });
            setSelectedLabel(null); // сбрасываем фильтр
            setShowLabelFab(true); // можно сразу показать 🏷️
          } else {
            setScope({ kind: 'all' });
            setSelectedLabel(null);
            setShowLabelFab(false);
          }
        }}
      />

{scope.kind === 'group' && (
  <LabelFilterWheel
    open={isLabelWheelOpen}
    onClose={() => setLabelWheelOpen(false)}
    labels={(groupLabelsCache[scope.groupId] || []).map(l => ({ id: l.id, title: l.title }))}
    value={selectedLabel?.id ?? null}
    onPick={(pickedId) => {
      if (pickedId === null) {
        setSelectedLabel(null);
      } else {
        const found = (groupLabelsCache[scope.groupId] || []).find(l => l.id === pickedId);
        setSelectedLabel(found ? { id: found.id, title: found.title } : null);
      }
    }}
    title="Фильтр по ярлыку"
    placement="center"  // 'center' чтобы по центру; 'top' — ближе к верху
   // topOffset={88}
  />
)}


    </div>
  );
}
