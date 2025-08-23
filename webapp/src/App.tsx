import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import BottomNav, { type TabKey } from './BottomNav';

import TaskView from './TaskView';
import {
  fetchBoard,
  type Column,
  moveTask as apiMoveTask,
  createTask,
  createColumn,
  renameColumn,
  type Group,
  listGroups,
} from './api';

import {
  DndContext, DragOverlay, closestCorners,
  MouseSensor, TouchSensor, useSensor, useSensors,
  type DragStartEvent, type DragMoveEvent, type DragOverEvent, type DragEndEvent, useDroppable
} from '@dnd-kit/core';

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// вынесенные компоненты
import GroupList from './pages/Groups/GroupList';
import GroupTabs from './components/GroupTabs';

/* ---------------- helpers ---------------- */
function useChatId() {
  return useMemo(() => {
    const urlChatId = new URLSearchParams(window.location.search).get('from');
    const sdkChatId = WebApp?.initDataUnsafe?.user?.id
      ? String(WebApp.initDataUnsafe.user.id)
      : undefined;
    const id = urlChatId || sdkChatId || '';
    console.log('[APP] useChatId ->', id);
    return id;
  }, []);
}
function getTaskIdFromURL() {
  return new URLSearchParams(window.location.search).get('task') || '';
}

/* ---------------- UI bits ---------------- */
function TaskCard({
  text,
  order,
  active,
  dragging,
  onClick,
}: {
  text: string;
  order: number;
  active?: boolean;
  dragging?: boolean;
  onClick?: () => void;
}) {
  const bg =
    dragging ? '#0e1629' :
    active   ? '#151b2b' :
               '#121722';

  return (
    <div
      onClick={onClick}
      style={{
        background: bg,
        border: '1px solid #2a3346',
        borderRadius: 12,
        padding: 12,
        userSelect: 'none',
        cursor: 'pointer',
        boxShadow: dragging ? '0 6px 18px rgba(0,0,0,.35)' : 'none',
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>#{order}</div>
      <div style={{ fontSize: 15 }}>{text}</div>
    </div>
  );
}

function SortableTask({
  taskId,
  text,
  order,
  onOpenTask,
  armed,
}: {
  taskId: string;
  text: string;
  order: number;
  onOpenTask: (id: string) => void;
  armed?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: taskId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: (armed || isDragging) ? 'none' : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard
        text={text}
        order={order}
        active={armed}
        dragging={isDragging}
        onClick={() => onOpenTask(taskId)}
      />
    </div>
  );
}

/* + Колонка */
function AddColumnButton({ chatId, groupId, onAdded }: { chatId: string; groupId?: string; onAdded: () => void }) {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    const name = prompt('Название новой колонки?')?.trim();
    if (!name) return;
    setBusy(true);
    try {
      console.log('[UI] createColumn ->', { chatId, groupId, name });
      await createColumn(chatId, name, groupId);
      onAdded();
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch (e) {
      console.error('[UI] createColumn error', e);
      alert('Не удалось создать колонку (возможно, имя занято)');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={click}
      disabled={busy}
      style={{
        padding: '10px 14px', borderRadius: 12,
        background: '#203428', color: '#d7ffd7',
        border: '1px solid #2a3346', cursor: busy ? 'default' : 'pointer'
      }}
    >
      + Колонка
    </button>
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
    <div style={{
      padding: 16,
      background: '#1b2030',
      border: '1px solid #2a3346',
      borderRadius: 16,
      minHeight: 240,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center'
    }}>
      <div style={{ opacity: 0.85, lineHeight: 1.6 }}>
        {tab === 'calendar' ? map.calendar
          : tab === 'notifications' ? map.notifications
          : map.settings}
      </div>
    </div>
  );
}

/* ---------------- App ---------------- */
export default function App() {
  const chatId = useChatId();
  const [taskId, setTaskId] = useState<string>(getTaskIdFromURL());
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<Column[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>('groups'); // нижнее меню
  const [groupTab, setGroupTab] = useState<'kanban' | 'process' | 'members'>('kanban');

  // мини-роутер для вкладки «Группы»
  const [groupsPage, setGroupsPage] = useState<'list' | 'detail'>('list');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // холст
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const prevTotalDxRef = useRef(0);

  // сенсоры: long-press на таче + мышь
  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
  );

  // убираем белые поля по X
  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.overflowX;
    const prevBody = document.body.style.overflowX;
    html.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';
    html.style.background = '#0f1216';
    document.body.style.background = '#0f1216';
    return () => { html.style.overflowX = prevHtml; document.body.style.overflowX = prevBody; };
  }, []);

  // для авто-скролла при dnd
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
      .then(r => {
        if (r.ok) {
          console.log('[GROUPS] list ->', r.groups);
          setGroups(r.groups);
          setSelectedGroupId(prev => prev || (r.groups[0]?.id || ''));
        }
      })
      .catch((e) => console.error('[GROUPS] list error', e));
  }, [chatId]);

  // показываем системную кнопку «Назад» в деталях группы
  useEffect(() => {
    if (tab === 'groups' && groupsPage === 'detail') {
      WebApp?.BackButton?.show?.();
    } else {
      WebApp?.BackButton?.hide?.();
    }
  }, [tab, groupsPage]);

  const reloadGroups = () =>
    listGroups(chatId).then(r => { if (r.ok) setGroups(r.groups); });

  const goToGroup = (id: string) => {
    console.log('[NAV] goToGroup', { id });
    setSelectedGroupId(id);
    setColumns([]);      // мгновенно очищаем, чтобы не мигало
    setLoading(true);    // покажем спиннер до первой загрузки
    setGroupsPage('detail');
    setGroupTab('kanban');
  };

  const backToGroupsList = () => {
    console.log('[NAV] backToGroupsList');
    setGroupsPage('list');
  };

  // вычисляем выбранную группу и её "разрешённый" id для API
  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const resolvedGroupId = selectedGroup && selectedGroup.title === 'Моя группа'
    ? undefined
    : selectedGroup?.id;

  // загрузка доски (ЕДИНЫЙ эффект)
  const loadBoard = useCallback(async () => {
    if (!chatId) return;
    const shouldLoad = tab === 'groups' && groupsPage === 'detail' && groupTab === 'kanban';
    console.log('[BOARD] loadBoard check ->', { chatId, resolvedGroupId, tab, groupsPage, groupTab, shouldLoad });
    if (!shouldLoad) return;

    setLoading(true);
    console.log('[BOARD] load START', { chatId, resolvedGroupId });
    try {
      const data = await fetchBoard(chatId, resolvedGroupId);
      if (!data.ok) throw new Error('API error');
      const cols = data.columns.map((c) => ({
        ...c,
        tasks: [...c.tasks].sort((a, b) => a.order - b.order),
      }));
      console.log('[BOARD] load OK', {
        columns: cols.map(c => ({ id: c.id, name: c.name, tasks: c.tasks.length }))
      });
      setColumns(cols);
      setError(null);
    } catch (e: any) {
      console.error('[BOARD] load ERROR', e);
      setError(e?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
      console.log('[BOARD] load END');
    }
  }, [chatId, resolvedGroupId, tab, groupsPage, groupTab]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const reloadBoard = useCallback(async () => {
    // локальное обновление без спиннера
    try {
      console.log('[BOARD] reloadBoard', { chatId, resolvedGroupId });
      const data = await fetchBoard(chatId, resolvedGroupId);
      if (data.ok) {
        const cols = data.columns.map((c) => ({
          ...c,
          tasks: [...c.tasks].sort((a, b) => a.order - b.order),
        }));
        setColumns(cols);
        console.log('[BOARD] reload OK');
      }
    } catch (e) {
      console.error('[BOARD] reload ERROR', e);
    }
  }, [chatId, resolvedGroupId]);

  const openTask = (id: string) => {
    console.log('[TASK] openTask', id);
    const url = new URL(window.location.href);
    url.searchParams.set('task', id);
    window.history.replaceState(null, '', url.toString());
    setTaskId(id);
    WebApp?.BackButton?.show?.();
  };
  const closeTask = () => {
    console.log('[TASK] closeTask');
    const url = new URL(window.location.href);
    url.searchParams.delete('task');
    window.history.replaceState(null, '', url.toString());
    setTaskId('');
    WebApp?.BackButton?.hide?.();
    // просто перезагружаем доску (без изменения loading)
    reloadBoard();
  };

  // A) поднять WebApp
  useEffect(() => {
    WebApp?.ready();
    WebApp?.expand();

    if (!chatId) {
      setError('Не удалось определить chatId. Открой WebApp из кнопки в боте.');
      setLoading(false);
    }
  }, [chatId]);

  /* ---- авто-скролл холста по краям при dnd ---- */
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
    const toCol =
      isOverColumn
        ? columns.find((c) => c.id === overId)!
        : columns.find((c) => c.tasks.some((t) => t.id === overId))!;
    if (!toCol) return;

    if (fromCol.id === toCol.id) {
      const fromIdx = fromCol.tasks.findIndex((t) => t.id === activeId);
      const overIdx = isOverColumn
        ? Math.max(0, toCol.tasks.length - 1)
        : toCol.tasks.findIndex((t) => t.id === overId);

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
      const insertIndex = isOverColumn
        ? dst.tasks.length
        : Math.max(0, dst.tasks.findIndex((t) => t.id === overId));

      const [moved] = src.tasks.splice(fromIndex, 1);
      dst.tasks.splice(insertIndex, 0, moved);

      src.tasks.forEach((t, i) => (t.order = i));
      dst.tasks.forEach((t, i) => (t.order = i));
      moved.columnId = dst.id;

      return next;
    });
  };

  const title =
    tab === 'groups'
      ? (groupsPage === 'list' ? 'Группы' : `Группы • ${selectedGroup?.title || 'Группа'}`)
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
      (overId && columns.some((c) => c.id === overId))
        ? overId
        : columns.find((c) => c.tasks.some((t) => t.id === (overId ?? active)))?.id;

    if (!finalColId) { await reloadBoard(); return; }
    const col = columns.find((c) => c.id === finalColId);
    if (!col) { await reloadBoard(); return; }

    const toIndex = col.tasks.findIndex((t) => t.id === active);
    try {
      await apiMoveTask(active, finalColId, Math.max(0, toIndex));
    } catch (e) {
      console.error('[DND] move error', e);
      await reloadBoard();
    }
  };

  /* ---------------- render ---------------- */
  if (taskId) return <TaskView taskId={taskId} onClose={closeTask} onChanged={reloadBoard} />;

  // Показываем «Загрузка…» только когда реально открыта доска Канбана
  const isBoardView = tab === 'groups' && groupsPage === 'detail' && groupTab === 'kanban';
  if (loading && isBoardView) return <div style={{ padding: 16 }}>Загрузка…</div>;
  if (error)   return <div style={{ padding: 16, color: 'crimson' }}>{error}</div>;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1216',
      color: '#e8eaed',
      padding: 16,
      paddingBottom: 'calc(76px + env(safe-area-inset-bottom, 0px))'
    }}>
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tab === 'groups' && groupsPage === 'detail' ? (
            <button
              onClick={backToGroupsList}
              title="К списку групп"
              style={{ background: 'transparent', border: '1px solid #2a3346', color: '#e8eaed', borderRadius: 10, padding: '6px 8px', cursor: 'pointer' }}
            >
              ⟵ Назад
            </button>
          ) : null}
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{title}</h1>
        </div>
      </div>

      {tab === 'groups' ? (
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
              <>
                {/* Создание */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <NewTaskBar chatId={chatId} groupId={resolvedGroupId} onCreated={reloadBoard} />
                  <AddColumnButton chatId={chatId} groupId={resolvedGroupId} onAdded={reloadBoard} />
                </div>

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
                        />
                      ))}
                  </div>

                  <DragOverlay>
                    {activeId
                      ? (() => {
                          const t = columns.flatMap((c) => c.tasks).find((t) => t.id === activeId);
                          return t ? <TaskCard text={t.text} order={t.order} dragging /> : null;
                        })()
                      : null}
                  </DragOverlay>
                </DndContext>
              </>
            ) : groupTab === 'process' ? (
              <div style={{
                padding: 16,
                background: '#1b2030',
                border: '1px solid #2a3346',
                borderRadius: 16,
                minHeight: 240,
              }}>
                Процесс 🔀: скоро подключим редактор связей (React Flow).
              </div>
            ) : (
              <div style={{
                padding: 16,
                background: '#1b2030',
                border: '1px solid #2a3346',
                borderRadius: 16,
                minHeight: 240,
              }}>
                Участники 👥: список участников и добавление — скоро подключим.
              </div>
            )}
          </>
        )
      ) : (
        <TabPlaceholder tab={tab} />
      )}

      {/* Нижняя панель */}
      <BottomNav
        current={tab}
        onChange={(t) => {
          console.log('[NAV] bottom change', t);
          setTab(t);
          try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch {}
          // выход из деталей группы при переключении вкладок
          if (t !== 'groups') setGroupsPage('list');
        }}
      />
    </div>
  );
}

