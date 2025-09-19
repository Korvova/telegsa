//App.tsx

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import BottomNav, { type TabKey } from './BottomNav';
import GroupEdit from './components/GroupEdit';
import WriteAccessGate from './WriteAccessGate';

import GroupMembers from './components/GroupMembers';
import NotificationsView from './NotificationsView';

import GroupProcessPage from './pages/Groups/GroupProcessPage';

import CreateTaskFab from './components/CreateTaskFab';

import CalendarView from './CalendarView';

import TaskView from './TaskView';

import HomePage from './pages/Home/HomePage';
import DeadlinePicker from './components/DeadlinePicker';
import CameraCaptureModal from './components/CameraCaptureModal';

import {
  fetchBoard,
  type Column,
  moveTask as apiMoveTask,
  renameColumn,
  type Group,
  listGroups,
  upsertMe,
  setTaskDeadline,
  uploadTaskMedia,
  addComment,
  completeTask,
} from './api';

import {
  DndContext,
  DragOverlay,
  closestCorners,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';

import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import GroupList from './pages/Groups/GroupList';
import GroupTabs from './components/GroupTabs';
import SettingsStars from './SettingsStars';
import SettingsRank from './components/SettingsRank';
import SettingsProfile from './components/SettingsProfile';
import { useMyRankIcon } from './hooks/useMyRankIcon';

/* ---------------- helpers ---------------- */
function useChatId() {
  return useMemo(() => {
    const sdkChatId =
      WebApp?.initDataUnsafe?.user?.id
        ? String(WebApp.initDataUnsafe.user.id)
        : undefined;

    const urlChatId =
      new URLSearchParams(window.location.search).get('from') || undefined;

    // ✅ СНАЧАЛА SDK, потом из URL
    const id = sdkChatId || urlChatId || '';
    console.log('[APP] useChatId ->', id, { sdkChatId, urlChatId });
    return id;
  }, []);
}

function getTaskIdFromURL() {
  return new URLSearchParams(window.location.search).get('task') || '';
}

/** Парсер start_param для инвайтов assign/join в компактном и полном виде */

// заменить parseStartParam на:
function parseStartParam(sp: string) {
  if (!sp) return null as null | { type: 'assign' | 'join' | 'event' | 'task' | 'newtask' | 'watch'; id: string; token?: string };

  // 1) Полный вид
  let m = sp.match(/^(assign|join|event|newtask|watch)__([a-z0-9]+)__([-A-Za-z0-9_]{10,})$/i);
  if (m) return { type: m[1] as any, id: m[2], token: m[3] };

  // 2) task_<id>
  m = sp.match(/^task_([a-z0-9]+)$/i);
  if (m) return { type: 'task', id: m[1] };

  // 3) Компактный assign/join/event/newtask
  const head = sp.startsWith('assign')
    ? 'assign'
    : sp.startsWith('join')
    ? 'join'
    : sp.startsWith('event')
    ? 'event'
    : sp.startsWith('newtask')
    ? 'newtask'
    : sp.startsWith('watch')
    ? 'watch'
    : null;
  if (!head) return null;

  const rest = sp.slice(head.length);
  const TOKEN_LEN = 22; // base64url(16)
  if (rest.length <= TOKEN_LEN) return null;
  const token = rest.slice(-TOKEN_LEN);
  const id = rest.slice(0, -TOKEN_LEN);
  if (!id) return null;
  return { type: head as any, id, token };
}

/* ---------------- UI bits ---------------- */
function TaskCard({
  text, order, assigneeName, assigneeChatId, meChatId, myRankIcon, active, dragging, onClick,
  isEvent, startAt, endAt, fromProcess,
  deadlineAt,
  acceptCondition,
  bountyStars,
  bountyStatus,
  onEditDeadline,
}: {
  text: string;
  order: number;
  assigneeName?: string | null;
  assigneeChatId?: string | null;
  meChatId?: string;
  myRankIcon?: string | null;
  active?: boolean;
  dragging?: boolean;
  onClick?: () => void;
  isEvent?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  fromProcess?: boolean;
  deadlineAt?: string | null;
  bountyStars?: number | null;
  bountyStatus?: 'NONE'|'PLEDGED'|'PAID'|'REFUNDED'|string;
  acceptCondition?: 'NONE' | 'PHOTO' | 'APPROVAL';
  onEditDeadline?: () => void;
}) {
  const bg = dragging ? '#0e1629' : active ? '#151b2b' : '#121722';
  const dateLine = isEvent && startAt
    ? `${fmtShort(startAt)}–${fmtShort(endAt || startAt)}`
    : null;
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

  return (
    <div onClick={onClick} style={{
      background: bg, border: '1px solid #2a3346', borderRadius: 12, padding: 12,
      userSelect: 'none', cursor: 'pointer', boxShadow: dragging ? '0 6px 18px rgba(0,0,0,.35)' : 'none',
    }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4, display:'flex', alignItems:'center', gap:6 }}>
        {typeof bountyStars === 'number' && bountyStars > 0 ? (
          <span title={String(bountyStatus)==='PAID' ? 'Выплачено' : 'Ожидает выплаты'} style={{ display:'inline-block', border:`1px solid ${String(bountyStatus)==='PAID' ? '#374151':'#6a4a20'}`, background:String(bountyStatus)==='PAID' ? '#1f2937':'#3a2a10', color:String(bountyStatus)==='PAID' ? '#9ca3af':'#facc15', borderRadius:999, padding:'0 6px', lineHeight:'16px', fontSize:12 }}>
            {String(bountyStatus)==='PAID' ? '💫' : '💰'} ({bountyStars})
          </span>
        ) : null}
        <span>#{order}</span>
      </div>

      <div
        style={{
          fontSize: 15,
          marginBottom: 6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {isEvent ? '📅 ' : ''}{fromProcess ? '🔀 ' : ''}{text}
      </div>

      {dateLine && (
        <div style={{ fontSize: 12, opacity: .75, marginBottom: 6 }}>{dateLine}</div>
      )}
      {deadlineAt && (
        <button
          onClick={(e) => { e.stopPropagation(); onEditDeadline && onEditDeadline(); }}
          title="Изменить дедлайн"
          style={{ fontSize: 12, marginBottom: 6, color: new Date(deadlineAt).getTime() < Date.now() ? '#fecaca' : '#93c5fd', background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
        >
          🚩 {fmtShort(deadlineAt)} • {leftText}
        </button>
      )}
      {deadlineAt && new Date(deadlineAt).getTime() < Date.now() && (
        <div style={{ fontSize: 11, marginBottom: 6 }}>
          <span style={{ background:'#7f1d1d', color:'#fee2e2', border:'1px solid #dc2626', borderRadius:999, padding:'2px 6px' }}>⚠️ Просрочен</span>
        </div>
      )}
      {acceptCondition === 'PHOTO' && (
        <div style={{ fontSize: 12, marginBottom: 6 }} title="Требуется фото">
          ☝️📸 Требуется фото
        </div>
      )}
      {acceptCondition === 'APPROVAL' && (
        <div style={{ fontSize: 12, marginBottom: 6 }} title="Требуется согласование">
          ☝️🤝 Требуется согласование
        </div>
      )}
      {typeof bountyStars === 'number' && bountyStars > 0 && (
        <div style={{ fontSize: 12, marginBottom: 6 }} title={String(bountyStatus) === 'PAID' ? 'Выплачено' : 'Ожидает выплаты'}>
          <span style={{
            display:'inline-block', border:`1px solid ${String(bountyStatus)==='PAID' ? '#374151':'#6a4a20'}`, background:String(bountyStatus)==='PAID' ? '#1f2937':'#3a2a10', color:String(bountyStatus)==='PAID' ? '#9ca3af':'#facc15', borderRadius:999, padding:'2px 8px'
          }}>⭐ ({bountyStars})</span>
        </div>
      )}
      {assigneeName && !isEvent ? (
        <div style={{ fontSize: 12, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>👤</span>
          <span>
            {String(assigneeChatId || '') === String(meChatId || '') && myRankIcon
              ? `${myRankIcon} ${assigneeName}`
              : assigneeName}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function fmtShort(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${dd}.${mm} ${hh}:${mi}`;
}

function SortableTask({
  taskId, text, order, assigneeName, assigneeChatId, meChatId, myRankIcon, onOpenTask, armed, isEvent, startAt, endAt, fromProcess, deadlineAt,
  onEditDeadline,
  acceptCondition,
  bountyStars,
  bountyStatus,
}: {
  taskId: string;
  text: string;
  order: number;
  assigneeName?: string | null;
  assigneeChatId?: string | null;
  meChatId?: string;
  myRankIcon?: string | null;
  onOpenTask: (id: string) => void;
  armed?: boolean;
  isEvent?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  fromProcess?: boolean;
  deadlineAt?: string | null;
  onEditDeadline?: () => void;
  acceptCondition?: 'NONE' | 'PHOTO' | 'APPROVAL';
  bountyStars?: number | null;
  bountyStatus?: 'NONE'|'PLEDGED'|'PAID'|'REFUNDED'|string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: taskId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: armed || isDragging ? 'none' : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard
        text={text}
        order={order}
        assigneeName={assigneeName}
        assigneeChatId={assigneeChatId}
        meChatId={meChatId}
        myRankIcon={myRankIcon}
        active={armed}
        dragging={isDragging}
        onClick={() => onOpenTask(taskId)}
        isEvent={isEvent}
        startAt={startAt}
        endAt={endAt}
        fromProcess={fromProcess}
        deadlineAt={deadlineAt}
        onEditDeadline={onEditDeadline}
        acceptCondition={acceptCondition}
        bountyStars={bountyStars}
        bountyStatus={bountyStatus}
      />
    </div>
  );
}

/* Заглушка для неготовых вкладок */
function TabPlaceholder({ tab }: { tab: TabKey }) {
  const map = {
    calendar: 'Календарь скоро подключим — события из задач и напоминания ⏰',
    notifications: 'Уведомления: настройка подписок и история событий',
    settings: 'Настройки: профиль, язык, тема, донат',
  } as const;

  return (
    <div
      style={{
        padding: 16,
        background: '#1b2030',
        border: '1px solid #2a3346',
        borderRadius: 16,
        minHeight: 240,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <div style={{ opacity: 0.85, lineHeight: 1.6 }}>
        {tab === 'calendar' ? map.calendar : tab === 'notifications' ? map.notifications : map.settings}
      </div>
    </div>
  );
}

/* ---------------- App ---------------- */
export default function App() {
  const [selectedGroupMineOnly, setSelectedGroupMineOnly] = useState<boolean>(false);
  const [showProcess, setShowProcess] = useState(false);

  const chatId = useChatId();
  const myRankIcon = useMyRankIcon(chatId);
  // Ключ для перезагрузки ленты на Home после создания задачи
  const [feedReloadKey, setFeedReloadKey] = useState(0);
  const [taskId, setTaskId] = useState<string>(getTaskIdFromURL());
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<Column[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deadlineEdit, setDeadlineEdit] = useState<{ taskId: string; value: string | null } | null>(null);
  const [acceptPrompt, setAcceptPrompt] = useState<{ id: string } | null>(null);
  const acceptFileRef = useRef<HTMLInputElement | null>(null);
  const [acceptCamOpen, setAcceptCamOpen] = useState(false);
  const [acceptUploadBusy, setAcceptUploadBusy] = useState(false);



const [spawnNextForFocus, setSpawnNextForFocus] = useState<boolean>(false);

const [persistSeedSession, setPersistSeedSession] = useState(false);




// добавь СРАЗУ ПОСЛЕ:
const [spawnPrevForFocus, setSpawnPrevForFocus] = useState<boolean>(false);
const [seedPrevForProcess, setSeedPrevForProcess] = useState<boolean>(false);


  const [tab, setTab] = useState<TabKey>('home');

  const [groupTab, setGroupTab] = useState<'kanban' | 'process' | 'members'>('kanban');
  const [seedTaskIdForProcess, setSeedTaskIdForProcess] = useState<string | null>(null);
  const [seedAssigneeChatIdForProcess, setSeedAssigneeChatIdForProcess] = useState<string | null>(null);
  const [focusTaskIdForProcess, setFocusTaskIdForProcess] = useState<string | null>(null);

  // 👇 НОВОЕ: куда вернуться после полотна
  const [returnTaskIdForProcess, setReturnTaskIdForProcess] = useState<string | null>(null);

  // listen to open-process requests from TaskView
  useEffect(() => {
    const handler = (e: any) => {
      const d = (e && (e as CustomEvent).detail) || {};
      if (!d || !d.groupId) return;
      setTab('groups');
      setSelectedGroupId(String(d.groupId));
      setGroupTab('process');



// право: поддерживаем и старый d.seedNewRight, и явный d.spawnNextForFocus
setSpawnNextForFocus(Boolean(d.seedNewRight || d.spawnNextForFocus));

// лево: новый флаг
setSpawnPrevForFocus(Boolean(d.spawnPrevForFocus));

// сеанс посева активен, если пришёл seedTaskId
setPersistSeedSession(!!d.seedTaskId);

// посев слева (мини-связка «Новый ← Текущая»)
setSeedPrevForProcess(Boolean(d.seedPrev));






      // из TaskView либо фокус на конкретный узел, либо посев
      if (d.focusTaskId) {
        setFocusTaskIdForProcess(String(d.focusTaskId));
        setSeedTaskIdForProcess(null);
        setSeedAssigneeChatIdForProcess(null);
      } else {
        setFocusTaskIdForProcess(null);
        setSeedTaskIdForProcess(d.seedTaskId || null);
        setSeedAssigneeChatIdForProcess(d.seedAssigneeChatId || null);
      }

      // запоминаем задачу для возврата
      const backId = d.backToTaskId || d.focusTaskId || d.seedTaskId || null;
      setReturnTaskIdForProcess(backId ? String(backId) : null);

      setShowProcess(true);
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'process');
      window.history.pushState({ view: 'process' }, '', url.toString());
      WebApp?.BackButton?.show?.();
    };
    window.addEventListener('open-process', handler as any);
  
    return () => window.removeEventListener('open-process', handler as any);
  }, []);

  const [showGroupEdit, setShowGroupEdit] = useState(false);
  const [groupsPage, setGroupsPage] = useState<'list' | 'detail'>('list');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const prevTotalDxRef = useRef(0);
  const didConsumeStartParamRef = useRef(false);

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } })
  );

  useEffect(() => {
    const handler = (e: any) => {
      const id = e?.detail?.taskId;
      if (id) openTask(String(id));
    };
    window.addEventListener('open-task', handler as any);
    return () => window.removeEventListener('open-task', handler as any);
  }, []);

  useEffect(() => {
    const u = WebApp?.initDataUnsafe?.user;
    if (!u?.id) return;
    fetch(`${import.meta.env.VITE_API_BASE}/me`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: String(u.id),
        firstName: u.first_name ?? null,
        lastName:  u.last_name  ?? null,
        username:  u.username   ?? null,
      }),
    }).catch(() => {});
  }, []);

  // Убираем белые поля по X и делаем края прозрачными (без чёрных боков)
  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.overflowX;
    const prevBody = document.body.style.overflowX;
    const prevHtmlBg = html.style.background;
    const prevBodyBg = document.body.style.background;
    html.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';
    html.style.background = '#0f1216';
    document.body.style.background = '#0f1216';
    return () => {
      html.style.overflowX = prevHtml;
      document.body.style.overflowX = prevBody;
      html.style.background = prevHtmlBg;
      document.body.style.background = prevBodyBg;
    };
  }, []);

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // навигация (taskId из URL)
  useEffect(() => {
    const onPopState = () => setTaskId(getTaskIdFromURL());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // загрузка групп
  useEffect(() => {
    if (!chatId) return;
    listGroups(chatId)
      .then((r) => {
        if (r.ok) {
          console.log('[GROUPS] list ->', r.groups);
          setGroups(r.groups);
          setSelectedGroupId((prev) => prev || r.groups[0]?.id || '');
        }
      })
      .catch((e) => console.error('[GROUPS] list error', e));
  }, [chatId]);

  // системная кнопка назад (Telegram)
  useEffect(() => {
    if (taskId) return; // TaskView сам рулит back
    if ((tab === 'groups' && groupsPage === 'detail') || tab === 'notifications') {
      WebApp?.BackButton?.show?.();
    } else {
      WebApp?.BackButton?.hide?.();
    }
  }, [tab, groupsPage, taskId]);

  const reloadGroups = () => listGroups(chatId).then((r) => { if (r.ok) setGroups(r.groups); });

  const goToGroup = (id: string, mineOnly = false) => {
    setSelectedGroupId(id);
    setSelectedGroupMineOnly(mineOnly);
    setColumns([]);
    setLoading(true);
    setGroupsPage('detail');
    setGroupTab('kanban');
  };

  const backToGroupsList = () => {
    console.log('[NAV] backToGroupsList');
    setGroupsPage('list');
  };

  // выбранная группа
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  // признак владельца
  const isOwnerOfSelected =
    !!selectedGroup &&
    (selectedGroup.kind === 'own' ||
      String((selectedGroup as any).ownerChatId) === String(chatId));

  const resolvedGroupId = selectedGroup
    ? (selectedGroup.title === 'Моя группа' ? undefined : selectedGroup.id)
    : (selectedGroupId || undefined); // временный фолбэк, пока groups не обновились

  // единая загрузка доски
  const loadBoard = useCallback(async () => {
    if (!chatId) return;
    const shouldLoad = tab === 'groups' && groupsPage === 'detail' && groupTab === 'kanban';
    if (!shouldLoad) return;

    setLoading(true);
    try {
      const data = await fetchBoard(chatId, resolvedGroupId, { onlyMine: selectedGroupMineOnly });
      if (!data.ok) throw new Error('API error');
      const cols = data.columns.map((c) => ({ ...c, tasks: [...c.tasks].sort((a,b)=>a.order-b.order) }));
      setColumns(cols);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [chatId, resolvedGroupId, tab, groupsPage, groupTab, selectedGroupMineOnly]);

  // когда taskId очистился (закрыли карточку) — форсим перезагрузку доски
  useEffect(() => {
    if (!taskId) {
      console.log('[TASK] closed → force board reload');
      loadBoard();
    }
  }, [taskId, loadBoard]);

  // начальная и последующая загрузка доски при изменении зависимостей
  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const reloadBoard = useCallback(async () => {
    try {
      const data = await fetchBoard(chatId, resolvedGroupId, { onlyMine: selectedGroupMineOnly });
      if (data.ok) {
        const cols = data.columns.map(c => ({ ...c, tasks: [...c.tasks].sort((a,b)=>a.order-b.order) }));
        setColumns(cols);
      }
    } catch (e) {
      console.error('[BOARD] reload ERROR', e);
    }
  }, [chatId, resolvedGroupId, selectedGroupMineOnly]);

  // обработка start_param
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const spFromUrl = qs.get('tgWebAppStartParam') || '';
    const spFromSdk = WebApp?.initDataUnsafe?.start_param || '';
    const raw = spFromSdk || spFromUrl;
    if (!raw || didConsumeStartParamRef.current) return;
    didConsumeStartParamRef.current = true;

    // 1) Прямой deep link на задачу: task_<ID>
    if (raw.startsWith('task_')) {
      const taskIdFromStart = raw.slice('task_'.length);
      const url = new URL(window.location.href);
      url.searchParams.set('task', taskIdFromStart);
      window.history.replaceState(null, '', url.toString());
      setTaskId(taskIdFromStart);
      return;
    }

    // 2) Инвайты assign/join/event/newtask
    const parsed = parseStartParam(raw);
    console.log('[DEEPLINK] start_param =', raw, { spFromSdk, spFromUrl, parsed });

    const sdkId = WebApp?.initDataUnsafe?.user?.id
      ? String(WebApp.initDataUnsafe.user.id)
      : undefined;
    const me = sdkId || chatId;

    if (!parsed) return;

    if (parsed.type === 'assign') {
      const url = new URL(window.location.href);
      url.searchParams.set('task', parsed.id);
      window.history.replaceState(null, '', url.toString());
      setTaskId(parsed.id);

      fetch(`${import.meta.env.VITE_API_BASE}/invites/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: me, token: parsed.token }),
      }).catch(() => {});
    }

    if (parsed.type === 'watch') {
      const url = new URL(window.location.href);
      url.searchParams.set('task', parsed.id);
      window.history.replaceState(null, '', url.toString());
      setTaskId(parsed.id);

      fetch(`${import.meta.env.VITE_API_BASE}/invites/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: me, token: parsed.token }),
      }).catch(() => {});
    }

    if (parsed.type === 'join') {
      fetch(`${import.meta.env.VITE_API_BASE}/invites/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: me, token: parsed.token }),
      })
        .then(async () => {
          await reloadGroups();
          setSelectedGroupId(parsed.id);
          setGroupsPage('detail');
          await loadBoard();
        })
        .catch(() => {});
    }

    // 🔔 EVENT-инвайт: принять и открыть карточку события
    if (parsed.type === 'event') {
      const url = new URL(window.location.href);
      url.searchParams.set('task', parsed.id);
      window.history.replaceState(null, '', url.toString());
      setTaskId(parsed.id);

      fetch(`${import.meta.env.VITE_API_BASE}/invites/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: me, token: parsed.token }),
      }).catch(() => {});
    }

    // 👇 Новое: “Новая задача по ссылке”
    if (parsed.type === 'newtask') {
      const url = new URL(window.location.href);
      fetch(`${import.meta.env.VITE_API_BASE}/sharenewtask/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: me,
          taskId: parsed.id,
          token: parsed.token,
        }),
      })
        .then((r) => r.json())
        .then((r) => {
          if (r?.ok && r.taskId) {
            url.searchParams.set('task', r.taskId);
            window.history.replaceState(null, '', url.toString());
            setTaskId(r.taskId);
          }
        })
        .catch(() => {});
    }
  }, [chatId, reloadGroups, loadBoard]);

  useEffect(() => {
    const onBack = () => {
      if (showProcess) {
        // фолбэк на taskId, если returnTaskIdForProcess пуст
        const backId = returnTaskIdForProcess || taskId || null;
        setShowProcess(false);
        const url = new URL(window.location.href);
        url.searchParams.delete('view');
        window.history.replaceState(null, '', url.toString());

        if (backId) {
          openTask(backId);
          setReturnTaskIdForProcess(null);
        } else {
          WebApp?.BackButton?.hide?.();
        }
        return;
      }

      if (taskId) return;

      // если мы на экране уведомлений — возвращаемся в Настройки
      if (tab === 'notifications') {
        setTab('settings');
        WebApp?.BackButton?.hide?.();
        return;
      }

      if (tab === 'groups' && groupsPage === 'detail') {
        backToGroupsList();
        return;
      }

      try { WebApp?.close(); } catch {}
    };

    WebApp?.onEvent?.('backButtonClicked', onBack);
    return () => WebApp?.offEvent?.('backButtonClicked', onBack);
  }, [taskId, tab, groupsPage, showProcess, returnTaskIdForProcess]);

  // навигация к задаче
  const openTask = (id: string) => {
    console.log('[TASK] openTask', id);
    const url = new URL(window.location.href);
    url.searchParams.set('task', id);
    window.history.pushState({ task: id }, '', url.toString());
    setTaskId(id);
    WebApp?.BackButton?.show?.();
  };

  // закрыть задачу (и восстановить контекст группы)
  const closeTask = (groupIdFromTask?: string | null) => {
    if (typeof groupIdFromTask !== 'undefined') {
      if (groupIdFromTask) {
        setSelectedGroupId(groupIdFromTask);
        setSelectedGroupMineOnly(false);
      } else {
        const my = groups.find((g) => g.title === 'Моя группа');
        if (my) {
          setSelectedGroupId(my.id);
          setSelectedGroupMineOnly(false);
        }
      }
      setGroupsPage('detail');
    } else {
      setGroupsPage('list');
    }
    WebApp?.BackButton?.hide?.();
    const url = new URL(window.location.href);
    url.searchParams.delete('task');
    window.history.replaceState(null, '', url.toString());
    setTaskId('');
  };

  // поднять WebApp и сохранить профиль
  useEffect(() => {
    WebApp?.ready();
    WebApp?.expand();

    if (!chatId) {
      setError('Не удалось определить chatId. Открой WebApp из кнопки в боте.');
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    const u = WebApp?.initDataUnsafe?.user;
    if (!u?.id) return;
    // сохраним профиль на бэкенде (для показа ФИО всем)
    upsertMe({
      chatId: String(u.id),
      firstName: u.first_name || '',
      lastName: u.last_name || '',
      username: u.username || '',
    }).catch(() => {});
  }, []);

  /* ---- авто-скролл холста при dnd ---- */
  const scrollByX = (dx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + dx));
  };

  const handleDragStart = (evt: DragStartEvent) => {
    setActiveId(String(evt.active.id));
    prevTotalDxRef.current = 0;
    setDragging(true);
    if (scrollerRef.current) scrollerRef.current.style.touchAction = 'none';

    const ev: any = evt.activatorEvent;
    const sx = typeof ev?.clientX === 'number' ? ev.clientX : ev?.touches?.[0]?.clientX ?? 0;
    const sy = typeof ev?.clientY === 'number' ? ev.clientY : ev?.touches?.[0]?.clientY ?? 0;
    startRef.current = { x: sx, y: sy };

    WebApp?.HapticFeedback?.impactOccurred?.('light');
  };

  const handleDragMove = (evt: DragMoveEvent) => {
    if (!startRef.current) return;

    const totalDx = evt.delta?.x ?? 0;
    const frameDx = totalDx - prevTotalDxRef.current;
    prevTotalDxRef.current = totalDx;

    const x = startRef.current.x + totalDx;
    const container = scrollerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const EDGE = 120;
    const leftEdge = rect.left + EDGE;
    const rightEdge = rect.right - EDGE;
    const MAX_SPEED = 2;

    let dx = 0;
    if (x < leftEdge) dx = -Math.min(MAX_SPEED, Math.ceil((leftEdge - x) / 50));
    else if (x > rightEdge) dx = Math.min(MAX_SPEED, Math.ceil((x - rightEdge) / 50));

    const sgnMove = Math.sign(frameDx);
    if ((dx > 0 && sgnMove < 0) || (dx < 0 && sgnMove > 0)) dx = 0;

    if (dx) scrollByX(dx);
  };

  const handleDragOver = (evt: DragOverEvent) => {
    const activeId = String(evt.active.id);
    const overId = evt.over ? String(evt.over.id) : null;
    if (!overId) return;

    const fromCol = columns.find((c) => c.tasks.some((t) => t.id === activeId));
    if (!fromCol) return;

    const isOverColumn = columns.some((c) => c.id === overId);
    const toCol = isOverColumn ? columns.find((c) => c.id === overId)! : columns.find((c) => c.tasks.some((t) => t.id === overId))!;
    if (!toCol) return;

    if (fromCol.id === toCol.id) {
      const fromIdx = fromCol.tasks.findIndex((t) => t.id === activeId);
      const overIdx = isOverColumn ? Math.max(0, toCol.tasks.length - 1) : toCol.tasks.findIndex((t) => t.id === overId);

      if (fromIdx !== -1 && overIdx !== -1 && fromIdx !== overIdx) {
        setColumns((prev) =>
          prev.map((c) => {
            if (c.id !== fromCol.id) return c;
            const tasks = arrayMove([...c.tasks], fromIdx, overIdx);
            tasks.forEach((t, i) => (t.order = i));
            return { ...c, tasks };
          })
        );
      }
      return;
    }

    setColumns((prev) => {
      const next = prev.map((c) => ({ ...c, tasks: [...c.tasks] }));
      const src = next.find((c) => c.id === fromCol.id)!;
      const dst = next.find((c) => c.id === toCol.id)!;

      const fromIndex = src.tasks.findIndex((t) => t.id === activeId);
      const insertIndex = isOverColumn ? dst.tasks.length : Math.max(0, dst.tasks.findIndex((t) => t.id === overId));

      const [moved] = src.tasks.splice(fromIndex, 1);
      dst.tasks.splice(insertIndex, 0, moved);

      src.tasks.forEach((t, i) => (t.order = i));
      dst.tasks.forEach((t, i) => (t.order = i));
      moved.columnId = dst.id;

      return next;
    });
  };

  const title =
    tab === 'home' ? 'Главная'
    : tab === 'groups'
      ? (groupsPage === 'list'
          ? 'Группы'
          : ` ${selectedGroup?.title || 'Группа'}`)
    : tab === 'calendar' ? 'Календарь'
    : tab === 'notifications' ? 'Уведомления'
    : 'Настройки';

  const handleDragEnd = async (event: DragEndEvent) => {
    setDragging(false);
    if (scrollerRef.current) scrollerRef.current.style.touchAction = 'pan-x';
    setActiveId(null);
    startRef.current = null;

    const active = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    const finalColId =
      overId && columns.some((c) => c.id === overId)
        ? overId
        : columns.find((c) => c.tasks.some((t) => t.id === (overId ?? active)))?.id;

    if (!finalColId) {
      await reloadBoard();
      return;
    }
    const col = columns.find((c) => c.id === finalColId);
    if (!col) {
      await reloadBoard();
      return;
    }

    const toIndex = col.tasks.findIndex((t) => t.id === active);
    try {
      // если бросили в Done и у задачи требуется фото — прервём перенос и попросим фото
      const moved = columns.flatMap((c) => c.tasks).find((t) => t.id === active) as any;
      if (col.name === 'Done' && moved && moved.acceptCondition === 'PHOTO') {
        setAcceptPrompt({ id: active });
        await reloadBoard();
        return;
      }
      if (col.name === 'Done' && moved && moved.acceptCondition === 'APPROVAL') {
        try {
          const approvalCol = columns.find((c) => String(c.name) === 'Approval');
          if (approvalCol) {
            await apiMoveTask(active, approvalCol.id, 0);
            await reloadBoard();
            return;
          }
        } catch {}
      }
      await apiMoveTask(active, finalColId, Math.max(0, toIndex));
    } catch (e) {
      console.error('[DND] move error', e);
      await reloadBoard();
    }
  };

  /* ---------------- render ---------------- */
  return (
    <>
      <WriteAccessGate chatId={chatId} />

      {/* ⬇️ Полноэкранная страница процесса */}
      {showProcess && (
        <div
          className="rf-scope"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000, // повышаем, чтобы перекрывать всё
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: 10, borderBottom:'1px solid #e5e7eb' }}>
            <div style={{ fontWeight: 700 }}>🔀 Процесс</div>
            <div />
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
<GroupProcessPage
  chatId={chatId}
  groupId={resolvedGroupId ?? null}
  onOpenTask={openTask}

  /* seed-сценарии */
  seedTaskId={seedTaskIdForProcess}
  seedAssigneeChatId={seedAssigneeChatIdForProcess}
  forceSeedFromTask={!!seedTaskIdForProcess}
  focusTaskId={focusTaskIdForProcess}

  /* справа: «прорости узел от фокуса» */
  spawnNextForFocus={spawnNextForFocus}
  onSpawnNextConsumed={() => setSpawnNextForFocus(false)}

  /* слева: НОВОЕ — «прорости узел слева от фокуса» */
  spawnPrevForFocus={spawnPrevForFocus}
  onSpawnPrevConsumed={() => setSpawnPrevForFocus(false)}

  /* посев в режиме «Новый ← Текущая» (если задачи ещё нет в графе) */
  seedPrev={seedPrevForProcess}

  /* когда seed-сессия отработана — сбросить семена */
  onSeedConsumed={() => {
    setSeedTaskIdForProcess(null);
    setSeedAssigneeChatIdForProcess(null);
    setSeedPrevForProcess(false);
  }}

  /* продолжать seed-сессию между повторными открытиями полотна */
  persistSeedSession={persistSeedSession}
/>

            {/* Нижняя кнопка назад — только внутри оверлея процесса */}
            <div
              style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                zIndex: 2100,
                display: 'flex',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <button
                onClick={() => {
                  const backId = returnTaskIdForProcess || taskId || null;
                  setShowProcess(false);
                  setFocusTaskIdForProcess(null);
                  setSeedTaskIdForProcess(null);
                  setSeedAssigneeChatIdForProcess(null);

setSpawnNextForFocus(false);
setSpawnPrevForFocus(false);
setSeedPrevForProcess(false);
setFocusTaskIdForProcess(null);
setSeedTaskIdForProcess(null);
setSeedAssigneeChatIdForProcess(null);
setPersistSeedSession(false);


                  const url = new URL(window.location.href);
                  url.searchParams.delete('view');
                  window.history.replaceState(null, '', url.toString());
                    setPersistSeedSession(false); // 👈 сброс сеанса

                  if (backId) {
                    openTask(backId);
                    setReturnTaskIdForProcess(null);
                  } else {
                    WebApp?.BackButton?.hide?.();
                  }
                }}
                style={{
                  pointerEvents: 'auto',
                  background: '#202840',
                  color: '#e8eaed',
                  border: '1px solid #2a3346',
                  borderRadius: 12,
                  padding: '10px 14px',
                  boxShadow: '0 6px 18px rgba(0,0,0,.35)',
                }}
              >
                ⟵ Назад
              </button>
            </div>
          </div>
        </div>
      )}

      {taskId ? (
        <TaskView taskId={taskId} onClose={closeTask} onChanged={reloadBoard} meChatId={chatId} myRankIcon={myRankIcon} />
      ) : (
        <div
          style={{
            minHeight: '100vh',
            background: '#0f1216',
            color: '#e8eaed',
            paddingTop: 16,
            paddingLeft: 0,
            paddingRight: 0,
            paddingBottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* Шапка */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {tab === 'groups' && groupsPage === 'detail' ? (
                <button
                  onClick={backToGroupsList}
                  title="К списку групп"
                  style={{
                    background: 'transparent',
                    border: '1px solid #2a3346',
                    color: '#e8eaed',
                    borderRadius: 10,
                    padding: '6px 8px',
                    cursor: 'pointer',
                  }}
                >
                  ⟵ Назад
                </button>
              ) : null}

              {tab === 'notifications' ? (
                <button
                  onClick={() => setTab('settings')}
                  title="К настройкам"
                  style={{
                    background: 'transparent',
                    border: '1px solid #2a3346',
                    color: '#e8eaed',
                    borderRadius: 10,
                    padding: '6px 8px',
                    cursor: 'pointer',
                  }}
                >
                  ⟵ Назад
                </button>
              ) : null}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{title}</h1>
                {tab === 'groups' && groupsPage === 'detail' && isOwnerOfSelected ? (
                  <button
                    title="Переименовать группу"
                    onClick={() => setShowGroupEdit(true)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#8aa0ff',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: 2,
                      lineHeight: 1,
                    }}
                  >
                    ✏️
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {tab === 'home' ? (
          <HomePage
            chatId={chatId}
            onOpenTask={openTask}
            reloadKey={feedReloadKey}
          />
          ) : tab === 'groups' ? (
            groupsPage === 'list' ? (
              <GroupList
                chatId={chatId}
                groups={groups}
                onReload={reloadGroups}
                onOpen={goToGroup}
              />
            ) : (
              <>
                <GroupTabs current={groupTab} onChange={setGroupTab} />

                {groupTab === 'kanban' ? (
                  loading ? (
                    <div style={{ padding: 16 }}>Загрузка…</div>
                  ) : error ? (
                    <div style={{ padding: 16, color: 'crimson' }}>{error}</div>
                  ) : (
                    <>
                      {/* Создание */}
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCorners}
                        onDragStart={handleDragStart}
                        onDragMove={handleDragMove}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                        autoScroll={false}
                      >
                        {/* Горизонтальный холст */}
                        <div
                          ref={scrollerRef}
                          style={{
                            overflowX: 'auto',
                            overflowY: 'hidden',
                            whiteSpace: 'nowrap',
                            WebkitOverflowScrolling: 'touch',
                            overscrollBehaviorX: 'contain',
                            paddingBottom: 8,
                            touchAction: dragging ? 'none' : 'pan-x',
                          }}
                        >
                          {columns
                            .sort((a, b) => a.order - b.order)
                            .map((col) => (
                              <ColumnView
                                key={col.id}
                                column={col}
                                onOpenTask={openTask}
                                onRenamed={reloadBoard}
                                activeId={activeId}
                                dragging={dragging}
                                meChatId={chatId}
                                myRankIcon={myRankIcon}
                              />
                            ))}
                        </div>

                        <DragOverlay>
                          {activeId
                            ? (() => {
                                const t = columns
                                  .flatMap((c) => c.tasks)
                                  .find((t) => t.id === activeId);
                                return t ? (
                                  <TaskCard text={t.text} order={t.order} dragging />
                                ) : null;
                              })()
                            : null}
                        </DragOverlay>
                      </DndContext>
                    </>
                  )
                ) : groupTab === 'process' ? (
                  <button
                    onClick={() => {
                      setReturnTaskIdForProcess(null); // открываем «вручную», не из задачи
                      setShowProcess(true);
                      const url = new URL(window.location.href);
                      url.searchParams.set('view', 'process');
                      window.history.pushState({ view: 'process' }, '', url.toString());
                      WebApp?.BackButton?.show?.();
                    }}
                    style={{
                      background:'#202840',
                      color:'#e8eaed',
                      border:'1px solid #2a3346',
                      borderRadius:10,
                      padding:'6px 10px',
                      margin:12,
                    }}
                  >
                    🔀 Открыть процесс
                  </button>
                ) : (
                  <GroupMembers
                    group={selectedGroup as any}
                    chatId={chatId}
                    isOwner={isOwnerOfSelected}
                    onChanged={async () => {
                      await reloadGroups();
                      await loadBoard();
                    }}
                    onLeftGroup={() => {
                      setGroupsPage('list');
                      setSelectedGroupId('');
                      reloadGroups();
                    }}
                  />
                )}
              </>
            )
          ) : tab === 'calendar' ? (
            <CalendarView
              chatId={chatId}
              groupId={resolvedGroupId}
              onOpenTask={openTask}
            />
          ) : tab === 'settings' ? (
            <div
              style={{
                background: '#1b2030',
                border: '1px solid #2a3346',
                borderRadius: 16,
                padding: 12,
                display: 'grid',
                gap: 8,
              }}
            >
              {/* Профиль: ФИО и ID пользователя */}
              <SettingsProfile chatId={chatId} />

              {/* пункт "Уведомления" */}
              <button
                onClick={() => setTab('notifications')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  background: '#202840',
                  color: '#e8eaed',
                  border: '1px solid #2a3346',
                  borderRadius: 12,
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 18 }}>🔔</span>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Уведомления</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Настроить подписки и посмотреть историю
                  </div>
                </div>
              </button>

              {/* Звёзды — сводка и способ получения (SBP) */}
              <SettingsStars chatId={chatId} />

              {/* Ранг пользователя */}
              <SettingsRank chatId={chatId} />

              {/* тут можно добавить другие пункты настроек позже */}
            </div>
          ) : tab === 'notifications' ? (
            <NotificationsView chatId={chatId} />
          ) : (
            <TabPlaceholder tab={tab} />
          )}

          <CreateTaskFab
            defaultGroupId={resolvedGroupId ?? null}
            chatId={chatId}
            groups={groups}
            onCreated={() => {
              if (tab === 'home') {
                setFeedReloadKey((k) => k + 1);
              } else {
                reloadBoard();
              }
            }}
          />

          {/* Нижняя панель */}
          <BottomNav
            current={tab}
            onChange={(t) => {
              console.log('[NAV] bottom change', t);
              // По клику на «группа» всегда открываем страницу групп
              if (t === 'groups') {
                // если открыта задача — закрываем её и чистим URL (?task=)
                if (taskId) {
                  closeTask();
                }
                setTab('groups');
                setGroupsPage('list');
                try {
                  (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
                } catch {}
                return;
              }

              setTab(t);
              try {
                (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
              } catch {}
              // при переходе в любой другой таб выходим на список групп
              setGroupsPage('list');
            }}
          />

          {/* 🔹 Модалка редактирования группы — в корне App */}
          {showGroupEdit && selectedGroup ? (
            <GroupEdit
              group={selectedGroup as any}
              chatId={chatId}
              onClose={() => setShowGroupEdit(false)}
              onRenamed={async (newTitle) => {
                await reloadGroups();
                // если это текущая группа — обновим локальный заголовок без перезахода
                setGroups((prev: Group[]) =>
                  prev.map((g: Group) =>
                    g.id === selectedGroup.id
                      ? ({ ...g, title: newTitle } as Group)
                      : g,
                  ),
                );
              }}
              onDeleted={async () => {
                await reloadGroups();
                // после удаления уходим на список групп
                setGroupsPage('list');
                setSelectedGroupId('');
              }}
            />
          ) : null}

          {/* 🚩 Редактор дедлайна для задач на доске */}
          <DeadlinePicker
            open={!!deadlineEdit}
            value={deadlineEdit?.value ?? null}
            onClose={() => setDeadlineEdit(null)}
            onChange={async (iso) => {
              const id = deadlineEdit?.taskId;
              if (!id) return;
              try {
                const r = await setTaskDeadline(id, chatId, iso);
                if (r?.ok && r.task) {
                  setColumns((prev) => prev.map((c) => ({
                    ...c,
                    tasks: c.tasks.map((t) => (t.id === id ? ({ ...t, deadlineAt: r.task!.deadlineAt || null } as any) : t)),
                  })));
                }
              } catch {}
            }}
          />

          {/* ☝️ Завершение с фото при dnd → Done */}
          {acceptPrompt && (
            <div
              onClick={() => setAcceptPrompt(null)}
              style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}
            >
              <div onClick={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(480px, 92vw)' }}>
                <div style={{ fontWeight:700, marginBottom:8 }}>Чтобы завершить задачу, прикрепите фото</div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <button disabled={acceptUploadBusy} onClick={()=> acceptFileRef.current?.click()} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: acceptUploadBusy ? 0.6 : 1 }}>🖼️ Выбрать</button>
                  <button disabled={acceptUploadBusy} onClick={()=> setAcceptCamOpen(true)} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: acceptUploadBusy ? 0.6 : 1 }}>📸 Камера</button>
                  <input ref={acceptFileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={async (e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file || !acceptPrompt) return;
                    try {
                      setAcceptUploadBusy(true);
                      const up = await uploadTaskMedia(acceptPrompt.id, chatId, file);
                      if ((up as any)?.ok && (up as any)?.media?.url) {
                        await addComment(acceptPrompt.id, chatId, (up as any).media.url);
                      }
                      await completeTask(acceptPrompt.id);
                      setAcceptPrompt(null);
                      await reloadBoard();
                    } catch {}
                    finally { setAcceptUploadBusy(false); }
                  }} />
                  <div style={{ fontSize: 12, opacity: 0.85 }}>{acceptUploadBusy ? 'Загружаю фото…' : ''}</div>
                  <button disabled={acceptUploadBusy} onClick={()=> setAcceptPrompt(null)} style={{ marginLeft:'auto', padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: acceptUploadBusy ? 0.6 : 1 }}>Отмена</button>
                </div>
              </div>
            </div>
          )}

          <CameraCaptureModal
            open={acceptCamOpen}
            onClose={() => setAcceptCamOpen(false)}
          onCapture={async (file) => {
            if (!acceptPrompt) return;
            try {
              setAcceptUploadBusy(true);
              const up = await uploadTaskMedia(acceptPrompt.id, chatId, file);
              if ((up as any)?.ok && (up as any)?.media?.url) {
                await addComment(acceptPrompt.id, chatId, (up as any).media.url);
              }
              await completeTask(acceptPrompt.id);
              setAcceptCamOpen(false);
              setAcceptPrompt(null);
              await reloadBoard();
            } catch {}
            finally { setAcceptUploadBusy(false); }
          }}
        />
        </div>
      )}
    </>
  );
}

