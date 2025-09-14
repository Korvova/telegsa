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
  uploadTaskMedia,
  addComment,
  completeTask,
  fetchBoard,
  moveTask,
} from '../../api';
import { listPreTasks, type PreTaskDTO, getGroupMembers } from '../../api';
import PreTaskCard from '../../components/PreTaskCard';
import PreTaskPreviewModal from '../../components/PreTaskPreviewModal';
import PreTaskEditModal from '../../components/PreTaskEditModal';
// duplicate import removed
import TaskPreTaskLinkManager from '../../components/TaskPreTaskLinkManager';
import EdgePreTaskBadge from '../../components/EdgePreTaskBadge';
import StageQuickBar from '../../components/StageQuickBar';
import DeadlinePicker from '../../components/DeadlinePicker';
import CameraCaptureModal from '../../components/CameraCaptureModal';
import type { StageKey } from '../../components/StageScroller';
import GroupFilterModal from '../../components/GroupFilterModal';
import LabelFilterWheel from '../../components/LabelFilterWheel';
import StarBadge from '../../components/StarBadge';
import PayoutPromptModal from '../../components/PayoutPromptModal';

// const LONG_PRESS_MS = 500; // отключено: открываем быстрые действия по клику на статус

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
  reloadKey = 0,
}: {
  chatId: string;
  onOpenTask: (id: string) => void;
  reloadKey?: number;
}) {
  // скрывать верхние FAB 📁/🏷️, когда открыт CreateTask
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      setIsCreateTaskOpen(Boolean(detail));
    };
    window.addEventListener('create-task-open', handler as EventListener);
    return () => window.removeEventListener('create-task-open', handler as EventListener);
  }, []);
  // 🏷️ кэш ярлыков по задачам
  const [labelsByTask, setLabelsByTask] = useState<Record<string, GroupLabel[]>>({});

  // состояние ленты
  const [items, setItems] = useState<TaskFeedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [preTasks, setPreTasks] = useState<PreTaskDTO[]>([]);
  const [openPreTask, setOpenPreTask] = useState<PreTaskDTO | null>(null);
  const [editPreTask, setEditPreTask] = useState<PreTaskDTO | null>(null);
  const [nameByChat, setNameByChat] = useState<Record<string, string>>({});
  const [groupTitleById, setGroupTitleById] = useState<Record<string, string>>({});
  const [manageForTask, setManageForTask] = useState<{ id: string } | null>(null);

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
  const [completePrompt, setCompletePrompt] = useState<{ id: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [payoutPrompt, setPayoutPrompt] = useState<{ id: string; rub: number } | null>(null);
  // раскрытие списка предзадач под карточкой
  const [openAfter, setOpenAfter] = useState<Record<string, boolean>>({});

  // поиск
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [deadlineEdit, setDeadlineEdit] = useState<{ id: string; value: string | null } | null>(null);

  const meChatId = String(
    WebApp?.initDataUnsafe?.user?.id || new URLSearchParams(location.search).get('from') || ''
  );

  // Свайп вправо по карточке => быстрый запуск создания предзадачи (как по 🔘)
  const swipeState = useRef<{ id: string | null; sx: number; sy: number } | null>(null);
  const [swipeUi, setSwipeUi] = useState<{ id: string | null; dx: number }>({ id: null, dx: 0 });
  const preSwipeState = useRef<{ id: string | null; sx: number; sy: number } | null>(null);
  const [preSwipeUi, setPreSwipeUi] = useState<{ id: string | null; dx: number }>({ id: null, dx: 0 });
  const SWIPE_REVEAL = 120; // ширина «Запустить после» для фиксации
  const SWIPE_MAX = 180; // максимум сдвига визуально
  const SWIPE_Y = 40; // допустимый перекос по оси Y
  const suppressClickRef = useRef<{ id: string; until: number } | null>(null);
  const beginSwipe = (id: string, x: number, y: number) => {
    swipeState.current = { id, sx: x, sy: y };
    setSwipeUi({ id, dx: 0 });
  };
  const moveSwipe = (e: PointerEvent | TouchEvent, id: string) => {
    const st = swipeState.current;
    if (!st || st.id !== id) return;
    let x = 0, y = 0;
    if ((e as TouchEvent).touches && (e as TouchEvent).touches[0]) {
      x = (e as TouchEvent).touches[0].clientX;
      y = (e as TouchEvent).touches[0].clientY;
    } else if ((e as PointerEvent).clientX != null) {
      x = (e as PointerEvent).clientX;
      y = (e as PointerEvent).clientY;
    }
    const dx = x - st.sx;
    const dy = Math.abs(y - st.sy);
    if (dy >= SWIPE_Y) return; // слишком большой вертикальный сдвиг — игнорируем
    if (dx > 10) cancelLongPress();
    const nx = Math.max(0, Math.min(dx, SWIPE_MAX));
    setSwipeUi((prev) => (prev.id === id ? { id, dx: nx } : prev));
  };
  const endSwipe = (id?: string, payload?: { text: string; groupId: string | null }) => {
    const cur = swipeUi;
    if (id && cur.id === id && cur.dx >= SWIPE_REVEAL) {
      cancelLongPress();
      try {
        window.dispatchEvent(new CustomEvent('edge-pre-open', { detail: { taskId: id, text: payload?.text, groupId: payload?.groupId } }));
        WebApp?.HapticFeedback?.impactOccurred?.('light');
      } catch {}
      suppressClickRef.current = { id, until: Date.now() + 600 };
    }
    swipeState.current = null;
    setSwipeUi({ id: null, dx: 0 });
  };
  const beginPreSwipe = (id: string, x: number, y: number) => {
    preSwipeState.current = { id, sx: x, sy: y };
    setPreSwipeUi({ id, dx: 0 });
  };
  const movePreSwipe = (e: PointerEvent | TouchEvent, id: string) => {
    const st = preSwipeState.current;
    if (!st || st.id !== id) return;
    let x = 0, y = 0;
    if ((e as TouchEvent).touches && (e as TouchEvent).touches[0]) {
      x = (e as TouchEvent).touches[0].clientX;
      y = (e as TouchEvent).touches[0].clientY;
    } else if ((e as PointerEvent).clientX != null) {
      x = (e as PointerEvent).clientX;
      y = (e as PointerEvent).clientY;
    }
    const dx = x - st.sx;
    const dy = Math.abs(y - st.sy);
    if (dy >= SWIPE_Y) return;
    if (dx > 10) cancelLongPress();
    const nx = Math.max(0, Math.min(dx, SWIPE_MAX));
    setPreSwipeUi((prev) => (prev.id === id ? { id, dx: nx } : prev));
  };
  const endPreSwipe = (id?: string, payload?: { text: string; groupId: string | null }) => {
    const cur = preSwipeUi;
    if (id && cur.id === id && cur.dx >= SWIPE_REVEAL) {
      cancelLongPress();
      try {
        window.dispatchEvent(new CustomEvent('edge-pre-open', { detail: { preTaskId: id, text: payload?.text, groupId: payload?.groupId } }));
        WebApp?.HapticFeedback?.impactOccurred?.('light');
      } catch {}
      suppressClickRef.current = { id, until: Date.now() + 600 } as any;
    }
    preSwipeState.current = null;
    setPreSwipeUi({ id: null, dx: 0 });
  };

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
        try {
          const pr = await listPreTasks({ chatId, status: ['PREVIEW','ARMED'] });
          if (alive && pr.ok) setPreTasks(pr.preTasks || []);
        } catch {}
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [chatId, search, reloadKey]);

  // подтянуть имена для предзадач (owner + members групп)
  useEffect(() => {
    (async () => {
      try {
        const groupIds = Array.from(new Set(preTasks.map(p => String(p.groupId || '')).filter(Boolean)));
        const map: Record<string, string> = {};
        for (const gid of groupIds) {
          try {
            const r = await getGroupMembers(gid);
            if (r?.owner) map[String(r.owner.chatId)] = r.owner.name || String(r.owner.chatId);
            for (const m of r.members || []) {
              map[String(m.chatId)] = m.name || String(m.chatId);
            }
          } catch {}
        }
        // сам пользователь
        map[String(chatId)] = map[String(chatId)] || 'Я';
        setNameByChat(map);
      } catch {}
    })();
    // build group title map
    (async () => {
      try {
        const r = await listGroups(chatId);
        if ((r as any)?.ok) {
          const map: Record<string, string> = {};
          for (const g of (r as any).groups || []) map[String(g.id)] = g.title;
          setGroupTitleById(map);
        }
      } catch {}
    })();
  }, [preTasks, chatId]);

  // Показ модалки для ответственного, если задача в Done и есть невыплаченное вознаграждение (без скрытия до оплаты)
  useEffect(() => {
    try {
      if (!items.length) return;
      const me = String(WebApp?.initDataUnsafe?.user?.id || new URLSearchParams(location.search).get('from') || '');
      const first = items.find((t) => {
        const rub = Number((t as any).bountyStars || 0);
        const status = String((t as any).bountyStatus || 'NONE');
        const assignee = String((t as any).assigneeChatId || '');
        const isDone = (String((t as any).status || '').toLowerCase() === 'готово') || (String((t as any).phase || '').toLowerCase() === 'done');
        if (!rub || rub <= 0) return false;
        if (status === 'PAID') return false;
        if (!isDone) return false;
        if (!assignee || assignee !== me) return false;
        return true;
      });
      if (first) setPayoutPrompt({ id: (first as any).id, rub: Number((first as any).bountyStars || 0) });
      else setPayoutPrompt(null);
    } catch {}
  }, [items]);

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

  // QUICK BAR (храним id задачи и ключ страницы, чтобы не дублировать в нескольких секциях)
  const [openQBar, setOpenQBar] = useState<{ id: string; page: PageKey } | null>(null);
  const lpTimer = useRef<any>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const isQuickBarOpen = openQBar !== null;

  // long-press отключён: быстрые действия открываются по клику на статус-бейдж
  // const startLongPress = (_taskId: string) => {};
  const cancelLongPress = () => {
    clearTimeout(lpTimer.current);
  };
  const closeQBar = () => setOpenQBar(null);

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

              {(() => {
                let __preIdx = 0;
                const __preSorted = [...preTasks].sort((a, b) => {
                  const ta = new Date(a.createdAt || a.updatedAt || 0).getTime();
                  const tb = new Date(b.createdAt || b.updatedAt || 0).getTime();
                  return tb - ta;
                });
                return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pageItems.length ? (
                  pageItems.map((t) => {
                    const injected: any[] = [];
                    if (pg.key === 'all') {
                      const tTime = new Date((t as any).createdAt || (t as any).updatedAt || 0).getTime();
                      while (__preIdx < __preSorted.length) {
                        const p = __preSorted[__preIdx];
                        const pTime = new Date(p.createdAt || p.updatedAt || 0).getTime();
                        if (pTime >= tTime) {
                          injected.push(
                            <div key={`pre-${p.id}`} style={{ position:'relative' }}>
                              {/* Подложка для свайпа у предзадачи */}
                              {pg.key==='all' && preSwipeUi.id === p.id ? (
                                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'flex-start', paddingLeft:20, pointerEvents:'none', zIndex:0 }}>
                                  <span style={{ display:'inline-block', padding:'4px 10px', borderRadius:999, border:'1px solid #c7f3d1', background:'#e7fbe9', color:'#0f5132', fontSize:12, opacity: Math.min(1, preSwipeUi.dx / SWIPE_REVEAL), boxShadow:'0 2px 6px rgba(0,0,0,.06)' }}>Запустить после</span>
                                </div>
                              ) : null}
                              <div
                                style={{ margin:'0 12px', position:'relative', transition:'transform 160ms ease', transform: (pg.key==='all' && preSwipeUi.id === p.id) ? `translateX(${Math.min(preSwipeUi.dx, 180)}px)` : 'translateX(0px)' }}
                                onMouseDown={(e) => { if (pg.key==='all') beginPreSwipe(p.id, e.clientX, e.clientY); }}
                                onMouseMove={(e) => { if (pg.key==='all') movePreSwipe(e as any, p.id); }}
                                onMouseUp={() => { if (pg.key==='all') endPreSwipe(p.id, { text: (p as any).text, groupId: (p as any).groupId ?? null }); }}
                                onMouseLeave={() => { if (pg.key==='all') endPreSwipe(); }}
                                onTouchStart={(e) => { try { const touch = (e.touches && e.touches[0]) || (e as any).touches?.[0]; if (pg.key==='all' && touch) beginPreSwipe(p.id, touch.clientX, touch.clientY); } catch {} }}
                                onTouchMove={(e) => { if (pg.key==='all') movePreSwipe(e as any, p.id); }}
                                onTouchEnd={() => { if (pg.key==='all') endPreSwipe(p.id, { text: (p as any).text, groupId: (p as any).groupId ?? null }); }}
                                onTouchCancel={() => { if (pg.key==='all') endPreSwipe(); }}
                              >
                                {(() => {
                                  const key = `P:${p.id}`;
                                  const children = __preSorted.filter((x:any) => String(x.id) !== String(p.id) && Array.isArray((x as any).links) && (x as any).links.some((l:any) => String((l as any).depPreTaskId || (l as any).preTaskId || '') === String(p.id)));
                                  const cnt = children.length;
                                  const footer = cnt ? (
                                    <button
                                      onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setOpenAfter(prev => ({ ...prev, [key]: !(prev[key]) })); }}
                                      style={{ width:'100%', textAlign:'left', padding:'6px 10px', borderRadius:10, border:'1px solid #d1e7dd', background:'#ecfdf5', color:'#065f46', fontSize:12, cursor:'pointer' }}
                                    >
                                      Запустят после ({cnt}) {openAfter[key] ? '⬆' : '⬇'}
                                    </button>
                                  ) : null;
                                  return (
                                    <PreTaskCard
                                      p={p}
                                      onOpen={(pp) => setOpenPreTask(pp)}
                                      onEdit={(pp)=>setEditPreTask(pp)}
                                      nameByChat={nameByChat}
                                      groupTitle={p.groupId ? (groupTitleById[String(p.groupId)] || null) : 'Моя группа'}
                                      footer={footer}
                                    />
                                  );
                                })()}
                              </div>
                              {/* Внешний список дочерних предзадач */}
                              {(() => {
                                const key = `P:${p.id}`;
                                if (!openAfter[key]) return null;
                                const children = __preSorted.filter((x:any) => String(x.id) !== String(p.id) && Array.isArray((x as any).links) && (x as any).links.some((l:any) => String((l as any).depPreTaskId || (l as any).preTaskId || '') === String(p.id)));
                                if (!children.length) return null;
                                return (
                                  <div style={{ margin:'6px 12px 0', display:'grid', gap:8 }}>
                                    {children.map((cp:any) => (
                                      <div key={`pchild-${cp.id}`} style={{ position:'relative' }}>
                                        {pg.key==='all' && preSwipeUi.id === (cp as any).id ? (
                                          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'flex-start', paddingLeft:20, pointerEvents:'none', zIndex:0 }}>
                                            <span style={{ display:'inline-block', padding:'4px 10px', borderRadius:999, border:'1px solid #c7f3d1', background:'#e7fbe9', color:'#0f5132', fontSize:12, opacity: Math.min(1, preSwipeUi.dx / SWIPE_REVEAL), boxShadow:'0 2px 6px rgba(0,0,0,.06)' }}>Запустить после</span>
                                          </div>
                                        ) : null}
                                        <div
                                          style={{ position:'relative', transition:'transform 160ms ease', transform: (pg.key==='all' && preSwipeUi.id === (cp as any).id) ? `translateX(${Math.min(preSwipeUi.dx, 180)}px)` : 'translateX(0px)' }}
                                          onMouseDown={(e) => { if (pg.key==='all') beginPreSwipe((cp as any).id, e.clientX, e.clientY); }}
                                          onMouseMove={(e) => { if (pg.key==='all') movePreSwipe(e as any, (cp as any).id); }}
                                          onMouseUp={() => { if (pg.key==='all') endPreSwipe((cp as any).id, { text: (cp as any).text, groupId: (cp as any).groupId ?? null }); }}
                                          onMouseLeave={() => { if (pg.key==='all') endPreSwipe(); }}
                                          onTouchStart={(e) => { try { const t = (e.touches && e.touches[0]) || (e as any).touches?.[0]; if (pg.key==='all' && t) beginPreSwipe((cp as any).id, t.clientX, t.clientY); } catch {} }}
                                          onTouchMove={(e) => { if (pg.key==='all') movePreSwipe(e as any, (cp as any).id); }}
                                          onTouchEnd={() => { if (pg.key==='all') endPreSwipe((cp as any).id, { text: (cp as any).text, groupId: (cp as any).groupId ?? null }); }}
                                          onTouchCancel={() => { if (pg.key==='all') endPreSwipe(); }}
                                        >
                                          <PreTaskCard p={cp} onOpen={(pp)=>setOpenPreTask(pp)} onEdit={(pp)=>setEditPreTask(pp)} nameByChat={nameByChat} groupTitle={(cp as any).groupId ? (groupTitleById[String((cp as any).groupId)] || null) : 'Моя группа'} tone="subtle" />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                          __preIdx++;
                        } else break;
                      }
                    }
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
                    const deadlineAt = (t as any).deadlineAt as string | undefined;
                    const nextReminderAt = (t as any).nextReminderAt as string | undefined;
                    const leftText = (() => {
                      if (!deadlineAt) return null;
                      const ms = new Date(deadlineAt).getTime() - Date.now();
                      const signOverdue = ms < 0;
                      const abs = Math.abs(ms);
                      const d = Math.floor(abs / 86400000);
                      const h = Math.floor((abs % 86400000) / 3600000);
                      const m = Math.floor((abs % 3600000) / 60000);
                      const short = d > 0 ? `${d}д ${h}ч` : h > 0 ? `${h}ч ${m}м` : `${m}м`;
                      return (signOverdue ? `просрочено: ${short}` : `осталось: ${short}`);
                    })();
                    const opened = openQBar?.id === t.id && openQBar?.page === pg.key;
                    const currentPhase = ph;
                    const groupId = (t as any)?.groupId ?? null;
                  const badge = badgeForPhase(currentPhase);
                    const needsPhoto = (t as any).acceptCondition === 'PHOTO';
                    const activeRing = opened
                      ? '0 0 0 2px rgba(138,160,255,.45) inset, 0 8px 20px rgba(0,0,0,.20)'
                      : '0 2px 8px rgba(0,0,0,.06)';
                    const anchorId = `task-card-${pg.key}-${t.id}`;

                    return (
                      <>
                      {injected}
                      <div key={`${pg.key}-${t.id}`} style={{ position: 'relative', zIndex: opened ? 1200 : 'auto' }}>
                        {/* Подложка для свайпа в "Все" */}
                        {pg.key === 'all' && swipeUi.id === (t as any).id ? (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              paddingLeft: 20,
                              pointerEvents: 'none',
                              zIndex: 0,
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: 999,
                                border: '1px solid #c7f3d1',
                                background: '#e7fbe9',
                                color: '#0f5132',
                                fontSize: 12,
                                opacity: Math.min(1, swipeUi.dx / SWIPE_REVEAL),
                                boxShadow: '0 2px 6px rgba(0,0,0,.06)'
                              }}
                            >
                              Запустить после
                            </span>
                          </div>
                        ) : null}
                        {(openQBar?.id === t.id && openQBar?.page === pg.key) && (
                          <StageQuickBar
                            anchorId={anchorId}
                            taskId={t.id}
                            groupId={groupId}
                            meChatId={meChatId}
                            currentPhase={currentPhase}
                            edgeInset={12}
                            onPicked={(next) => patchItem(t.id, { phase: next, status: statusTextFromStage(next) })}
                            onRequestClose={closeQBar}
                            onComplete={async () => {
                              if ((t as any).acceptCondition === 'PHOTO') {
                                setOpenQBar(null);
                                setCompletePrompt({ id: t.id });
                                return false;
                              }
                              if ((t as any).acceptCondition === 'APPROVAL') {
                                try {
                                  const board = await fetchBoard(meChatId, groupId ?? undefined);
                                  const approvalCol = (board?.columns || []).find((c) => String(c.name) === 'Approval');
                                  if (approvalCol) {
                                    await moveTask(t.id, approvalCol.id, 0);
                                    patchItem(t.id, { phase: 'Approval', status: 'Согласование' } as any);
                                  }
                                } catch {}
                                finally {
                                  setOpenQBar(null);
                                }
                                return false;
                              }
                            }}
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
                            transition: 'box-shadow 140ms ease, border-color 140ms ease, margin-top 140ms ease, transform 160ms ease',
                            position: 'relative',
                            transform: (pg.key === 'all' && swipeUi.id === (t as any).id) ? `translateX(${Math.min(swipeUi.dx, 180)}px)` : 'translateX(0px)',
                          }}
                          onClick={() => {
                            const sup = suppressClickRef.current;
                            if (sup && sup.id === (t as any).id && sup.until > Date.now()) {
                              suppressClickRef.current = null;
                              return;
                            }
                            if (!(openQBar?.id === t.id && openQBar?.page === pg.key)) {
                              onOpenTask(t.id);
                              try {
                                WebApp?.HapticFeedback?.impactOccurred?.('light');
                              } catch {}
                            }
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (pg.key === 'all') beginSwipe(t.id, e.clientX, e.clientY);
                          }}
                          onMouseMove={(e) => { if (pg.key === 'all') moveSwipe(e as any, t.id); }}
                          onMouseUp={() => { cancelLongPress(); if (pg.key === 'all') endSwipe(t.id, { text: (t as any).text, groupId }); else endSwipe(); }}
                          onMouseLeave={() => { cancelLongPress(); if (pg.key === 'all') endSwipe(); }}
                          onTouchStart={(e) => {
                            try {
                              const touch = (e.touches && e.touches[0]) || (e as any).touches?.[0];
                              if (pg.key === 'all' && touch) beginSwipe(t.id, touch.clientX, touch.clientY);
                            } catch {}
                          }}
                          onTouchMove={(e) => { if (pg.key === 'all') moveSwipe(e as any, t.id); }}
                          onTouchEnd={() => { cancelLongPress(); if (pg.key === 'all') endSwipe(t.id, { text: (t as any).text, groupId }); else endSwipe(); }}
                          onTouchCancel={() => { cancelLongPress(); if (pg.key === 'all') endSwipe(); }}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                        >
                          {/* Edge pre-task badge on task card */}
                          {pg.key === 'all' ? (
                            (() => {
                              const preCountForTask = __preSorted.filter(p => Array.isArray((p as any).links) && (p as any).links.some((l:any) => String(l.taskId||'') === String((t as any).id))).length;
                              return (
                                <div style={{ position:'absolute', right: 0, top: 0, bottom: 0 }}>
                                  <EdgePreTaskBadge
                                    kind="task"
                                    count={preCountForTask}
                                    onClick={() => {
                                      if (preCountForTask > 0) setManageForTask({ id: (t as any).id });
                                      else {
                                        try {
                                          window.dispatchEvent(new CustomEvent('edge-pre-open', { detail: { taskId: (t as any).id, text: (t as any).text, groupId } }));
                                        } catch {}
                                      }
                                    }}
                                  />
                                </div>
                              );
                            })()
                          ) : null}
                          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4, display:'flex', alignItems:'center', gap:6 }}>
                            {typeof (t as any).bountyStars === 'number' && (t as any).bountyStars > 0 ? (
                              <StarBadge amount={(t as any).bountyStars} status={(t as any).bountyStatus} />
                            ) : null}
                            <span>#{t.id.slice(0, 6)}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'start', gap: 8, marginBottom: 6 }}>
<div style={{ fontSize: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
  {isEvent ? '📅 ' : ''}
  {(t as any).fromProcess ? '🔀 ' : ''}   {/* ← добавили */}
  {(t as any).text}
</div>
                            {badge && (
                              <span
                                title={badge.text}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenQBar({ id: t.id, page: pg.key as PageKey }); try { WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch {} }}
                                style={{
                                  background: badge.bg,
                                  color: badge.fg,
                                  border: `1px solid ${badge.brd}`,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: 12,
                                  whiteSpace: 'nowrap',
                                  cursor: 'pointer',
                                }}
                              >
                                {badge.text}
                              </span>
                            )}
                          </div>

                    {dateLine && (
                      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{dateLine}</div>
                    )}
                          {deadlineAt && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeadlineEdit({ id: t.id, value: deadlineAt }); }}
                              title="Изменить дедлайн"
                              style={{ fontSize: 12, marginBottom: 6, color: new Date(deadlineAt).getTime() < Date.now() ? '#b91c1c' : '#1f2937', background:'transparent', border:'none', padding:0, textAlign:'left', cursor:'pointer' }}
                            >
                              🚩 {fmtShort(deadlineAt)} • {leftText}
                            </button>
                          )}
                          {nextReminderAt && (
                            <div style={{ fontSize: 12, marginBottom: 6, color: '#374151' }}>
                              ⏰ {fmtShort(nextReminderAt)}
                            </div>
                          )}
                          {deadlineAt && new Date(deadlineAt).getTime() < Date.now() && (
                            <span style={{ fontSize: 11, background:'#7f1d1d', color:'#fee2e2', border:'1px solid #dc2626', borderRadius:999, padding:'2px 6px', marginBottom:6 }}>
                              ⚠️ Просрочен
                            </span>
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
                            {((t as any).isTelegramGroup ? '➡️ ' : '')}{(t as any).groupTitle}
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
                            {(t as any).assigneeName ? (
                              <span>👤 {(t as any).assigneeName}</span>
                            ) : null}
                            {needsPhoto ? <span title="Требуется фото">☝️📸</span> : null}
                            <span style={{ marginLeft: 'auto' }}>
                              {new Date((t as any).updatedAt).toLocaleString()}
                            </span>
                          </div>

                          {/* Внутри карточки: Полоска «Запустят после (N) ⬇/⬆» */}
                          {(() => {
                            const id = (t as any).id as string;
                            const linked = preTasks.filter(p => Array.isArray((p as any).links) && (p as any).links.some((l:any) => String(l.taskId||'') === String(id)));
                            const count = linked.length;
                            if (count <= 0) return null;
                            const key = `T:${id}`;
                            const isOpen = !!openAfter[key];
                            return (
                              <div style={{ marginTop: 6 }}>
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenAfter(prev => ({ ...prev, [key]: !isOpen })); }}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '6px 10px',
                                    borderRadius: 10,
                                    border: '1px solid #d1e7dd',
                                    background: '#ecfdf5',
                                    color: '#065f46',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                  }}
                                  title={isOpen ? 'Свернуть список предзадач' : 'Показать предзадачи'}
                                >
                                  Запустят после ({count}) {isOpen ? '⬆' : '⬇'}
                                </button>
                              </div>
                            );
                          })()}
                        </button>
                      </div>
                      {/* Вне карточки: список предзадач под карточкой */}
                      {(() => {
                        const id = (t as any).id as string;
                        const key = `T:${id}`;
                        const isOpen = !!openAfter[key];
                        if (!isOpen) return null;
                        const linked = preTasks.filter(p => Array.isArray((p as any).links) && (p as any).links.some((l:any) => String(l.taskId||'') === String(id)));
                        if (!linked.length) return null;
                        return (
                          <div style={{ marginTop: 6, display: 'grid', gap: 8 }}>
                            {linked.map((p) => (
                              <div key={(p as any).id} style={{ position:'relative' }}>
                                {pg.key==='all' && preSwipeUi.id === (p as any).id ? (
                                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'flex-start', paddingLeft:20, pointerEvents:'none', zIndex:0 }}>
                                    <span style={{ display:'inline-block', padding:'4px 10px', borderRadius:999, border:'1px solid #c7f3d1', background:'#e7fbe9', color:'#0f5132', fontSize:12, opacity: Math.min(1, preSwipeUi.dx / SWIPE_REVEAL), boxShadow:'0 2px 6px rgba(0,0,0,.06)' }}>Запустить после</span>
                                  </div>
                                ) : null}
                                <div
                                  style={{ position:'relative', transition:'transform 160ms ease', transform: (pg.key==='all' && preSwipeUi.id === (p as any).id) ? `translateX(${Math.min(preSwipeUi.dx, 180)}px)` : 'translateX(0px)' }}
                                  onMouseDown={(e) => { if (pg.key==='all') beginPreSwipe((p as any).id, e.clientX, e.clientY); }}
                                  onMouseMove={(e) => { if (pg.key==='all') movePreSwipe(e as any, (p as any).id); }}
                                  onMouseUp={() => { if (pg.key==='all') endPreSwipe((p as any).id, { text: (p as any).text, groupId: (p as any).groupId ?? null }); }}
                                  onMouseLeave={() => { if (pg.key==='all') endPreSwipe(); }}
                                  onTouchStart={(e) => { try { const t = (e.touches && e.touches[0]) || (e as any).touches?.[0]; if (pg.key==='all' && t) beginPreSwipe((p as any).id, t.clientX, t.clientY); } catch {} }}
                                  onTouchMove={(e) => { if (pg.key==='all') movePreSwipe(e as any, (p as any).id); }}
                                  onTouchEnd={() => { if (pg.key==='all') endPreSwipe((p as any).id, { text: (p as any).text, groupId: (p as any).groupId ?? null }); }}
                                  onTouchCancel={() => { if (pg.key==='all') endPreSwipe(); }}
                                >
                                  {(() => {
                                    const key = `P:${String((p as any).id)}`;
                                    const children = preTasks.filter(x => String((x as any).id) !== String((p as any).id) && Array.isArray((x as any).links) && (x as any).links.some((l:any) => String((l as any).depPreTaskId || (l as any).preTaskId || '') === String((p as any).id)));
                                    const cnt = children.length;
                                    const footer = cnt ? (
                                      <button onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setOpenAfter(prev => ({ ...prev, [key]: !(prev[key]) })); }} style={{ width:'100%', textAlign:'left', padding:'6px 10px', borderRadius:10, border:'1px solid #d1e7dd', background:'#ecfdf5', color:'#065f46', fontSize:12, cursor:'pointer' }}>Запустят после ({cnt}) {openAfter[key] ? '⬆' : '⬇'}</button>
                                    ) : null;
                                    return (
                                      <PreTaskCard
                                        p={p as any}
                                        onOpen={(pp) => setOpenPreTask(pp)}
                                        onEdit={(pp) => setEditPreTask(pp)}
                                        nameByChat={nameByChat}
                                        groupTitle={(p as any).groupId ? (groupTitleById[String((p as any).groupId)] || null) : 'Моя группа'}
                                        tone="subtle"
                                        footer={footer}
                                        emphasis={cnt>0}
                                      />
                                    );
                                  })()}
                                </div>
                                {(() => {
                                  const key = `P:${String((p as any).id)}`;
                                  if (!openAfter[key]) return null;
                                  const children = preTasks.filter(x => String((x as any).id) !== String((p as any).id) && Array.isArray((x as any).links) && (x as any).links.some((l:any) => String((l as any).depPreTaskId || (l as any).preTaskId || '') === String((p as any).id)));
                                  if (!children.length) return null;
                                  return (
                                    <div style={{ marginTop:6, display:'grid', gap:8 }}>
                                      {children.map((cp:any) => (
                                        <div key={`plink-child-${cp.id}`} style={{ position:'relative' }}>
                                          {pg.key==='all' && preSwipeUi.id === String(cp.id) ? (
                                            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'flex-start', paddingLeft:20, pointerEvents:'none', zIndex:0 }}>
                                              <span style={{ display:'inline-block', padding:'4px 10px', borderRadius:999, border:'1px solid #c7f3d1', background:'#e7fbe9', color:'#0f5132', fontSize:12, opacity: Math.min(1, preSwipeUi.dx / SWIPE_REVEAL), boxShadow:'0 2px 6px rgba(0,0,0,.06)' }}>Запустить после</span>
                                            </div>
                                          ) : null}
                                          <div
                                            style={{ position:'relative', transition:'transform 160ms ease', transform: (pg.key==='all' && preSwipeUi.id === String(cp.id)) ? `translateX(${Math.min(preSwipeUi.dx, 180)}px)` : 'translateX(0px)' }}
                                            onMouseDown={(e) => { if (pg.key==='all') beginPreSwipe(String(cp.id), e.clientX, e.clientY); }}
                                            onMouseMove={(e) => { if (pg.key==='all') movePreSwipe(e as any, String(cp.id)); }}
                                            onMouseUp={() => { if (pg.key==='all') endPreSwipe(String(cp.id), { text: String((cp as any).text || ''), groupId: (cp as any).groupId ?? null }); }}
                                            onMouseLeave={() => { if (pg.key==='all') endPreSwipe(); }}
                                            onTouchStart={(e) => { try { const t = (e.touches && e.touches[0]) || (e as any).touches?.[0]; if (pg.key==='all' && t) beginPreSwipe(String(cp.id), t.clientX, t.clientY); } catch {} }}
                                            onTouchMove={(e) => { if (pg.key==='all') movePreSwipe(e as any, String(cp.id)); }}
                                            onTouchEnd={() => { if (pg.key==='all') endPreSwipe(String(cp.id), { text: String((cp as any).text || ''), groupId: (cp as any).groupId ?? null }); }}
                                            onTouchCancel={() => { if (pg.key==='all') endPreSwipe(); }}
                                          >
                                            {(() => {
                                              const childKey = `P:${String(cp.id)}`;
                                              const grand = preTasks.filter(x => String((x as any).id) !== String(cp.id) && Array.isArray((x as any).links) && (x as any).links.some((l:any) => String((l as any).depPreTaskId || (l as any).preTaskId || '') === String(cp.id)));
                                              const cnt2 = grand.length;
                                              const foot2 = cnt2 ? (
                                                <button onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setOpenAfter(prev => ({ ...prev, [childKey]: !(prev[childKey]) })); }} style={{ width:'100%', textAlign:'left', padding:'6px 10px', borderRadius:10, border:'1px solid #d1e7dd', background:'#ecfdf5', color:'#065f46', fontSize:12, cursor:'pointer' }}>Запустят после ({cnt2}) {openAfter[childKey] ? '⬆' : '⬇'}</button>
                                              ) : null;
                                              return (
                                                <PreTaskCard p={cp} onOpen={(pp)=>setOpenPreTask(pp)} onEdit={(pp)=>setEditPreTask(pp)} nameByChat={nameByChat} groupTitle={(cp as any).groupId ? (groupTitleById[String((cp as any).groupId)] || null) : 'Моя группа'} tone="subtle" footer={foot2} emphasis={cnt2>0} />
                                              );
                                            })()}
                                          </div>
                                          {(() => {
                                            const childKey = `P:${String(cp.id)}`;
                                            if (!openAfter[childKey]) return null;
                                            const grand = preTasks.filter(x => String((x as any).id) !== String(cp.id) && Array.isArray((x as any).links) && (x as any).links.some((l:any) => String((l as any).depPreTaskId || (l as any).preTaskId || '') === String(cp.id)));
                                            if (!grand.length) return null;
                                            return (
                                              <div style={{ marginTop:6, display:'grid', gap:8 }}>
                                                {grand.map((gg:any) => (
                                                  <div key={`plink-gchild-${gg.id}`} style={{ position:'relative' }}>
                                                    <PreTaskCard p={gg} onOpen={(pp)=>setOpenPreTask(pp)} onEdit={(pp)=>setEditPreTask(pp)} nameByChat={nameByChat} groupTitle={(gg as any).groupId ? (groupTitleById[String((gg as any).groupId)] || null) : 'Моя группа'} tone="subtle" />
                                                  </div>
                                                ))}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      </>
                    );
                  })
                ) : (
                  <div style={{ opacity: 0.6, padding: '12px' }}>Нет задач</div>
                )}
                {pg.key === 'all' && __preIdx < __preSorted.length && (
                  __preSorted.slice(__preIdx).map((p) => (
                    <div key={`pre-tail-${p.id}`} style={{ position:'relative' }}>
                      {/* Подложка для свайпа */}
                      {preSwipeUi.id === p.id ? (
                        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'flex-start', paddingLeft:20, pointerEvents:'none', zIndex:0 }}>
                          <span style={{ display:'inline-block', padding:'4px 10px', borderRadius:999, border:'1px solid #c7f3d1', background:'#e7fbe9', color:'#0f5132', fontSize:12, opacity: Math.min(1, preSwipeUi.dx / SWIPE_REVEAL), boxShadow:'0 2px 6px rgba(0,0,0,.06)' }}>Запустить после</span>
                        </div>
                      ) : null}
                      <div
                        style={{ margin: '0 12px', position:'relative', transition:'transform 160ms ease', transform: (preSwipeUi.id === p.id) ? `translateX(${Math.min(preSwipeUi.dx, 180)}px)` : 'translateX(0px)' }}
                        onMouseDown={(e) => beginPreSwipe(p.id, e.clientX, e.clientY)}
                        onMouseMove={(e) => movePreSwipe(e as any, p.id)}
                        onMouseUp={() => endPreSwipe(p.id, { text: (p as any).text, groupId: (p as any).groupId ?? null })}
                        onMouseLeave={() => endPreSwipe()}
                        onTouchStart={(e) => { try { const t = (e.touches && e.touches[0]) || (e as any).touches?.[0]; if (t) beginPreSwipe(p.id, t.clientX, t.clientY); } catch {} }}
                        onTouchMove={(e) => movePreSwipe(e as any, p.id)}
                        onTouchEnd={() => endPreSwipe(p.id, { text: (p as any).text, groupId: (p as any).groupId ?? null })}
                        onTouchCancel={() => endPreSwipe()}
                      >
                        {(() => {
                          const key = `P:${p.id}`;
                          const children = __preSorted.filter((x:any) => String(x.id) !== String(p.id) && Array.isArray((x as any).links) && (x as any).links.some((l:any) => String((l as any).depPreTaskId || (l as any).preTaskId || '') === String(p.id)));
                          const cnt = children.length;
                          const footer = cnt ? (
                            <button onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setOpenAfter(prev => ({ ...prev, [key]: !(prev[key]) })); }} style={{ width:'100%', textAlign:'left', padding:'6px 10px', borderRadius:10, border:'1px solid #d1e7dd', background:'#ecfdf5', color:'#065f46', fontSize:12, cursor:'pointer' }}>Запустят после ({cnt}) {openAfter[key] ? '⬆' : '⬇'}</button>
                          ) : null;
                          return (
                            <PreTaskCard p={p} onOpen={(pp) => setOpenPreTask(pp)} onEdit={(pp)=>setEditPreTask(pp)} nameByChat={nameByChat} groupTitle={p.groupId ? (groupTitleById[String(p.groupId)] || null) : 'Моя группа'} footer={footer} />
                          );
                        })()}
                      </div>
                      {(() => {
                        const key = `P:${p.id}`;
                        if (!openAfter[key]) return null;
                        const children = __preSorted.filter((x:any) => String(x.id) !== String(p.id) && Array.isArray((x as any).links) && (x as any).links.some((l:any) => String((l as any).depPreTaskId || (l as any).preTaskId || '') === String(p.id)));
                        if (!children.length) return null;
                        return (
                          <div style={{ margin:'6px 12px 0', display:'grid', gap:8 }}>
                            {children.map((cp:any) => (
                              <div key={`ptail-child-${cp.id}`}>
                                <PreTaskCard p={cp} onOpen={(pp)=>setOpenPreTask(pp)} onEdit={(pp)=>setEditPreTask(pp)} nameByChat={nameByChat} groupTitle={(cp as any).groupId ? (groupTitleById[String((cp as any).groupId)] || null) : 'Моя группа'} tone="subtle" />
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  ))
                )}
              </div>
                );
              })()}
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

      {/* 📁 фильтр по группе (скрыть, если открыт CreateTask) */}
      {!isCreateTaskOpen && (
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
      )}

      {/* 🏷️ появляется над 📁 только для группы и после клика по названию группы */}
      {scope.kind === 'group' && showLabelFab && !isCreateTaskOpen && (
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
      {/* Завершение с фото */}
      {completePrompt && (
        <div
          onClick={() => setCompletePrompt(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}
        >
          <div onClick={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(480px, 92vw)' }}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Чтобы завершить задачу, прикрепите фото</div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button
                disabled={uploadBusy}
                onClick={() => fileInputRef.current?.click()}
                style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: uploadBusy ? 0.6 : 1 }}
              >🖼️ Выбрать</button>
              <button
                disabled={uploadBusy}
                onClick={() => setCameraOpen(true)}
                style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: uploadBusy ? 0.6 : 1 }}
              >📸 Камера</button>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file || !completePrompt) return;
                try {
                  setUploadBusy(true);
                  const up = await uploadTaskMedia(completePrompt.id, chatId, file);
                  if ((up as any)?.ok && (up as any)?.media?.url) {
                    await addComment(completePrompt.id, chatId, (up as any).media.url);
                  }
                  await completeTask(completePrompt.id);
                  patchItem(completePrompt.id, { status: 'Готово', phase: 'Done' } as any);
                  setCompletePrompt(null);
                } catch {}
                finally { setUploadBusy(false); }
              }} />
              <div style={{ fontSize: 12, opacity: 0.85 }}>{uploadBusy ? 'Загружаю фото…' : ''}</div>
              <button
                disabled={uploadBusy}
                onClick={() => setCompletePrompt(null)}
                style={{ marginLeft:'auto', padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: uploadBusy ? 0.6 : 1 }}
              >Отмена</button>
            </div>
          </div>
        </div>
      )}

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={async (file) => {
          if (!completePrompt) return;
          try {
            setUploadBusy(true);
            const up = await uploadTaskMedia(completePrompt.id, chatId, file);
            if ((up as any)?.ok && (up as any)?.media?.url) {
              await addComment(completePrompt.id, chatId, (up as any).media.url);
            }
            await completeTask(completePrompt.id);
            patchItem(completePrompt.id, { status: 'Готово', phase: 'Done' } as any);
            setCameraOpen(false);
            setCompletePrompt(null);
          } catch {}
          finally { setUploadBusy(false); }
        }}
      />

      {payoutPrompt && (
        <PayoutPromptModal
          open={true}
          taskId={payoutPrompt.id}
          amountRub={payoutPrompt.rub}
          chatId={chatId}
          onPaid={() => {
            setItems((prev) => prev.map((it) => (it.id === payoutPrompt.id ? ({ ...it, bountyStatus: 'PAID' } as any) : it)));
            setPayoutPrompt(null);
          }}
        />
      )}
      {/* 🚩 Пикер дедлайна для карточек в ленте */}
      <DeadlinePicker
        open={!!deadlineEdit}
        value={deadlineEdit?.value ?? null}
        onClose={() => setDeadlineEdit(null)}
        onChange={async (iso) => {
          const id = deadlineEdit?.id;
          if (!id) return;
          try {
            const res = await fetch(`${API_BASE}/tasks/${encodeURIComponent(id)}/deadline`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, deadlineAt: iso }),
            });
            const j = await res.json();
            if ((j as any)?.ok) {
              patchItem(id, { deadlineAt: (j as any).task?.deadlineAt || null } as any);
            }
          } catch {}
        }}
      />

      <PreTaskPreviewModal open={!!openPreTask} preTask={openPreTask} onClose={() => setOpenPreTask(null)} nameByChat={nameByChat} />
      <PreTaskEditModal open={!!editPreTask} chatId={chatId} preTask={editPreTask} onClose={()=>setEditPreTask(null)} onSaved={async ()=>{ try { const pr = await listPreTasks({ chatId, status: ['PREVIEW','ARMED'] }); if (pr?.ok) setPreTasks(pr.preTasks || []); } catch {} }} />
      <TaskPreTaskLinkManager
        open={!!manageForTask}
        chatId={chatId}
        taskId={manageForTask?.id || ''}
        onClose={()=>setManageForTask(null)}
        onAdd={()=>{
          const t = filteredItems.find((x:any)=>x.id===manageForTask?.id);
          const groupId = (()=>{ const cn = (t as any)?.column?.name || ''; const i = cn.indexOf('::'); return i>0? cn.slice(0,i): null })();
          try { window.dispatchEvent(new CustomEvent('edge-pre-open', { detail: { taskId: manageForTask?.id, text: (t as any)?.text || '', groupId } })); } catch {}
          setManageForTask(null);
        }}
        onChanged={async()=>{ try { const pr = await listPreTasks({ chatId, status: ['PREVIEW','ARMED'] }); if (pr?.ok) setPreTasks(pr.preTasks || []); } catch {} }}
      />

    </div>
  );
}