/* ---------------- subviews ---------------- */
function NewTaskBar({ chatId, groupId, onCreated }: { chatId: string; groupId?: string; onCreated: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const val = text.trim();
    if (!val || busy) return;
    setBusy(true);
    try {
      console.log('[UI] createTask ->', { chatId, groupId, text: val });
      await createTask(chatId, val, groupId);
      setText('');
      onCreated();
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch (e) {
      console.error('[UI] createTask error', e);
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Новая задача…"
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        style={{
          flex: '0 1 60%',
          padding: '10px 12px',
          borderRadius: 12,
          background: '#121722',
          color: '#e8eaed',
          border: '1px solid #2a3346',
          minWidth: 160,
        }}
      />
      <button
        onClick={submit}
        disabled={busy || !text.trim()}
        style={{
          padding: '10px 14px',
          borderRadius: 12,
          background: '#202840',
          color: '#e8eaed',
          border: '1px solid #2a3346',
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        Создать
      </button>
    </div>
  );
}

function ColumnView({
  column,
  onOpenTask,
  onRenamed,
  activeId,
  dragging,
}: {
  column: Column;
  onOpenTask: (id: string) => void;
  onRenamed: () => void;
  activeId: string | null;
  dragging: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);
  const { setNodeRef } = useDroppable({ id: column.id });

  const saveName = async () => {
    const newName = name.trim();
    if (!newName || newName === column.name) { setEditing(false); setName(column.name); return; }
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
                if (e.key === 'Escape') { setEditing(false); setName(column.name); }
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
            <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.8, flex: 1 }}>
              {column.name}
            </div>
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
              onOpenTask={onOpenTask}
              armed={activeId === t.id}
            />
          ))}
          {column.tasks.length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>Пусто</div>}
        </div>
      </SortableContext>
    </div>
  );
}