function ColumnView({
  column,
  onOpenTask,
  onRenamed,
  activeId,
  dragging,
  meChatId,
  myRankIcon,
}: {
  column: Column;
  onOpenTask: (id: string) => void;
  onRenamed: () => void;
  activeId: string | null;
  dragging: boolean;
  meChatId: string;
  myRankIcon: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);
  const { setNodeRef } = useDroppable({ id: column.id });

  const saveName = async () => {
    const newName = name.trim();
    if (!newName || newName === column.name) {
      setEditing(false);
      setName(column.name);
      return;
    }
    try {
      await renameColumn(column.id, newName);
      onRenamed();
      setEditing(false);
      WebApp?.HapticFeedback?.impactOccurred?.('light');
    } catch (e) {
      console.error('[UI] renameColumn error', e);
      alert('Имя занято или ошибка сохранения');
      setName(column.name);
      setEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'inline-block',
        verticalAlign: 'top',
        width: '80vw',
        maxWidth: 520,
        marginRight: 16,
        background: '#1b2030',
        border: '1px solid #2a3346',
       
        borderRadius: 16,
        padding: 12,
        minHeight: 300,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {editing ? (
          <>
            <input
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') {
                  setEditing(false);
                  setName(column.name);
                }
              }}
              onBlur={saveName}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 10,
                background: '#121722',
                color: '#e8eaed',
                border: '1px solid #2a3346',
              }}
            />
            <button
              onClick={saveName}
              style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
            >
              OK
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.8, flex: 1 }}>{column.name}</div>
            <button
              onClick={() => setEditing(true)}
              title="Переименовать"
              style={{ background: 'transparent', color: '#8aa0ff', border: 'none', cursor: 'pointer', fontSize: 16, padding: 2 }}
            >
              ✎
            </button>
          </>
        )}
      </div>

      <SortableContext id={column.id} items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: 50,
            maxHeight: '60vh',
            overflowY: 'auto',
            paddingRight: 4,
            touchAction: dragging ? 'none' : 'pan-x pan-y',
          }}
        >
          {column.tasks.map((t) => (
            <SortableTask
              key={t.id}
              taskId={t.id}
              text={t.text}
              order={t.order}
              assigneeName={t.assigneeName}
              assigneeChatId={(t as any).assigneeChatId || null}
              meChatId={meChatId}
              myRankIcon={myRankIcon}
              onOpenTask={onOpenTask}
              armed={activeId === t.id}
              isEvent={t.type === 'EVENT'}
              startAt={t.startAt}
              endAt={t.endAt}
              fromProcess={!!t.fromProcess}
              deadlineAt={(t as any).deadlineAt || null}
              bountyStars={(t as any).bountyStars || 0}
              bountyStatus={(t as any).bountyStatus || 'NONE'}
              acceptCondition={(t as any).acceptCondition || 'NONE'}
            />
          ))}

          {column.tasks.length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>Пусто</div>}
        </div>
      </SortableContext>
    </div>
  );
}
