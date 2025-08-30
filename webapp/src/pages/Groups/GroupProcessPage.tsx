// src/pages/Groups/GroupProcessPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import CondEdge from '../../components/CondEdge';
import RelationsBadge from '../../components/RelationsBadge';

import { MarkerType } from 'reactflow';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Position,
  Handle,
  addEdge,
  type Edge,
  type Node,
  type NodeProps,
  type Connection,
  type ReactFlowInstance,
  type XYPosition,
  type OnConnectStart,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './GroupProcessPage.css';

import { fetchProcess, saveProcess } from '../../api';

/* ================= Types ================= */
type Props = {
  chatId: string;
  groupId?: string | null;
  onOpenTask: (id: string) => void;
};

interface EditableData {
  label: string;
  assigneeName?: string; // исполнитель (по умолчанию владелец)
  status?: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  onChange: (id: string, label: string) => void;
  onAction?: (
    id: string,
    action: 'home' | 'status' | 'comments' | 'participant' | 'conditions' | 'delete'
  ) => void;
  onPickAssignee?: (id: string) => void;
  onOpenConditions?: (id: string) => void;
  autoEdit?: boolean;

  // добавили подписи связей
  prevTitles?: string[];
  nextTitles?: string[];
}

/* ======== Custom editable node (mobile long-press menu) ======== */
function EditableNode({ id, data }: NodeProps<EditableData>) {
  const [editing, setEditing] = useState<boolean>(!!data.autoEdit);
  const [value, setValue] = useState<string>(data.label ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // --- long-press
  const LONG_MS = 550;
  const MOVE_PX = 10;
  const press = useRef<{ tid: number | null; sx: number; sy: number; pid: number | null }>({
    tid: null,
    sx: 0,
    sy: 0,
    pid: null,
  });
  const openMenu = () => setMenuOpen(true);
  const closeMenu = () => setMenuOpen(false);

  const startLongPress = (e: React.PointerEvent) => {
    if (editing) return;
    if ((e.target as Element).closest('.react-flow__handle')) return;
    press.current.sx = e.clientX;
    press.current.sy = e.clientY;
    press.current.pid = e.pointerId;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    if (press.current.tid) window.clearTimeout(press.current.tid);
    press.current.tid = window.setTimeout(openMenu, LONG_MS);
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
    press.current.tid = null;
    press.current.pid = null;
  };
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu();
  };

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

  useEffect(() => {
    if (data.autoEdit) setEditing(true);
  }, [data.autoEdit]);

  useEffect(() => {
    if (!editing) return;
    const i = inputRef.current;
    if (!i) return;
    const focusNow = () => {
      try {
        (i as any).focus({ preventScroll: true });
      } catch {
        i.focus();
      }
      try {
        const len = i.value.length;
        i.setSelectionRange(len, len);
      } catch {}
    };
    focusNow();
    requestAnimationFrame(focusNow);
    const t = setTimeout(focusNow, 60);
    return () => clearTimeout(t);
  }, [editing]);

  const startEdit = () => setEditing(true);
  const finishEdit = () => {
    setEditing(false);
    const trimmed = value.trim();
    data.onChange(id, trimmed.length ? trimmed : 'Untitled');
  };

  // цвета по статусу
  const stylesByStatus = (() => {
    switch (data.status) {
      case 'DONE':
        return { bg: '#e8fff1', border: '#22c55e' };
      case 'IN_PROGRESS':
        return { bg: '#eef6ff', border: '#3b82f6' };
      case 'CANCELLED':
        return { bg: '#fff0f0', border: '#ef4444' };
      default:
        return { bg: '#ffffff', border: '#e5e7eb' };
    }
  })();

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        minWidth: 160,
        maxWidth: 260,
        padding: 10,
        borderRadius: 12,
        background: stylesByStatus.bg,
        boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
        border: `1px solid ${stylesByStatus.border}`,
        textAlign: 'center',
        touchAction: 'manipulation',
        userSelect: editing ? 'text' : 'none',
      }}
      onDoubleClick={startEdit}
      onContextMenu={onContextMenu}
      onPointerDown={(e) => {
        e.stopPropagation();
        startLongPress(e);
      }}
      onPointerMove={moveLongPress}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
    >
      {/* верхняя строка: ⚙️ */}
      <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 6 }}>
        <button
          onClick={() => data.onOpenConditions?.(id)}
          title="Условия запуска/отмены"
          style={{ background: 'transparent', border: 'none', fontSize: 16 }}
        >
          ⚙️
        </button>
      </div>

      {editing ? (
        <>
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            enterKeyHint="done"
            value={value}
            maxLength={100}
            onChange={(e) => setValue(e.target.value)}
            onBlur={finishEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{
              width: '100%',
              outline: 'none',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              padding: '6px 8px',
              fontSize: 14,
            }}
            placeholder="Название задачи"
          />
          <div style={{ textAlign: 'right', fontSize: 11, opacity: 0.6, marginTop: 4 }}>
            {value.length}/100
          </div>
        </>
      ) : (
        <div
          style={{ fontSize: 14, fontWeight: 700, color: '#111827', wordBreak: 'break-word' }}
          onClick={startEdit}
          title="Нажми, чтобы редактировать"
        >
          {data.label || 'Новая задача'}
        </div>
      )}

      {/* Handles */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      {/* футер: исполнитель */}
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          justifyContent: 'center',
        }}
      >
        <button
          onClick={() => data.onPickAssignee?.(id)}
          title="Выбрать исполнителя"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          👤
        </button>
        <div style={{ fontSize: 12, color: '#111827' }}>{data.assigneeName || 'Владелец группы'}</div>
      </div>

      {/* связи (вход/выход) */}
      <RelationsBadge prevTitles={data.prevTitles} nextTitles={data.nextTitles} />

      {/* Long-press меню */}
      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '100%',
            transform: 'translate(-50%, 10px)',
            background: '#bfe3da',
            border: '1px solid #a7d0c7',
            borderRadius: 14,
            width: 280,
            paddingTop: 10,
            paddingBottom: 6,
            boxShadow: '0 14px 28px rgba(0,0,0,0.18)',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            style={{
              position: 'absolute',
              top: -8,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderBottom: '8px solid #bfe3da',
            }}
          />
          <div
            style={{
              marginTop: 120,
              background: '#e8eeef',
              borderTop: '1px solid #d5dbdc',
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
              padding: '8px 6px',
              gap: 4,
            }}
          >
            {(
              [
                { key: 'home', icon: '🏠', label: 'домой' },
                { key: 'status', icon: '📌', label: 'статус' },
                { key: 'comments', icon: '💬', label: 'комментарии' },
                { key: 'participant', icon: '👤', label: 'участник' },
                { key: 'conditions', icon: '⚙️', label: 'условия' },
                { key: 'delete', icon: '🗑️', label: 'удалить' },
              ] as const
            ).map((a) => (
              <button
                key={a.key}
                onClick={() => {
                  closeMenu();
                  data.onAction?.(id, a.key as any);
                }}
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
const edgeTypes = { cond: CondEdge } as const;

/* ================= Inner ================= */
function GroupProcessInner({ chatId, groupId: rawGroupId }: { chatId: string; groupId: string | null }) {
  const groupId = rawGroupId ? String(rawGroupId) : null;

  const [runMode, setRunMode] = useState<'MANUAL' | 'SCHEDULE'>('MANUAL');
  const [loading, setLoading] = useState(false);
  const [loadInfo, setLoadInfo] = useState<string>('');

  const [nodes, setNodes, onNodesChange] = useNodesState<EditableData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const rfApi = useReactFlow();
  const { screenToFlowPosition } = rfApi;

  const rfReadyRef = useRef<ReactFlowInstance | null>(null);

  // Диагностика
  useEffect(() => {
    console.log('[RF] nodes changed →', nodes.length, nodes);
  }, [nodes]);
  useEffect(() => {
    console.log('[RF] edges changed →', edges.length, edges);
  }, [edges]);

  /* ---------- callbacks для нод ---------- */
  const onLabelChange = useCallback(
    (id: string, label: string) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)));
    },
    [setNodes]
  );

  const onNodeAction = useCallback(
    (
      id: string,
      action: 'home' | 'status' | 'comments' | 'participant' | 'conditions' | 'delete'
    ) => {
      if (action === 'delete') {
        setNodes((nds) => nds.filter((n) => n.id !== id));
        setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
        return;
      }
      if (action === 'status') {
        // цикл статусов для демо
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== id) return n;
            const cur = (n.data as any)?.status ?? 'NEW';
            const order: EditableData['status'][] = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
            const next = order[(order.indexOf(cur as any) + 1) % order.length];
            return { ...n, data: { ...n.data, status: next } };
          })
        );
        return;
      }
      if (action === 'participant') {
        setAssigneePicker({ open: true, nodeId: id });
        return;
      }
      if (action === 'conditions') {
        setCondEditor({ open: true, nodeId: id });
        return;
      }
      console.log('[NODE ACTION]', action, '→', id);
    },
    [setNodes, setEdges]
  );

  const [assigneePicker, setAssigneePicker] = useState<{ open: boolean; nodeId: string | null }>({
    open: false,
    nodeId: null,
  });
  const [condEditor, setCondEditor] = useState<{ open: boolean; nodeId: string | null }>({
    open: false,
    nodeId: null,
  });

  // заголовки и связи для бейджа
  const titleById = useMemo(
    () => new Map(nodes.map((n) => [n.id, String((n.data as any)?.label || '')])),
    [nodes]
  );

  const neighborsById = useMemo(() => {
    const map = new Map<string, { prev: string[]; next: string[] }>();
    for (const n of nodes) map.set(n.id, { prev: [], next: [] });
    for (const e of edges) {
      const src = String(e.source);
      const tgt = String(e.target);
      const srcTitle = titleById.get(src) || src;
      const tgtTitle = titleById.get(tgt) || tgt;
      map.get(src)?.next.push(tgtTitle);
      map.get(tgt)?.prev.push(srcTitle);
    }
    return map;
  }, [nodes, edges, titleById]);

  const nodesWithCallbacks = useMemo(
    () =>
      nodes.map((n) => {
        const rel = neighborsById.get(n.id) || { prev: [], next: [] };
        return {
          ...n,
          type: 'editable',
          data: {
            assigneeName: (n.data as any)?.assigneeName || 'Владелец группы',
            status: (n.data as any)?.status ?? 'NEW',
            ...(n.data || { label: '' }),
            onChange: onLabelChange,
            onAction: onNodeAction,
            onPickAssignee: (nid: string) => setAssigneePicker({ open: true, nodeId: nid }),
            onOpenConditions: (nid: string) => setCondEditor({ open: true, nodeId: nid }),
            prevTitles: rel.prev,
            nextTitles: rel.next,
          },
        };
      }),
    [nodes, neighborsById, onLabelChange, onNodeAction]
  );

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: 'cond',
            data: { icon: '➡️' },
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds
        )
      ),
    [setEdges]
  );

  /* ---------- добавление ноды ---------- */
  const nextIdRef = useRef<number>(1);

  const addNodeAt = useCallback(
    (pos: XYPosition, label = '', autoEdit = false) => {
      const id = `n_${nextIdRef.current++}`;
      const newNode: Node<EditableData> = {
        id,
        type: 'editable',
        data: {
          label,
          assigneeName: 'Владелец группы',
          onChange: onLabelChange,
          onAction: onNodeAction,
          onPickAssignee: (nid) => setAssigneePicker({ open: true, nodeId: nid }),
          onOpenConditions: (nid) => setCondEditor({ open: true, nodeId: nid }),
          autoEdit,
        },
        position: pos,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
      setNodes((nds) => [...nds, newNode]);
      return id;
    },
    [onLabelChange, onNodeAction, setNodes]
  );

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

  /* ---------- touch: create node on edge-drop in empty space ---------- */
  const connectingNodeId = useRef<string | null>(null);
  const connectingHandleType = useRef<'source' | 'target' | null>(null);
  const pointerUpHandler = useRef<((e: PointerEvent) => void) | null>(null);

  const detachPointerUp = () => {
    if (pointerUpHandler.current) {
      window.removeEventListener('pointerup', pointerUpHandler.current);
      pointerUpHandler.current = null;
    }
  };

  const onConnectStart: OnConnectStart = useCallback(
    (_, params) => {
      connectingNodeId.current = params?.nodeId ?? null;
      connectingHandleType.current = (params?.handleType as 'source' | 'target' | undefined) ?? null;

      detachPointerUp();
      pointerUpHandler.current = (e: PointerEvent) => {
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const newId = addNodeAt(pos, '', true);

        const el = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
        const overHandleOrNode = !!el?.closest?.('.react-flow__handle, .react-flow__node');
        if (!overHandleOrNode && connectingNodeId.current && connectingHandleType.current) {
          const source = connectingHandleType.current === 'source' ? connectingNodeId.current : newId;
          const target = connectingHandleType.current === 'source' ? newId : connectingNodeId.current;
          setEdges((eds) =>
            addEdge({ id: `e_${Date.now()}`, source, target, type: 'cond', data: { icon: '➡️' } }, eds)
          );
        }
        connectingNodeId.current = null;
        connectingHandleType.current = null;
        detachPointerUp();
      };

      window.addEventListener('pointerup', pointerUpHandler.current, { passive: true, once: true });
    },
    [addNodeAt, screenToFlowPosition, setEdges]
  );

  useEffect(() => () => detachPointerUp(), []);

  /* ---------- загрузка/сохранение из API ---------- */
  async function loadProcess() {
    if (!groupId) {
      // Демонстрация, если группа не выбрана
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
      setEdges([{ id: 'e_demo', source: 'demo_1', target: 'demo_2', type: 'cond' }]);
      setLoadInfo(`Демо: узлов ${demo.length}, связей 1`);
      setTimeout(() => fitSafe('after demo load'), 120);
      return;
    }

    try {
      setLoading(true);
      setLoadInfo('Загрузка…');
      const data = await fetchProcess(groupId);

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
        rfEdges = [{ id: 'seed_e1', source: 'seed_1', target: 'seed_2', type: 'cond' }];
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
          type: 'cond',
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

  useEffect(() => {
    loadProcess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const handleSave = useCallback(async () => {
    if (!groupId) {
      setLoadInfo('Сохранение доступно только для групп');
      return;
    }
    try {
      setLoading(true);
      setLoadInfo('Сохранение…');

      // helper: если id временный (n_* / e_*), не отправляем его — бэкенд сам создаст



const payloadNodes = nodes.map((n, i) => ({
  id: String(n.id), // 👈 передаём clientId для ремапа на сервере
  title: String((n.data as any)?.label || `Новая задача ${i + 1}`),
  posX: Number(n.position.x) || 0,
  posY: Number(n.position.y) || 0,
  status: (n.data as any)?.status ?? 'NEW',
}));


const payloadEdges = edges.map((e) => ({
  // id не отправляем
  source: String(e.source),
  target: String(e.target),
}));






      const body = {
        groupId,
        chatId,
        process: { runMode },
        nodes: payloadNodes,
        edges: payloadEdges,
      };

      const resp = await saveProcess(body as any);
      setLoadInfo(resp?.ok ? 'Сохранено ✔︎' : `Ошибка сохранения${resp?.message ? ': ' + resp.message : ''}`);
    } catch (e: any) {
      console.error('[process] save error', e);
      setLoadInfo(`Ошибка сети при сохранении${e?.message ? ': ' + e.message : ''}`);
    } finally {
      setLoading(false);
    }
  }, [groupId, chatId, nodes, edges, runMode]);

  return (
    <div style={{ height: '100%', minHeight: 360, display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* Панель */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          border: '1px solid #2a3346',
          borderRadius: 12,
          background: '#f8f9fa',
          marginBottom: 8,
          overflowX: 'auto',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, flex: '0 0 auto' }}>🔀 Процесс</div>
        <span style={{ fontSize: 12, color: '#555', whiteSpace: 'nowrap', flex: 1, minWidth: 140 }}>
          {loading ? 'Загрузка…' : loadInfo}
        </span>

        <button onClick={() => setRunMode((m) => (m === 'MANUAL' ? 'SCHEDULE' : 'MANUAL'))} title="Режим запуска">
          ⚙️ {runMode === 'MANUAL' ? 'По нажатию' : 'По дате'}
        </button>

        {runMode === 'MANUAL' ? (
          <button
            onClick={() => {
              const ok = confirm('Внимание: все задачи перезапустятся заново, незавершённые будут удалены. Запустить?');
              if (!ok) return;
              alert('Старт процесса (заглушка)');
            }}
            title="Старт процесса"
          >
            ▶️ Старт
          </button>
        ) : (
          <button
            onClick={() => {
              alert('Настройка расписания (заглушка)');
            }}
            title="Настроить расписание"
          >
            📅 Настроить
          </button>
        )}

        <button onClick={handleSave}>💾 Сохранить</button>
        <button
          onClick={() => {
            const vpCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            const pos = screenToFlowPosition(vpCenter);
            addNodeAt(pos, '', true);
          }}
        >
          ➕ Узел
        </button>
      </div>

      {/* Канва */}
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
            onConnectStart={onConnectStart}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            connectOnClick




            className="touch-flow"
            panOnDrag={[2]}
            zoomOnPinch={false}
            minZoom={0.2}
            maxZoom={1.5}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            proOptions={{ hideAttribution: true }}
            style={{ width: '100%', height: '100%', background: '#fff' }}
            defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
            onInit={(instance) => {
              rfReadyRef.current = instance;
              setTimeout(() => instance.fitView({ padding: 0.2, includeHiddenNodes: true }), 60);
            }}
          >
            <Background />
          </ReactFlow>
        </div>
      </div>

      {/* Диалог выбора исполнителя (заглушка) */}
      {assigneePicker.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.25)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setAssigneePicker({ open: false, nodeId: null })}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 16, minWidth: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Выбрать исполнителя</div>
            {/* TODO: список участников группы */}
            <button
              onClick={() => {
                // TODO: записать выбранного в data.assigneeName
                setAssigneePicker({ open: false, nodeId: null });
              }}
            >
              Ок
            </button>
          </div>
        </div>
      )}

      {/* Диалог условий ⚙️ (заглушка структуры из ТЗ) */}
      {condEditor.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.25)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setCondEditor({ open: false, nodeId: null })}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 16, minWidth: 320, maxWidth: '92vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Условия запуска</div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Блок “условия запуска”</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>После завершения любой связанной</li>
                <li>После выбранных связей (с чекбоксами)</li>
                <li>В дату (📅)</li>
                <li>В дату (📅) и После выбранных связей</li>
                <li>Через X дней (⏰) + После выбранных связей</li>
              </ul>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Блок “условия отмены”</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>Отменить, если одна из выбранных отменена (с чекбоксами)</li>
              </ul>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button
                style={{ color: '#ef4444' }}
                onClick={() => {
                  // удалить узел
                  setNodes((nds) => nds.filter((n) => n.id !== condEditor.nodeId));
                  setEdges((eds) => eds.filter((e) => e.source !== condEditor.nodeId && e.target !== condEditor.nodeId));
                  setCondEditor({ open: false, nodeId: null });
                }}
              >
                🗑️ Удалить узел
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setCondEditor({ open: false, nodeId: null })}>Отмена</button>
                <button
                  onClick={() => {
                    // TODO: сохранить выбранные условия
                    setCondEditor({ open: false, nodeId: null });
                  }}
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= Outer ================= */
export default function GroupProcessPage(props: Props) {
  return (
    <ReactFlowProvider>
      <div className="rf-scope" style={{ textAlign: 'initial', height: '100%', minHeight: 0 }}>
        <GroupProcessInner chatId={props.chatId} groupId={props.groupId ? String(props.groupId) : null} />
      </div>
    </ReactFlowProvider>
  );
}
