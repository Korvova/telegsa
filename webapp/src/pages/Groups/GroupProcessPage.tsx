import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Position,
  Handle,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { fetchProcess, saveProcess } from '../../api';

/* ================= Types ================= */
type Props = {
  chatId: string;
  groupId?: string | null;
  onOpenTask: (id: string) => void;
};

interface EditableData {
  label: string;
  onChange: (id: string, label: string) => void;
  onAction?: (
    id: string,
    action: 'home' | 'status' | 'comments' | 'participant' | 'conditions' | 'delete'
  ) => void;
  autoEdit?: boolean;
}

/* ======== Custom editable node (mobile long-press menu) ======== */
function EditableNode({ id, data }: NodeProps<EditableData>) {
  const [editing, setEditing] = useState<boolean>(!!data.autoEdit);
  const [value, setValue] = useState<string>(data.label ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const LONG_MS = 550;
  const MOVE_PX = 10;
  const press = useRef<{ tid: number | null; sx: number; sy: number; pid: number | null }>({
    tid: null, sx: 0, sy: 0, pid: null,
  });

  const openMenu = () => setMenuOpen(true);
  const closeMenu = () => setMenuOpen(false);

  const startLongPress = (e: React.PointerEvent) => {
    if (editing) return;
    if ((e.target as Element).closest('.react-flow__handle')) return;
    press.current.sx = e.clientX; press.current.sy = e.clientY; press.current.pid = e.pointerId;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    if (press.current.tid) window.clearTimeout(press.current.tid);
    press.current.tid = window.setTimeout(() => { openMenu(); }, LONG_MS);
  };
  const moveLongPress = (e: React.PointerEvent) => {
    if (press.current.tid == null) return;
    const dx = e.clientX - press.current.sx;
    const dy = e.clientY - press.current.sy;
    if (dx * dx + dy * dy > MOVE_PX * MOVE_PX) {
      window.clearTimeout(press.current.tid);
      press.current.tid = null;
    }
  };
  const cancelLongPress = () => {
    if (press.current.tid) window.clearTimeout(press.current.tid);
    press.current.tid = null; press.current.pid = null;
  };
  const onContextMenu = (e: React.MouseEvent) => { e.preventDefault(); openMenu(); };

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!rootRef.current) return;
      if (el && rootRef.current.contains(el)) return;
      setMenuOpen(false);
    };
    window.addEventListener('pointerdown', handler, { passive: true });
    return () => window.removeEventListener('pointerdown', handler as any);
  }, []);

  useEffect(() => { if (data.autoEdit) setEditing(true); }, [data.autoEdit]);

  useEffect(() => {
    if (!editing) return;
    const i = inputRef.current; if (!i) return;
    const focusNow = () => {
      try { (i as any).focus({ preventScroll: true }); } catch { i.focus(); }
      try { const len = i.value.length; i.setSelectionRange(len, len); } catch {}
    };
    focusNow(); requestAnimationFrame(focusNow); const t = setTimeout(focusNow, 60);
    return () => clearTimeout(t);
  }, [editing]);

  const startEdit = () => setEditing(true);
  const finishEdit = () => {
    setEditing(false);
    const trimmed = value.trim();
    data.onChange(id, trimmed.length ? trimmed : 'Untitled');
  };

  return (
    <div
      ref={rootRef}
      className="editable-node"
      style={{
        position: 'relative',
        minWidth: 170,
        maxWidth: 260,
        padding: 10,
        borderRadius: 12,
        background: '#fffbe6',        // заметный фон
        boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
        border: '1px solid #f59e0b',  // заметная граница
        textAlign: 'center',
        touchAction: 'manipulation',
        userSelect: editing ? 'text' : 'none',
      }}
      onDoubleClick={startEdit}
      onContextMenu={onContextMenu}
      onPointerDown={(e) => { e.stopPropagation(); startLongPress(e); }}
      onPointerMove={moveLongPress}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          enterKeyHint="done"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={finishEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') finishEdit(); if (e.key === 'Escape') setEditing(false); }}
          style={{
            width: '100%', outline: 'none', border: '1px solid #d1d5db',
            borderRadius: 8, padding: '6px 8px', fontSize: 14,
          }}
          placeholder="Название задачи"
        />
      ) : (
        <div
          style={{ fontSize: 14, fontWeight: 700, color: '#111827', wordBreak: 'break-word' }}
          onClick={startEdit}
          title="Нажми, чтобы редактировать"
        >
          {data.label || 'Новая задача'}
        </div>
      )}

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      {menuOpen && (
        <div
          style={{
            position: 'absolute', left: '50%', top: '100%', transform: 'translate(-50%, 10px)',
            background: '#bfe3da', border: '1px solid #a7d0c7', borderRadius: 14, width: 280,
            paddingTop: 10, paddingBottom: 6, boxShadow: '0 14px 28px rgba(0,0,0,0.18)',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            style={{
              position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
              borderBottom: '8px solid #bfe3da',
            }}
          />
          <div
            style={{
              marginTop: 120, background: '#e8eeef', borderTop: '1px solid #d5dbdc',
              borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
              display: 'flex', justifyContent: 'space-around', alignItems: 'center',
              padding: '8px 6px', gap: 4,
            }}
          >
            {([
              { key: 'home', icon: '🏠', label: 'домой' },
              { key: 'status', icon: '📌', label: 'статус' },
              { key: 'comments', icon: '💬', label: 'комментарии' },
              { key: 'participant', icon: '👤', label: 'участник' },
              { key: 'conditions', icon: '⚙️', label: 'условия' },
              { key: 'delete', icon: '🗑️', label: 'удалить' },
            ] as const).map((a) => (
              <button
                key={a.key}
                onClick={() => { closeMenu(); data.onAction?.(id, a.key as any); }}
                title={a.label}
                style={{ background: 'transparent', border: 'none', fontSize: 20, padding: '6px 8px', borderRadius: 10 }}
              >
                <span aria-hidden>{a.icon}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const nodeTypes = { editable: EditableNode } as const;

/* ================= Inner ================= */
function GroupProcessInner({ chatId, groupId: rawGroupId }: { chatId: string; groupId: string | null }) {
  const groupId = rawGroupId ? String(rawGroupId) : null;

  const [runMode, setRunMode] = useState<'MANUAL' | 'SCHEDULE'>('MANUAL');
  const [loading, setLoading] = useState(false);
  const [loadInfo, setLoadInfo] = useState<string>('');

  const [nodes, setNodes, onNodesChange] = useNodesState<EditableData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const rfApi = useReactFlow();
  const rfReadyRef = useRef<ReactFlowInstance | null>(null);

  // Диагностика
  useEffect(() => { console.log('[RF] nodes changed →', nodes.length, nodes); }, [nodes]);
  useEffect(() => { console.log('[RF] edges changed →', edges.length, edges); }, [edges]);

  /* ---------- callbacks для нод ---------- */
  const onLabelChange = useCallback((id: string, label: string) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)));
  }, [setNodes]);

  const onNodeAction = useCallback((
    id: string,
    action: 'home' | 'status' | 'comments' | 'participant' | 'conditions' | 'delete'
  ) => {
    if (action === 'delete') {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      return;
    }
    console.log('[NODE ACTION]', action, '→', id);
  }, [setNodes, setEdges]);

  const nodesWithCallbacks = useMemo(
    () => nodes.map((n) => ({ ...n, type: 'editable', data: { ...(n.data || { label: '' }), onChange: onLabelChange, onAction: onNodeAction } })),
    [nodes, onLabelChange, onNodeAction]
  );

  const onConnect = useCallback((connection: Connection) => setEdges((eds) => addEdge(connection, eds)), [setEdges]);

  /* ---------- добавление ноды ---------- */
  const nextIdRef = useRef<number>(1);

  const fitSafe = useCallback((reason: string) => {
    const inst = rfReadyRef.current;
    if (!inst) {
      console.log('[RF] fitView skipped, not ready. reason=', reason);
      return;
    }
    try {
      console.log('[RF] fitView', reason);
      inst.fitView({ padding: 0.2, includeHiddenNodes: true });
    } catch (e) {
      console.warn('[RF] fitView error', e);
    }
  }, []);

  const handleAddNode = useCallback((pos?: { x: number; y: number }) => {
    const id = `n_${nextIdRef.current++}`;
    const position = pos ?? { x: 120 + Math.floor(Math.random() * 80), y: 120 + Math.floor(Math.random() * 60) };

    const newNode: Node<EditableData> = {
      id,
      type: 'editable',
      data: { label: 'Новая задача', onChange: onLabelChange, onAction: onNodeAction, autoEdit: true },
      position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };

    console.log('[PROCESS] handleAddNode', { id, position });
    setNodes((prev) => [...prev, newNode]);
    setTimeout(() => fitSafe('after add'), 60);
  }, [onLabelChange, onNodeAction, setNodes, fitSafe]);

  /* ---------- загрузка/сохранение из API ---------- */
  async function loadProcess() {
    if (!groupId) {
      // Демонстрационные ноды
      const demo: Node<EditableData>[] = [
        {
          id: 'demo_1',
          type: 'editable',
          position: { x: 100, y: 100 },
          data: { label: 'Demo 1', onChange: onLabelChange, onAction: onNodeAction },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        },
        {
          id: 'demo_2',
          type: 'editable',
          position: { x: 320, y: 100 },
          data: { label: 'Demo 2', onChange: onLabelChange, onAction: onNodeAction },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        },
      ];
      setNodes(demo);
      setEdges([{ id: 'e_demo', source: 'demo_1', target: 'demo_2' }]);
      setLoadInfo(`Демо: узлов ${demo.length}, связей 1`);
      setTimeout(() => fitSafe('after demo load'), 120);
      return;
    }

    try {
      setLoading(true);
      setLoadInfo('Загрузка…');
      console.log('[PROCESS] fetchProcess start', { groupId });
      const data = await fetchProcess(groupId);
      console.log('[PROCESS] fetchProcess resp', data);

      if (!data?.ok) {
        setLoadInfo('Ошибка загрузки');
        return;
      }

      const { process, nodes: n = [], edges: e = [] } = data;
      setRunMode(process?.runMode === 'SCHEDULE' ? 'SCHEDULE' : 'MANUAL');

      let rfNodes: Node<EditableData>[];
      let rfEdges: Edge[];

      if (n.length === 0) {
        rfNodes = [
          {
            id: 'seed_1',
            type: 'editable',
            position: { x: 100, y: 100 },
            data: { label: 'Старт', onChange: onLabelChange, onAction: onNodeAction },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          },
          {
            id: 'seed_2',
            type: 'editable',
            position: { x: 320, y: 100 },
            data: { label: 'Следующий шаг', onChange: onLabelChange, onAction: onNodeAction },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          },
        ];
        rfEdges = [{ id: 'seed_e1', source: 'seed_1', target: 'seed_2' }];
      } else {
        rfNodes = n.map((it: any) => ({
          id: String(it.id),
          type: 'editable',
          position: { x: Number(it.posX) || 0, y: Number(it.posY) || 0 },
          data: { label: String(it.title || 'Новая задача'), onChange: onLabelChange, onAction: onNodeAction },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        }));
        rfEdges = e.map((it: any) => ({
          id: String(it.id),
          source: String(it.sourceNodeId),
          target: String(it.targetNodeId),
        }));
      }

      setNodes(rfNodes);
      setEdges(rfEdges);
      setLoadInfo(`Загружено: узлов ${rfNodes.length}, связей ${rfEdges.length}`);

      setTimeout(() => fitSafe('after api load'), 120);
    } catch (err) {
      console.error('[PROCESS] load error', err);
      setLoadInfo('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProcess(); /* eslint-disable-next-line */ }, [groupId]);

  const handleSave = useCallback(async () => {
    if (!groupId) { setLoadInfo('Сохранение доступно только для групп'); return; }
    try {
      setLoading(true); setLoadInfo('Сохранение…');
      const payloadNodes = nodes.map((n, i) => ({
        id: String(n.id),
        title: String((n.data as any)?.label || `Новая задача ${i + 1}`),
        posX: Number(n.position.x) || 0,
        posY: Number(n.position.y) || 0,
        assigneeChatId: null,
      }));
      const payloadEdges = edges.map(e => ({
        id: e.id ? String(e.id) : undefined,
        source: String(e.source),
        target: String(e.target),
      }));
      const resp = await saveProcess({ groupId, chatId, nodes: payloadNodes, edges: payloadEdges });
      setLoadInfo(resp?.ok ? 'Сохранено ✔︎' : 'Ошибка сохранения');
    } catch (e) {
      console.error('[process] save error', e);
      setLoadInfo('Ошибка сети при сохранении');
    } finally { setLoading(false); }
  }, [groupId, chatId, nodes, edges]);

  return (
    <div style={{ height: '100%', minHeight: 360, display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* Панель */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', border: '1px solid #2a3346', borderRadius: 12,
          background: '#f8f9fa', marginBottom: 8, overflowX: 'auto',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, flex: '0 0 auto' }}>🔀 Процесс</div>
        <span style={{ fontSize: 12, color: '#555', whiteSpace: 'nowrap', flex: 1, minWidth: 140 }}>
          {loading ? 'Загрузка…' : loadInfo}
        </span>
        <button onClick={() => setRunMode((m) => (m === 'MANUAL' ? 'SCHEDULE' : 'MANUAL'))}>
          ⚙️ {runMode === 'MANUAL' ? 'По нажатию' : 'По дате'}
        </button>
        <button onClick={handleSave}>💾 Сохранить</button>
        <button onClick={() => { console.log('[PROCESS] topbar PLUS click'); handleAddNode(); }}>➕ Узел</button>
        <button onClick={() => alert('Старт процесса (каркас)')}>▶️ Запуск</button>
      </div>

      {/* Канва */}




{/* растягиваем канву на весь доступный размер */}
<div style={{ flex: 1, minHeight: 0 }}>
  <div
    className="rf-scope"
    style={{
      position: 'relative',
      height: '100%',
      isolation: 'isolate',
      transform: 'none',
      filter: 'none',
      mixBlendMode: 'normal',
    }}
  >
    <ReactFlow
      nodes={nodesWithCallbacks}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      fitView
      connectOnClick
      className="touch-flow"
      panOnDrag={[2]}
      zoomOnPinch={false}
      minZoom={0.2}
      maxZoom={1.5}
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      proOptions={{ hideAttribution: true }}
      /* ← ВАЖНО: задаём размер самой канве */
      style={{ width: '100%', height: '100%', background: '#fff' }}
      onInit={(instance) => {
        rfReadyRef.current = instance;
        console.log('[RF] onInit: ready, viewport=', instance.getViewport());
        setTimeout(() => instance.fitView({ padding: 0.2, includeHiddenNodes: true }), 60);
      }}
      onMoveEnd={(_, vp) => console.log('[RF] moveEnd viewport=', vp)}
      onPaneClick={(e) => {
        const inst = rfReadyRef.current ?? rfApi;
        const pos = inst.project({ x: e.clientX, y: e.clientY });
        console.log('[RF] paneClick at', { clientX: e.clientX, clientY: e.clientY, pos });
        handleAddNode(pos);
      }}
    >
      <Background />
    </ReactFlow>
  </div>
</div>




      </div>
   
  );
}

/* ================= Outer ================= */
export default function GroupProcessPage(props: Props) {
  return (
    <ReactFlowProvider>
      <div
        className="rf-scope"
        style={{ textAlign: 'initial', height: '100%', minHeight: 0 }}
      >
        <GroupProcessInner
          chatId={props.chatId}
          groupId={props.groupId ? String(props.groupId) : null}
        />
      </div>
    </ReactFlowProvider>
  );
}
