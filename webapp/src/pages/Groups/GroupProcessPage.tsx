//GroupProcessPage.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import CondEdge from '../../components/CondEdge';
import RelationsBadge from '../../components/RelationsBadge';
import AssigneeToolbar from '../../components/AssigneeToolbar';

import NodeTopToolbar, { type NodeStatus } from '../../components/NodeTopToolbar';
import StatusPickerModal from '../../components/StatusPickerModal';

import AssigneePickerModal from '../../components/AssigneePickerModal';
import NodeConditionsModal, { type StartCondition, type CancelCondition } from '../../components/NodeConditionsModal';

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

import { fetchProcess, saveProcess, getGroupMembers, getTask, type GroupMember } from '../../api';

/* ================= Types ================= */
 type Props = {
   chatId: string;
   groupId?: string | null;
   persistSeedSession?: boolean;
   onOpenTask: (id: string) => void;
   seedTaskId?: string | null;
   seedAssigneeChatId?: string | null;
   onSeedConsumed?: () => void;
  /** Открыть новое полотно процесса именно для seed-задачи (игнорим процесс группы) */
  forceSeedFromTask?: boolean;
  /** Временная блокировка сохранения, чтобы не перезатереть групповой процесс */
  disableSave?: boolean;

  focusTaskId?: string | null;


  
  // 👇 новое:
  spawnNextForFocus?: boolean;
  onSpawnNextConsumed?: () => void;

 };

type CondEdgeData = { icon?: string };

interface EditableData {
  label: string;
   taskId?: string | null;

  /** Ответственный */
  assigneeName?: string;
  assigneeChatId?: string | null;

  /** Статус карточки (визуальный и сохраняемый) */
  status?: NodeStatus;

  /** Условия узла (храним в metaJson) */
  conditions?: { start: StartCondition; cancel: CancelCondition };

  /** Коллбэки */
  onChange: (id: string, label: string) => void;
  onAction?: (
    id: string,
    action: 'home' | 'status' | 'comments' | 'participant' | 'conditions' | 'delete'
  ) => void;
  onPickAssignee?: (id: string) => void;
  onOpenConditions?: (id: string) => void;
  onOpenStatus?: (id: string) => void;
  autoEdit?: boolean;

  // подписи связей
  prevTitles?: string[];
  nextTitles?: string[];
}

/* ================= Helpers ================= */
function safeParseJson(input: any): any | null {
  if (!input) return null;
  if (typeof input === 'object') return input;
  try {
    return JSON.parse(String(input));
  } catch {
    return null;
  }
}

/** Лимит по видимым юникод-графемам (эмодзи/суррогаты считаются как 1) */
function clampGraphemes(s: string, max = 100) {
  const arr = Array.from(s);
  return arr.length <= max ? s : arr.slice(0, max).join('');
}

