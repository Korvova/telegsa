import { useEffect, useMemo, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';

import TaskView from './TaskView';
import {
  fetchBoard,
  type Column,
  moveTask as apiMoveTask,
  createTask,
  createColumn,
  renameColumn,
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
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ---------------- helpers ---------------- */
function useChatId() {
  return useMemo(() => {
    const urlChatId = new URLSearchParams(window.location.search).get('from');
    const sdkChatId = WebApp?.initDataUnsafe?.user?.id
      ? String(WebApp.initDataUnsafe.user.id)
      : undefined;
    return urlChatId || sdkChatId || '';
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
    // блокируем жесты только у активной/перетаскиваемой карточки
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
function AddColumnButton({ chatId, onAdded }: { chatId: string; onAdded: () => void }) {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    const name = prompt('Название новой колонки?')?.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createColumn(chatId, name);
      onAdded();
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch {
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

/* Стрелки прокрутки холста */
function ArrowBar({
  scrollerRef,
  left,
}: { scrollerRef: React.RefObject<HTMLDivElement | null>; left: number }) {
  const STEP = 120;
  const TICK_EVERY = 24;

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const target = Math.max(0, Math.min(max, el.scrollLeft + dir * STEP));
    el.scrollTo({ left: target, behavior: 'smooth' });
  };

  const holdTimer = useRef<number | null>(null);
  const startHold = (dir: -1 | 1) => () => {
    stopHold();
    const tick = () => { scrollBy(dir); holdTimer.current = window.setTimeout(tick, TICK_EVERY); };
    tick();
  };
  const stopHold = () => { if (holdTimer.current != null) { clearTimeout(holdTimer.current); holdTimer.current = null; } };

  useEffect(() => {
    const stop = () => stopHold();
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchend', stop);
    window.addEventListener('touchcancel', stop);
    return () => {
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchend', stop);
      window.removeEventListener('touchcancel', stop);
      stopHold();
    };
  }, []);

  const btn: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 10,
    background: '#1f2a40',
    border: '1px solid #2a3346',
    color: '#e8eaed',
    fontSize: 16,
    touchAction: 'manipulation',
  };
  const pill: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 10,
    background: '#0b1020',
    border: '1px solid #2a3346',
    color: '#cde',
    fontSize: 12,
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        style={btn}
        onClick={() => scrollBy(-1)}
        onMouseDown={startHold(-1)}
        onTouchStart={(e) => { e.preventDefault(); startHold(-1)(); }}
      >◀</button>
      <button
        style={btn}
        onClick={() => scrollBy(+1)}
        onMouseDown={startHold(+1)}
        onTouchStart={(e) => { e.preventDefault(); startHold(+1)(); }}
      >▶</button>
      <div style={pill}>scrollLeft:{Math.round(left)}</div>
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

  // отладка scrollLeft
  const [dbgLeft, setDbgLeft] = useState(0);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => setDbgLeft(el.scrollLeft);
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // для авто-скролла при dnd
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // навигация
  useEffect(() => {
    const onPopState = () => setTaskId(getTaskIdFromURL());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const reloadBoard = async () => {
    const data = await fetchBoard(chatId);
    if (data.ok) {
      const cols = data.columns.map((c) => ({
        ...c,
        tasks: [...c.tasks].sort((a, b) => a.order - b.order),
      }));
      setColumns(cols);
    }
  };

  const openTask = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('task', id);
    window.history.replaceState(null, '', url.toString());
    setTaskId(id);
    WebApp?.BackButton?.show?.();
  };
  const closeTask = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('task');
    window.history.replaceState(null, '', url.toString());
    setTaskId('');
    WebApp?.BackButton?.hide?.();
    reloadBoard();
  };

  useEffect(() => {
    WebApp?.ready();
    WebApp?.expand();

    if (!chatId) {
      setError('Не удалось определить chatId. Открой WebApp из кнопки в боте.');
      setLoading(false);
      return;
    }

    fetchBoard(chatId)
      .then((data) => {
        if (!data.ok) throw new Error('API error');
        const cols = data.columns.map((c) => ({
          ...c,
          tasks: [...c.tasks].sort((a, b) => a.order - b.order),
        }));
        setColumns(cols);
      })
      .catch((e) => setError(e?.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [chatId]);

  /* ---- авто-скролл холста по краям при dnd ---- */
  const scrollByX = (dx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + dx));
    setDbgLeft(el.scrollLeft);
  };

  const handleDragStart = (evt: DragStartEvent) => {
    setActiveId(String(evt.active.id));
    prevTotalDxRef.current = 0; // <— сброс накопленного dx
    setDragging(true);
    if (scrollerRef.current) scrollerRef.current.style.touchAction = 'none';

    // фиксируем стартовые координаты
    const ev: any = evt.activatorEvent;
    const sx = typeof ev?.clientX === 'number' ? ev.clientX : ev?.touches?.[0]?.clientX ?? 0;
    const sy = typeof ev?.clientY === 'number' ? ev.clientY : ev?.touches?.[0]?.clientY ?? 0;
    startRef.current = { x: sx, y: sy };

    WebApp?.HapticFeedback?.impactOccurred?.('light');
  };



const handleDragMove = (evt: DragMoveEvent) => {
  if (!startRef.current) return;

  const totalDx = evt.delta?.x ?? 0;                // общее смещение
  const frameDx = totalDx - prevTotalDxRef.current; // смещение за текущий кадр
  prevTotalDxRef.current = totalDx;

  // абсолютный X пальца — как было
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

  // ВАЖНО: двигаем холст только если направление совпадает с текущим движением пальца
  const sgnMove = Math.sign(frameDx);
  if ((dx > 0 && sgnMove < 0) || (dx < 0 && sgnMove > 0)) {
    dx = 0;
  }

  if (dx) scrollByX(dx);
};





  const handleDragOver = (evt: DragOverEvent) => {
    const active = String(evt.active.id);
    const overId = evt.over ? String(evt.over.id) : null;
    if (!overId) return;

    const fromColId = columns.find((c) => c.tasks.some((t) => t.id === active))?.id;
    const toColId =
      columns.some((c) => c.id === overId)
        ? overId
        : columns.find((c) => c.tasks.some((t) => t.id === overId))?.id;

    if (!fromColId || !toColId || fromColId === toColId) return;

    // оптимистично переставляем
    setColumns((prev) => {
      const next = prev.map((c) => ({ ...c, tasks: [...c.tasks] }));
      const fromCol = next.find((c) => c.id === fromColId)!;
      const toCol = next.find((c) => c.id === toColId)!;

      const fromIndex = fromCol.tasks.findIndex((t) => t.id === active);
      const overIndexInTo = toCol.tasks.findIndex((t) => t.id === overId);
      const insertIndex = overIndexInTo >= 0 ? overIndexInTo : toCol.tasks.length;

      const [moved] = fromCol.tasks.splice(fromIndex, 1);
      toCol.tasks.splice(insertIndex, 0, moved);

      fromCol.tasks.forEach((t, i) => (t.order = i));
      toCol.tasks.forEach((t, i) => (t.order = i));
      moved.columnId = toCol.id;

      return next;
    });
  };

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
    } catch {
      await reloadBoard();
    }
  };

  /* ---------------- render ---------------- */
  if (taskId) return <TaskView taskId={taskId} onClose={closeTask} onChanged={reloadBoard} />;
  if (loading) return <div style={{ padding: 16 }}>Загрузка…</div>;
  if (error)   return <div style={{ padding: 16, color: 'crimson' }}>{error}</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#0f1216', color: '#e8eaed', padding: 16 }}>
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Kanban</h1>
        <ArrowBar scrollerRef={scrollerRef} left={dbgLeft} />
      </div>

      {/* Создание */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <NewTaskBar chatId={chatId} onCreated={reloadBoard} />
        <AddColumnButton chatId={chatId} onAdded={reloadBoard} />
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
    </div>
  );
}

/* ---------------- subviews ---------------- */
function NewTaskBar({ chatId, onCreated }: { chatId: string; onCreated: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const val = text.trim();
    if (!val || busy) return;
    setBusy(true);
    try {
      await createTask(chatId, val);
      setText('');
      onCreated();
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch {
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
  const { setNodeRef } = useDroppable({ id: column.id }); // чтобы можно было бросать в пустую колонку

  const saveName = async () => {
    const newName = name.trim();
    if (!newName || newName === column.name) { setEditing(false); setName(column.name); return; }
    try {
      await renameColumn(column.id, newName);
      onRenamed();
      setEditing(false);
      WebApp?.HapticFeedback?.impactOccurred?.('light');
    } catch {
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
                flex: 1, padding: '6px 10px', borderRadius: 10,
                background: '#121722', color: '#e8eaed', border: '1px solid #2a3346'
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
            // позволяем вертикальный скролл в покое; при реальном драге блокируем, чтобы dnd ловил движение
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