/* ======== Custom editable node ======== */
function EditableNode({ id, data, selected }: NodeProps<EditableData>) {
  const rf = useReactFlow();
  const [editing, setEditing] = useState<boolean>(!!data.autoEdit);
  const [value, setValue] = useState<string>(data.label ?? '');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // long-press + ПК click
  const LONG_MS = 550;
  const MOVE_PX = 10;
  const press = useRef<{ tid: number | null; sx: number; sy: number; pid: number | null }>({
    tid: null,
    sx: 0,
    sy: 0,
    pid: null,
  });
  const openMenu = () => setMenuOpen(true);

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



  


  // ПК: открыть меню по левому клику, но не на интерактивах/лейбле
  const onRootClick = (e: React.MouseEvent) => {
    if (editing) return;
    const el = e.target as Element;
    if (el.closest('input,textarea,button,.react-flow__handle,.editable-label')) return;
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

  /** Центрируем текущий узел в вьюпорте (ещё раз — после поднятия клавиатуры) */
  const centerThisNode = () => {
    const node = rf.getNode(id);
    if (!node) return;
    const w = node.width ?? 220;
    const h = node.height ?? 80;
    const cx = (node.positionAbsolute?.x ?? node.position.x) + w / 2;
    const cy = (node.positionAbsolute?.y ?? node.position.y) + h / 2;
    rf.setCenter(cx, cy, { zoom: rf.getZoom(), duration: 250 });
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
      case 'APPROVAL':
        return { bg: '#fff7ed', border: '#f59e0b' };
      case 'WAITING':
        return { bg: '#effaff', border: '#06b6d4' };
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
      onClick={onRootClick}
    >
      {/* ⚙️ + 🏷 сверху — единый тулбар */}
      <NodeTopToolbar
        visible={!!selected}
        currentStatus={data.status || 'NEW'}
        onOpenConditions={() => data.onOpenConditions?.(id)}
        onOpenStatus={() => data.onOpenStatus?.(id)}
      />

      {/* Заголовок */}
      {editing ? (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              border: '1px solid #d1d5db',
              borderRadius: 12,
              background: '#fff',
              padding: 8,
              marginRight: 8,
              maxWidth: '100%',
            }}
          >
            <textarea
              ref={inputRef}
              value={value}
              placeholder="Название задачи"
              onChange={(e) => {
                const next = clampGraphemes(e.target.value, 100);
                setValue(next);
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 160) + 'px';
              }}
              onFocus={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                centerThisNode();
                setTimeout(centerThisNode, 300); // второй раз — после подъёма клавиатуры
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  finishEdit();
                }
                if (e.key === 'Escape') setEditing(false);
              }}
              onBlur={finishEdit}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                resize: 'none',
                background: 'transparent',
                fontSize: 14,
                lineHeight: 1.35,
                padding: '2px 0',
                minHeight: 34,
                maxHeight: 160,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            />

            <button
              onClick={finishEdit}
              disabled={!value.trim()}
              title="Сохранить (Ctrl/⌘+Enter)"
              style={{
                height: 36,
                minWidth: 36,
                padding: '0 10px',
                borderRadius: 10,
                border: '1px solid transparent',
                background: value.trim() ? '#2563eb' : '#94a3b8',
                color: '#fff',
                cursor: value.trim() ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              ➤
            </button>
          </div>

          <div style={{ textAlign: 'right', fontSize: 11, opacity: 0.6, marginTop: 4 }}>
            {Array.from(value).length}/100
          </div>
        </>
      ) : (
        <div
          className="editable-label"
          style={{ fontSize: 14, fontWeight: 700, color: '#111827', wordBreak: 'break-word' }}
          onDoubleClick={startEdit}
          title="Двойной клик — редактировать"
        >
          {data.label || 'Новая задача'}
        </div>
      )}

      {/* Handles */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      {/* связи (вход/выход) */}
      <RelationsBadge prevTitles={data.prevTitles} nextTitles={data.nextTitles} />

      {/* 👤 снизу — выбор исполнителя */}
      <AssigneeToolbar name={data.assigneeName || 'Владелец группы'} onClick={() => data.onPickAssignee?.(id)} />

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
              borderTop: '1px solid #d1d5db',
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
                  setMenuOpen(false);
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
function GroupProcessInner({
  chatId,
  groupId: rawGroupId,
  seedTaskId,
  seedAssigneeChatId,
  onSeedConsumed,
  persistSeedSession,
  disableSave,
  focusTaskId,
  forceSeedFromTask,
  // ↓ новое:
  spawnNextForFocus,
  onSpawnNextConsumed,
}: {
  chatId: string;
  groupId: string | null;
  seedTaskId?: string | null;
  seedAssigneeChatId?: string | null;
  onSeedConsumed?: () => void;
  forceSeedFromTask?: boolean;
  disableSave?: boolean;
  focusTaskId?: string | null;
  persistSeedSession?: boolean; 

  spawnNextForFocus?: boolean;
  onSpawnNextConsumed?: () => void;
}) {




  const groupId = rawGroupId ? String(rawGroupId) : null;

  const [runMode, setRunMode] = useState<'MANUAL' | 'SCHEDULE'>('MANUAL');
  const [loading, setLoading] = useState(false);
  const [loadInfo, setLoadInfo] = useState<string>('');

  // участники группы
  const [owner, setOwner] = useState<GroupMember | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);

  const [nodes, setNodes, onNodesChange] = useNodesState<EditableData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CondEdgeData>([]);

  const rfApi = useReactFlow();
  const { screenToFlowPosition } = rfApi;

  const rfReadyRef = useRef<ReactFlowInstance | null>(null);
    const resaveGuardRef = useRef(false);  

  // модалка статуса
  const [statusPicker, setStatusPicker] = useState<{ open: boolean; nodeId: string | null }>({
    open: false,
    nodeId: null,
  });
























  // подтянуть участников при смене groupId
  useEffect(() => {
    if (!groupId) {
      setOwner(null);
      setMembers([]);
      return;
    }
    getGroupMembers(groupId)
      .then((r) => {
        if (r.ok) {
          setOwner(r.owner || null);
          setMembers(r.members || []);
        }
      })
      .catch(() => {});
  }, [groupId]);

  /* ---------- helpers для ФИО по chatId ---------- */
  const displayNameByChatId = useMemo(() => {
    const map = new Map<string, string>();
    if (owner?.chatId) map.set(String(owner.chatId), owner.name || String(owner.chatId));
    for (const m of members) if (m.chatId) map.set(String(m.chatId), m.name || String(m.chatId));
    return map;
  }, [owner, members]);

  const getAssigneeDisplay = useCallback(
    (assigneeChatId?: string | null, fallback?: string) => {
      if (assigneeChatId && displayNameByChatId.has(String(assigneeChatId))) {
        return displayNameByChatId.get(String(assigneeChatId))!;
      }
      if (fallback && fallback.trim()) return fallback;
      return owner?.name || 'Владелец группы';
    },
    [displayNameByChatId, owner]
  );

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
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== id) return n;
            const cur = (n.data as any)?.status ?? 'NEW';
            const order: NodeStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'APPROVAL', 'WAITING'];
            const next = order[(order.indexOf(cur as NodeStatus) + 1) % order.length];
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
        const aChatId = (n.data as any)?.assigneeChatId as string | null | undefined;
        const aNameStored = (n.data as any)?.assigneeName as string | undefined;

        const display = getAssigneeDisplay(aChatId, aNameStored);

        return {
          ...n,
          type: 'editable',
          data: {
            onOpenStatus: (nid: string) => setStatusPicker({ open: true, nodeId: nid }),
            assigneeName: display,
            assigneeChatId: aChatId ?? null,
            status: (n.data as any)?.status ?? 'NEW',
            conditions: (n.data as any)?.conditions,
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
    [nodes, neighborsById, onLabelChange, onNodeAction, getAssigneeDisplay]
  );

  // === Стилизация рёбер по условиям целевого узла ===
  useEffect(() => {
    setEdges((prev) => {
      if (!prev.length) return prev;

      const nodeById = new Map(nodes.map((n) => [String(n.id), n]));
      let changed = false;

      const next = prev.map((e) => {
        const target = nodeById.get(String(e.target));
        if (!target) return e;

        const cond = (target.data as any)?.conditions || {};
        const startRaw = cond.start;
        const cancelRaw = cond.cancel;

        type StartCond =
          | 'AFTER_ANY'
          | { mode: 'AFTER_SELECTED'; selectedEdges: string[] }
          | { mode: 'ON_DATE'; date: string }
          | { mode: 'ON_DATE_AND_AFTER_SELECTED'; date: string; selectedEdges: string[] }
          | { mode: 'AFTER_MINUTES_AND_AFTER_SELECTED'; minutes: number; selectedEdges: string[] }
          | { mode: 'AFTER_SELECTED_CANCELLED'; selectedEdges: string[] };

        type CancelCond = 'NONE' | { mode: 'CANCEL_IF_ANY_SELECTED_CANCELLED'; selectedEdges: string[] };

        const startMode: StartCond = startRaw || 'AFTER_ANY';
        const cancelMode: CancelCond = cancelRaw || 'NONE';

        const getSelected = (s: any) => (Array.isArray(s?.selectedEdges) ? s.selectedEdges : []);
        const startSelected = typeof startMode === 'object' ? getSelected(startMode) : [];
        const cancelSelected = typeof cancelMode === 'object' ? getSelected(cancelMode) : [];

        const hasExplicit = startSelected.length > 0;
        const isSelectedEdge = hasExplicit ? startSelected.includes(String(e.id)) : true;

        // статус исходной ноды
        const srcNode = nodeById.get(String(e.source));
        const srcStatus = ((srcNode?.data as any)?.status || 'NEW') as import('../../components/NodeTopToolbar').NodeStatus;

        let stroke = '#007BFF';
        let dash: string | undefined;
        let animated = false;

        const iconParts: string[] = [];

        // START rules → зелёные
        if (startMode === 'AFTER_ANY') {
          stroke = '#4CAF50';
          dash = '6 4';
          animated = true;
          iconParts.push('➡️');

          if (srcStatus === 'DONE') {
            dash = undefined;
            animated = false;
            stroke = '#22c55e';
          }
        } else if (typeof startMode === 'object') {
          switch (startMode.mode) {
            case 'AFTER_SELECTED': {
              if (isSelectedEdge) {
                iconParts.push('➡️');
                stroke = '#4CAF50';
                dash = '6 4';
                animated = true;
                if (srcStatus === 'DONE') {
                  dash = undefined;
                  animated = false;
                  stroke = '#22c55e';
                }
              }
              break;
            }
            case 'ON_DATE': {
              iconParts.push('📅');
              stroke = '#4CAF50';
              dash = '6 4';
              animated = true;
              break;
            }
            case 'ON_DATE_AND_AFTER_SELECTED': {
              if (isSelectedEdge) {
                iconParts.push('📅');
                stroke = '#4CAF50';
                dash = '6 4';
                animated = true;
                if (srcStatus === 'DONE') {
                  dash = undefined;
                  animated = false;
                  stroke = '#22c55e';
                }
              }
              break;
            }
            case 'AFTER_MINUTES_AND_AFTER_SELECTED': {
              if (isSelectedEdge) {
                iconParts.push('⏰');
                stroke = '#4CAF50';
                dash = '6 4';
                animated = true;
              }
              break;
            }
            case 'AFTER_SELECTED_CANCELLED': {
              if (isSelectedEdge) {
                iconParts.push('🚫');
                stroke = '#4CAF50';
                dash = '6 4';
                animated = true;
                if (srcStatus === 'CANCELLED') {
                  dash = undefined;
                  animated = false;
                  stroke = '#22c55e';
                }
              }
              break;
            }
          }
        }

        // CANCEL overlay
        if (typeof cancelMode === 'object' && cancelMode.mode === 'CANCEL_IF_ANY_SELECTED_CANCELLED') {
          if (cancelSelected.includes(String(e.id))) {
            iconParts.push('🚫');
            if (srcStatus === 'CANCELLED') {
              stroke = '#ef4444';
              dash = undefined;
              animated = false;
            }
          }
        }

        const style: any = { ...(e.style as any), stroke, strokeWidth: 2, strokeDasharray: dash };
        const label = iconParts.join(' ');
        const data = { ...(e.data as any), icon: label };

        const needUpdate =
          e.animated !== animated ||
          (e.style as any)?.stroke !== style.stroke ||
          (e.style as any)?.strokeDasharray !== style.strokeDasharray ||
          ((e.data as any)?.icon ?? '') !== (label ?? '') ||
          (typeof e.label === 'string' ? e.label : '') !== label;

        if (needUpdate) {
          changed = true;
          return { ...e, animated, style, markerEnd: { type: MarkerType.ArrowClosed }, data, label } as typeof e;
        }
        return e;
      });

      return changed ? next : prev;
    });
  }, [nodes, edges, setEdges]);

  // Автоматический переход статуса узлов по условиям + таймер для "через X минут"
  const startTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const byId = new Map(nodes.map((n) => [String(n.id), n]));
    const incomingByTarget = new Map<string, string[]>(); // target -> edgeIds[]
    edges.forEach((e) => {
      const arr = incomingByTarget.get(String(e.target)) || [];
      arr.push(String(e.id));
      incomingByTarget.set(String(e.target), arr);
    });









// ⬇️ ДОБАВИТЬ: фокус на уже сохранённый процесс по taskId



    const sourceDone = (edgeIds: string[]) =>
      edgeIds.some((eid) => {
        const e = edges.find((x) => String(x.id) === eid);
        const src = e ? byId.get(String(e.source)) : undefined;
        return ((src?.data as any)?.status || 'NEW') === 'DONE';
      });

    const sourceCanceled = (edgeIds: string[]) =>
      edgeIds.some((eid) => {
        const e = edges.find((x) => String(x.id) === eid);
        const src = e ? byId.get(String(e.source)) : undefined;
        return ((src?.data as any)?.status || 'NEW') === 'CANCELLED';
      });

    const updates: Array<{ id: string; status: import('../../components/NodeTopToolbar').NodeStatus }> = [];

    nodes.forEach((n) => {
      const d: any = n.data || {};
      const cur: string = d.status || 'NEW';
      const cond = d.conditions || {};
      const start = (cond.start ?? 'AFTER_ANY') as StartCondition;
      const cancel = (cond.cancel ?? 'NONE') as CancelCondition;
      const incoming = incomingByTarget.get(String(n.id)) || [];

      // отмена
      if (typeof cancel === 'object' && cancel.mode === 'CANCEL_IF_ANY_SELECTED_CANCELLED') {
        const sel = Array.isArray(cancel.selectedEdges) ? cancel.selectedEdges : [];
        if (sel.length > 0 && sourceCanceled(sel) && cur !== 'DONE' && cur !== 'CANCELLED') {
          updates.push({ id: n.id, status: 'CANCELLED' });
          return;
        }
      }

      // старт уже работающих/завершённых не трогаем
      if (cur !== 'NEW' && cur !== 'WAITING') return;

      if (start === 'AFTER_ANY') {
        if (sourceDone(incoming)) updates.push({ id: n.id, status: 'IN_PROGRESS' });
      } else if (typeof start === 'object') {
        const sel =
          typeof start === 'object' && Array.isArray((start as any).selectedEdges)
            ? ((start as any).selectedEdges as string[])
            : incoming;
        switch (start.mode) {
          case 'AFTER_SELECTED':
            if (sourceDone(sel)) updates.push({ id: n.id, status: 'IN_PROGRESS' });
            break;
          case 'AFTER_SELECTED_CANCELLED': {
            if (sourceCanceled(sel)) {
              updates.push({ id: n.id, status: 'IN_PROGRESS' });
            }
            break;
          }
          case 'ON_DATE':
            if (start.date && Date.now() >= Date.parse(start.date)) {
              updates.push({ id: n.id, status: 'IN_PROGRESS' });
            }
            break;
          case 'ON_DATE_AND_AFTER_SELECTED':
            if (start.date && Date.now() >= Date.parse(start.date) && sourceDone(sel)) {
              updates.push({ id: n.id, status: 'IN_PROGRESS' });
            }
            break;
          case 'AFTER_MINUTES_AND_AFTER_SELECTED': {
            if (sourceDone(sel)) {
              const key = String(n.id);
              if (!startTimersRef.current[key]) {
                const ms = Math.max(1, Number(start.minutes || 1)) * 60_000;
                startTimersRef.current[key] = window.setTimeout(() => {
                  setNodes((nds) =>
                    nds.map((x) =>
                      x.id === n.id ? { ...x, data: { ...(x.data as any), status: 'IN_PROGRESS' } } : x
                    )
                  );
                  delete startTimersRef.current[key];
                }, ms);
              }
            }
            break;
          }
        }
      }
    });

    if (updates.length) {
      setNodes((nds) =>
        nds.map((n) => {
          const u = updates.find((x) => x.id === n.id);
          return u ? { ...n, data: { ...(n.data as any), status: u.status } } : n;
        })
      );
    }

    // чистим таймеры у удалённых узлов
    Object.keys(startTimersRef.current).forEach((id) => {
      if (!nodes.some((n) => String(n.id) === id)) {
        window.clearTimeout(startTimersRef.current[id]);
        delete startTimersRef.current[id];
      }
    });

    return () => {};
  }, [nodes, edges, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
const id = `seed_new_${Date.now().toString(36)}_${nextIdRef.current++}`;
      const defaultAssigneeName = owner?.name || 'Владелец группы';
      const defaultAssigneeChatId = owner?.chatId ? String(owner.chatId) : null;

      const newNode: Node<EditableData> = {
        id,
        type: 'editable',
        data: {
          label,
          assigneeName: defaultAssigneeName,
          assigneeChatId: defaultAssigneeChatId,
          onChange: onLabelChange,
          onAction: onNodeAction,
          onPickAssignee: (nid) => setAssigneePicker({ open: true, nodeId: nid }),
          onOpenConditions: (nid) => setCondEditor({ open: true, nodeId: nid }),
          onOpenStatus: (nid) => setStatusPicker({ open: true, nodeId: nid }),
          autoEdit,
        },
        position: pos,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
      setNodes((nds) => [...nds, newNode]);
      return id;
    },
    [onLabelChange, onNodeAction, setNodes, owner]
  );

  const fitSafe = useCallback(() => {
    const inst = rfReadyRef.current;
    if (!inst) return;
    try {
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
        const el = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
        const overHandleOrNode = !!el?.closest?.('.react-flow__handle, .react-flow__node');

        if (!overHandleOrNode && connectingNodeId.current && connectingHandleType.current) {
          const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          const newId = addNodeAt(pos, '', true);

          const source =
            connectingHandleType.current === 'source' ? connectingNodeId.current : newId;
          const target =
            connectingHandleType.current === 'source' ? newId : connectingNodeId.current;

          setEdges((eds) =>
            addEdge(
              {
                id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                source,
                target,
                type: 'cond',
                data: { icon: '➡️' },
                markerEnd: { type: MarkerType.ArrowClosed },
              },
              eds
            )
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


















  


/* ---------- загрузка/сохранение из API ---------- */
const loadProcess = useCallback(async () => {
  setLoading(true);
  try {
    if (!groupId) {
      setLoadInfo('Локальный режим: groupId не задан');
      setLoading(false);
      return;
    }

    const apiData = await fetchProcess(String(groupId));
    if (!apiData?.ok) {
      setLoadInfo('Ошибка загрузки');
      return;
    }

    const { process, nodes: n = [], edges: e = [] } = apiData;
    setRunMode(process?.runMode === 'SCHEDULE' ? 'SCHEDULE' : 'MANUAL');

    let rfNodes: Node<EditableData>[];
    let rfEdges: Edge<CondEdgeData>[];

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
      rfEdges = [{ id: 'seed_e1', source: 'seed_1', target: 'seed_2', type: 'cond', data: {} }];
    } else {
      rfNodes = n.map((it: any) => {
        const meta = safeParseJson(it.metaJson);
        const taskIdFromMeta = meta?.taskId || null;
        const conditions = meta?.conditions || undefined;
        const assigneeName = meta?.assigneeName || undefined;
        const assigneeChatId = it.assigneeChatId ? String(it.assigneeChatId) : null;
        const statusFromDb = String(it.status || 'NEW').toUpperCase() as NodeStatus;

        return {
          id: String(it.id),
          type: 'editable',
          position: { x: Number(it.posX) || 0, y: Number(it.posY) || 0 },
          data: {
            label: String(it.title || 'Новая задача'),
            assigneeName,
            assigneeChatId,
            conditions,
            status: statusFromDb,
            onChange: onLabelChange,
            onAction: onNodeAction,
            taskId: taskIdFromMeta ?? undefined,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        };
      });

      rfEdges = e.map((it: any): Edge<CondEdgeData> => ({
        id: String(it.id),
        source: String(it.sourceNodeId),
        target: String(it.targetNodeId),
        type: 'cond',
        data: {},
      }));
    }

    // Если пришёл запрос «проростить» новый узел справа от фокусируемого
    if (focusTaskId && spawnNextForFocus) {
      const focusNode = rfNodes.find(
        (n) => String(((n.data as any)?.taskId ?? '')) === String(focusTaskId)
      );

      if (focusNode) {
        const gapX = 140;
        const w = (focusNode.width ?? 220);
        const x = (focusNode.position?.x ?? 0) + w + gapX;
        const y = (focusNode.position?.y ?? 0);

        const newId = 'seed_new_' + Date.now().toString(36);
        const newNode: Node<EditableData> = {
          id: newId,
          type: 'editable',
          position: { x, y },
          data: {
            label: '',
            autoEdit: true,
            onChange: onLabelChange,
            onAction: onNodeAction,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        };

        const newEdge: Edge = {
          id: 'seed_e_' + Date.now().toString(36),
          source: String(focusNode.id),
          target: newId,
          type: 'cond',
          data: {},
        };

        rfNodes = [...rfNodes, newNode];
        rfEdges = [...rfEdges, newEdge];
      }
    }

    // 🔸 ЕДИНСТВЕННЫЙ seed-блок: сеансовый режим (BFS вправо от seedTaskId)
    if (seedTaskId && (forceSeedFromTask || persistSeedSession)) {
      const left = rfNodes.find(
        (n) => String(((n.data as any)?.taskId ?? '')) === String(seedTaskId)
      );

      if (left) {
        const outs = new Map<string, Edge[]>(rfNodes.map(n => [String(n.id), [] as Edge[]]));
        rfEdges.forEach(e => {
          const src = String(e.source);
          if (outs.has(src)) outs.get(src)!.push(e);
        });

        const visited = new Set<string>([String(left.id)]);
        const queue: string[] = [String(left.id)];
        const subEdges: Edge[] = [];

        while (queue.length) {
          const cur = queue.shift()!;
          const arr = outs.get(cur) || [];
          for (const e of arr) {
            subEdges.push(e);
            const tid = String(e.target);
            if (!visited.has(tid)) {
              visited.add(tid);
              queue.push(tid);
            }
          }
        }

        let subNodes = rfNodes.filter(n => visited.has(String(n.id)));
        let subEdgesFinal = subEdges;

        const hasChildren = subEdges.some(e => String(e.source) === String(left.id));
        if (!hasChildren) {
          const gapX = 140;
          const w = (left.width ?? 220);
          const newId = 'seed_new_' + Date.now().toString(36);

          const newNode: Node<EditableData> = {
            id: newId,
            type: 'editable',
            position: {
              x: (left.position?.x ?? 100) + w + gapX,
              y: (left.position?.y ?? 100),
            },
            data: { label: '', autoEdit: true, onChange: onLabelChange, onAction: onNodeAction },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          };

          const newEdge: Edge = {
            id: 'seed_e_' + Date.now().toString(36),
            source: String(left.id),
            target: newId,
            type: 'cond',
            data: {},
          };

          subNodes = [...subNodes, newNode];
          subEdgesFinal = [...subEdgesFinal, newEdge];
        }

        setNodes(subNodes);
        setEdges(subEdgesFinal);
        if (!persistSeedSession) onSeedConsumed?.();

        setTimeout(() => {
          const n = rfApi.getNodes().find(x => String(x.id) === String(left.id));
          if (n) {
            const w = n.width ?? 220, h = n.height ?? 80;
            const cx = (n.positionAbsolute?.x ?? n.position.x) + w / 2;
            const cy = (n.positionAbsolute?.y ?? n.position.y) + h / 2;
            rfApi.setCenter(cx, cy, { zoom: Math.min(1.2, rfApi.getZoom() || 1), duration: 380 });
          }
        }, 80);

        setLoadInfo('Режим продолжения от выбранной задачи');
        setTimeout(() => fitSafe(), 60);
        return; // показываем подграф, а не всю группу
      }

      // fallback: задачи ещё нет в графе — «эта задача → пустая»
      try {
        const resp = await getTask(String(seedTaskId));
        const t = resp.task;

        const leftId = 'seed_task_' + String(t.id);
        const rightId = 'seed_new_' + Date.now().toString(36);

        setNodes([
          {
            id: leftId,
            type: 'editable',
            position: { x: 100, y: 100 },
            data: {
              label: clampGraphemes(String(t.text || 'Задача')),
              assigneeName: t.assigneeName || undefined,
              assigneeChatId: (t.assigneeChatId || seedAssigneeChatId || chatId)
                ? String(t.assigneeChatId || seedAssigneeChatId || chatId)
                : null,
              taskId: String(t.id),
              onChange: onLabelChange,
              onAction: onNodeAction,
            },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          },
          {
            id: rightId,
            type: 'editable',
            position: { x: 320, y: 100 },
            data: { label: '', autoEdit: true, onChange: onLabelChange, onAction: onNodeAction },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          },
        ]);

        setEdges([{ id: 'seed_e_' + Date.now(), source: leftId, target: rightId, type: 'cond', data: {} }]);
        if (!persistSeedSession) onSeedConsumed?.();
        setLoadInfo('Создание связки от выбранной задачи');
        setTimeout(() => fitSafe(), 60);
        return;
      } catch {
        // если и это не удалось — пойдём дальше и покажем полный процесс
      }
    }

    // Обычный полный процесс
    setNodes(rfNodes);
    setEdges(rfEdges);
    onSpawnNextConsumed?.();

    if (focusTaskId) {
      setTimeout(() => {
        const n = rfApi.getNodes().find(
          (x: any) => String((x.data as any)?.taskId || '') === String(focusTaskId)
        );
        if (n) {
          const w = n.width ?? 220, h = n.height ?? 80;
          const cx = (n.positionAbsolute?.x ?? n.position.x) + w / 2;
          const cy = (n.positionAbsolute?.y ?? n.position.y) + h / 2;
          rfApi.setCenter(cx, cy, { zoom: Math.min(1.2, rfApi.getZoom() || 1), duration: 400 });
        }
      }, 120);
    }

    setLoadInfo(`Загружено: узлов ${rfNodes.length}, связей ${rfEdges.length}`);
    setTimeout(() => fitSafe(), 120);
  } catch (err) {
    console.error('[PROCESS] load error', err);
    setLoadInfo('Ошибка сети');
  } finally {
    setLoading(false);
  }
}, [
  groupId,
  chatId,
  // флаги/идентификаторы:
  seedTaskId,
  seedAssigneeChatId,
  forceSeedFromTask,
  persistSeedSession,
  focusTaskId,
  spawnNextForFocus,
  // api/ui зависимости:
  rfApi,
  fitSafe,
  onLabelChange,
  onNodeAction,
  onSeedConsumed,
  onSpawnNextConsumed,
]);


useEffect(() => {
  loadProcess();
}, [loadProcess]);




const handleSave = useCallback(async () => {
  if (!groupId) {
    setLoadInfo('Сохранение доступно только для групп');
    return;
  }
  try {
    setLoading(true);
    setLoadInfo('Сохранение…');

    // узлы
    const payloadNodes = nodes.map((n, i) => {
      const d = (n.data || {}) as any;

      const metaJson: any = {};
      if (d.assigneeName) metaJson.assigneeName = d.assigneeName;
      if (d.conditions) metaJson.conditions = d.conditions;
      if (d.taskId) metaJson.taskId = d.taskId; // сохраняем привязку к задаче

      return {
        id: String(n.id),
        title: String(d.label || `Новая задача ${i + 1}`),
        posX: Number(n.position.x) || 0,
        posY: Number(n.position.y) || 0,
        assigneeChatId: d.assigneeChatId != null ? String(d.assigneeChatId) : null,
        createdByChatId: d.createdByChatId != null ? String(d.createdByChatId) : String(chatId),
        type: (d.type === 'EVENT' ? 'EVENT' : 'TASK') as 'EVENT' | 'TASK',
        status: (d.status as string) ?? 'NEW',
        metaJson,
      };
    });

    // рёбра
    const payloadEdges = edges.map((e) => ({
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


    const resp: any = await (saveProcess as any)(body);

    if (resp?.ok) {
      setLoadInfo('Сохранено ✔︎ Обновляю…');
      await loadProcess(); // перечитываем, чтобы подхватить taskId

      // ⬇️ двухфазный трюк: если ещё остались ноды без taskId — один раз досохраним
      setTimeout(async () => {
        try {
          if (resaveGuardRef.current) return;
          const after = rfApi.getNodes();
          const missing = after.filter(n => !((n.data as any)?.taskId));
          if (missing.length > 0) {
            resaveGuardRef.current = true;
            setLoadInfo('Досохраняю новые узлы…');
            // второй вызов сохранит уже «первую волну» с taskId и создаст «вторую»
            await handleSave();
          } else {
            setLoadInfo('Сохранено ✔︎');
          }
        } catch {
          setLoadInfo('Сохранено ✔︎');
        } finally {
          // сбросим флаг спустя немного, чтобы не зациклиться при ручных кликах
          setTimeout(() => { resaveGuardRef.current = false; }, 300);
        }
      }, 0);
    } else {
      setLoadInfo(`Ошибка сохранения${resp?.error ? ': ' + resp.error : ''}`);
    }
  } catch (e: any) {
    console.error('[process] save error', e);
    setLoadInfo(`Ошибка сети при сохранении${e?.message ? ': ' + e.message : ''}`);
  } finally {
    setLoading(false);
  }
}, [groupId, chatId, nodes, edges, runMode, loadProcess, rfApi]);


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

<button
  onClick={handleSave}
  title={disableSave ? 'Сохранение отключено' : 'Сохранить'}
  disabled={!!disableSave}
>
  💾 Сохранить
</button>



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

      {/* Модалка выбора ответственного */}
      {assigneePicker.open && (
        <AssigneePickerModal
          open={assigneePicker.open}
          owner={owner}
          members={members}
          onClose={() => setAssigneePicker({ open: false, nodeId: null })}
          onPick={(m) => {
            if (!assigneePicker.nodeId) return;
            const display = m.name || m.chatId;
            const chatId = m.chatId ? String(m.chatId) : null;
            setNodes((nds) =>
              nds.map((n) =>
                n.id === assigneePicker.nodeId
                  ? { ...n, data: { ...(n.data as any), assigneeName: display, assigneeChatId: chatId } }
                  : n
              )
            );
            setAssigneePicker({ open: false, nodeId: null });
          }}
        />
      )}

      {/* Модалка статуса */}
      {statusPicker.open && (
        <StatusPickerModal
          open={statusPicker.open}
          current={
            ((nodes.find((n) => n.id === statusPicker.nodeId)?.data as any)?.status as NodeStatus) || 'NEW'
          }
          onClose={() => setStatusPicker({ open: false, nodeId: null })}
          onPick={(newStatus) => {
            if (!statusPicker.nodeId) return;
            setNodes((nds) =>
              nds.map((n) =>
                n.id === statusPicker.nodeId ? { ...n, data: { ...(n.data as any), status: newStatus } } : n
              )
            );
          }}
        />
      )}

      {/* Модалка условий */}
      {condEditor.open && (
        <NodeConditionsModal
          open={condEditor.open}
          onClose={() => setCondEditor({ open: false, nodeId: null })}
          onDelete={() => {
            setNodes((nds) => nds.filter((n) => n.id !== condEditor.nodeId));
            setEdges((eds) => eds.filter((e) => e.source !== condEditor.nodeId && e.target !== condEditor.nodeId));
            setCondEditor({ open: false, nodeId: null });
          }}
          onSave={({ start, cancel }) => {
            if (!condEditor.nodeId) return;
            setNodes((nds) =>
              nds.map((n) =>
                n.id === condEditor.nodeId ? { ...n, data: { ...(n.data as any), conditions: { start, cancel } } } : n
              )
            );
            setCondEditor({ open: false, nodeId: null });
          }}
          initialStart={(nodes.find((n) => n.id === condEditor.nodeId)?.data as any)?.conditions?.start}
          initialCancel={(nodes.find((n) => n.id === condEditor.nodeId)?.data as any)?.conditions?.cancel}
          prevEdges={(() => {
            const nid = condEditor.nodeId;
            if (!nid) return [];
            return edges
              .filter((e) => String(e.target) === String(nid))
              .map((e) => ({
                id: String(e.id),
                label: (() => {
                  const srcId = String(e.source);
                  const title = (nodes.find((n) => String(n.id) === srcId)?.data as any)?.label;
                  return title || srcId;
                })(),
              }));
          })()}
        />
      )}
    </div>
  );
}

/* ================= Outer ================= */
 function GroupProcessPage(props: Props) {
   return (
     <ReactFlowProvider>
       <div className="rf-scope" style={{ textAlign: 'initial', height: '100%', minHeight: 0 }}>
<GroupProcessInner
  chatId={props.chatId}
  groupId={props.groupId ? String(props.groupId) : null}
  seedTaskId={props.seedTaskId}
  seedAssigneeChatId={props.seedAssigneeChatId}
  onSeedConsumed={props.onSeedConsumed}
  forceSeedFromTask={props.forceSeedFromTask}
  disableSave={props.disableSave}
  focusTaskId={props.focusTaskId}
    persistSeedSession={props.persistSeedSession}
  // ↓ новое:
  spawnNextForFocus={props.spawnNextForFocus}
  onSpawnNextConsumed={props.onSpawnNextConsumed}
/>

       </div>
     </ReactFlowProvider>
   );
 }

 export default GroupProcessPage;