import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  ReactFlowProvider,
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  MarkerType,
  type Node,
  type Edge,
  type OnConnectStart,
  type Connection,
} from 'reactflow';
import type { FeedTaskCardProps } from '../feed/FeedTaskCard';
import 'reactflow/dist/style.css';
import FeedTaskNode from './FeedTaskNode';
import PreTaskNode from './PreTaskNode';
import CreateTaskModal from '../create-task/CreateTaskModal';
import CondEdge from '../CondEdge';
import { API_BASE, fetchProcess, saveProcess, getTask, getPreTask, getTaskGraph, getTaskRelations, listPreTasks, type ProcessNodeDTO, type ProcessEdgeDTO } from '../../api';
import PreTaskEditModal from '../../components/PreTaskEditModal';
import type { PreTaskDTO } from '../../api';
import './TaskFeedProcessPage.css';

type Props = {
  open: boolean;
  card: (FeedTaskCardProps & { bg?: string; brd?: string; groupId?: string | null }) | null;
  chatId: string;
  onClose: () => void;
};

export default function TaskFeedProcessPage({ open, card, onClose, chatId }: Props) {
  if (!open || !card) return null;
  useEffect(() => {
    try { window.dispatchEvent(new CustomEvent('taskfeed-process-opened')); } catch {}
    return () => { try { window.dispatchEvent(new CustomEvent('taskfeed-process-closed')); } catch {} };
  }, []);
  return (
    <ReactFlowProvider>
      <Inner card={card} onClose={onClose} chatId={chatId} />
    </ReactFlowProvider>
  );
}

function Inner({ card, onClose, chatId }: { card: FeedTaskCardProps & { bg?: string; brd?: string; groupId?: string | null }; onClose: () => void; chatId: string }) {
  const groupId = (card as any)?.groupId ?? null;
  // Если у задачи нет явного groupId (личная группа) — используем task-scope
  // c псевдо-группой `task:<rootTaskId>` для сохранения раскладки.
  const [resolvedGroupId, setResolvedGroupId] = useState<string | null>(
    groupId ? String(groupId) : `task:${String(card.id)}`
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (resolvedGroupId) return;
      try {
        const r: any = await getTask(String(card.id)).catch(() => null);
        const gid = r?.task?.groupId ? String(r.task.groupId) : null;
        if (!cancelled) setResolvedGroupId(gid);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [resolvedGroupId, card.id]);

  const initialNodes = useMemo<Node[]>(() => [
    {
      id: String(card.id),
      type: 'feedTask',
      position: { x: 100, y: 120 },
      data: { card, bg: card.bg, brd: card.brd, meChatId: chatId, groupId },
    },
  ], [card, chatId, groupId]);

  const [nodes, setNodes, rawOnNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const nodeTypes = useMemo(() => ({ feedTask: FeedTaskNode, preTask: PreTaskNode }), []);
  const edgeTypes = useMemo(() => ({ cond: CondEdge }), []);
  const rf = useReactFlow();
  useEffect(() => {
    try { console.log('[TFP] init overlay', { taskId: String(card.id), groupId, resolvedGroupId }); } catch {}
  }, [resolvedGroupId]);

  // Remember viewport to preserve camera between reloads
  const lastViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const applyViewportOrFit = useCallback(() => {
    try {
      const v = lastViewportRef.current;
      if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom)) {
        (rf as any).setViewport?.(v, { duration: 0 });
      } else {
        rf.fitView({ padding: 0.2 });
      }
    } catch {}
  }, [rf]);

  // soft reload trigger (used after status changes to reflect pretask firing)
  const [reloadSeq, setReloadSeq] = useState(0);
  useEffect(() => {
    const onReq = (e: any) => {
      try {
        const d = (e && e.detail) || {};
        console.log('[TFP] reload requested', d);
        // schedule two reloads to catch async firing
        setTimeout(() => setReloadSeq((x) => x + 1), 600);
        setTimeout(() => setReloadSeq((x) => x + 1), 1600);
      } catch {}
    };
    window.addEventListener('process-reload-request', onReq as any);
    return () => window.removeEventListener('process-reload-request', onReq as any);
  }, []);

  // edit modal (listen to external open events like in FeedTaskNode long-press)
  const [editOpen, setEditOpen] = useState(false);
  const [preEditOpen, setPreEditOpen] = useState(false);
  const [preEditData, setPreEditData] = useState<PreTaskDTO | null>(null);
  useEffect(() => {
    const onOpen = () => setEditOpen(true);
    window.addEventListener('edit-task-open', onOpen as any);
    return () => window.removeEventListener('edit-task-open', onOpen as any);
  }, []);

  // open pre-task editor on long-press
  useEffect(() => {
    const onOpen = async (e: Event) => {
      try {
        const ce = e as CustomEvent<any>;
        const id = String(ce?.detail?.preTaskId || '');
        if (!id) return;
        const r: any = await getPreTask(id).catch(() => null);
        const pre = r?.preTask || null;
        if (pre) {
          setPreEditData(pre);
          setPreEditOpen(true);
        }
      } catch {}
    };
    window.addEventListener('edit-pretask-open', onOpen as any);
    return () => window.removeEventListener('edit-pretask-open', onOpen as any);
  }, []);

  // edge selection highlight + focus (robust to race with loading)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const queuedFocusNodeIdRef = useRef<string | null>(null);
  const tryFocusByNode = useCallback((nid: string) => {
    if (!nid) return false;
    const edges = rf.getEdges();
    const targetEdge = edges.find((x) => String(x.source) === nid) || edges.find((x) => String(x.target) === nid) || null;
    if (!targetEdge) return false;
    try { console.log('[TFP] focus edge', { nodeId: nid, edgeId: String(targetEdge.id) }); } catch {}
    setSelectedEdgeId(String(targetEdge.id));
    const src = rf.getNode(String(targetEdge.source));
    const dst = rf.getNode(String(targetEdge.target));
    if (src && dst) {
      try { rf.fitView({ nodes: [src, dst], padding: 0.2 }); } catch {}
    }
    return true;
  }, [rf]);
  useEffect(() => {
    const onFocus = (e: any) => {
      const nid = String(e?.detail?.nodeId || '');
      if (!nid) return;
      if (!tryFocusByNode(nid)) {
        try { console.log('[TFP] focus queued (edges not ready yet)', { nodeId: nid }); } catch {}
        queuedFocusNodeIdRef.current = nid;
        // fallback retry shortly after load
        setTimeout(() => { if (queuedFocusNodeIdRef.current) tryFocusByNode(queuedFocusNodeIdRef.current); }, 220);
      }
    };
    window.addEventListener('focus-process-edge', onFocus as any);
    return () => window.removeEventListener('focus-process-edge', onFocus as any);
  }, [tryFocusByNode]);

  // wrap onNodesChange to detect drag stop and debounce save
  const saveTimer = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const scheduleSaveRef = useRef<() => void>(() => {});
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const [saveBanner, setSaveBanner] = useState<{ status: 'idle'|'saving'|'ok'|'error'; text: string }>({ status: 'idle', text: '' });

  // persistence (define early for use in handlers)
  const persist = useCallback(async () => {
    if (!resolvedGroupId) return;
    try {
      setSaveBanner({ status: 'saving', text: 'Сохранение…' });
      const allNodes = rf.getNodes();
      const allEdges = rf.getEdges();
      const payloadNodes = allNodes.map((n, i) => {
        const d: any = n.data || {};
        const isFeed = d.card && d.card.id;
        const isPre = d.p && d.p.id;
        const title = isFeed ? String(d.card.text || `Задача ${i+1}`) : String(d.p?.text || `Предзадача ${i+1}`);
        const metaJson: any = {};
        if (isPre) metaJson.preTaskId = String(d.p.id);
        if (isFeed) metaJson.kind = 'TASK'; else metaJson.kind = 'PRETASK';
        // persist stable key for task-scope layout snapshots
        try {
          if (String(resolvedGroupId || '').startsWith('task:')) {
            metaJson.key = isFeed ? `task:${String(d.card.id)}` : (isPre ? `pretask:${String(d.p.id)}` : undefined);
          }
        } catch {}
        return {
          id: String(n.id),
          title,
          posX: Number(n.position.x) || 0,
          posY: Number(n.position.y) || 0,
          type: 'TASK' as const,
          status: 'PLANNED',
          taskId: isFeed ? String(d.card.id) : null,
          metaJson,
        };
      });
      const payloadEdges = allEdges.map((e) => ({ id: String(e.id), source: String(e.source), target: String(e.target), enabled: true }));
      const resp = await saveProcess({ groupId: String(resolvedGroupId), chatId: String(chatId), nodes: payloadNodes as any, edges: payloadEdges });
      if (!(resp as any)?.ok) throw new Error((resp as any)?.error || 'process_save_failed');
      dirtyRef.current = false;
      setSaveBanner({ status: 'ok', text: 'Сохранено ✔' });
      setTimeout(() => { setSaveBanner((b) => (b.status === 'ok' ? { status: 'idle', text: '' } : b)); }, 1200);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[TaskFeedProcess] save failed', e);
      setSaveBanner({ status: 'error', text: 'Ошибка сохранения — повтор…' });
      throw e;
    }
  }, [nodes, edges, resolvedGroupId, chatId, rf]);

  const runSave = useCallback(() => {
    if (savingRef.current) { queuedRef.current = true; return; }
    savingRef.current = true;
    queuedRef.current = false;
    Promise.resolve()
      .then(() => persist())
      .catch(() => {})
      .finally(() => {
        savingRef.current = false;
        if (queuedRef.current) {
          queuedRef.current = false;
          setTimeout(() => runSave(), 50);
        }
      });
  }, [persist]);

  const onNodesChange = useCallback((changes: any) => {
    rawOnNodesChange(changes);
    // save only on drag stop
    if (changes?.some?.((c: any) => c.type === 'position' && c.dragging === false)) { dirtyRef.current = true; scheduleSaveRef.current(); }
  }, [rawOnNodesChange]);

  // pointer flow: connect start → drop in empty → open pretask panel (CreateTaskModal) via global event
  const connectingNodeId = useRef<string | null>(null);
  const connectingHandleType = useRef<'source' | 'target' | null>(null);
  const pointerUpHandler = useRef<((e: PointerEvent) => void) | null>(null);
  const detachPointerUp = () => { if (pointerUpHandler.current) { window.removeEventListener('pointerup', pointerUpHandler.current); pointerUpHandler.current = null; } };

  // store last drop to position created pre-task
  const pendingDropRef = useRef<null | { sourceTaskId: string; dropAt: { x: number; y: number }; text: string }>(null);

  const onConnectStart: OnConnectStart = useCallback((_, params) => {
    try { console.log('[TFP] onConnectStart', { nodeId: params?.nodeId, handleType: params?.handleType }); } catch {}
    connectingNodeId.current = params?.nodeId ?? null;
    connectingHandleType.current = (params?.handleType as any) ?? null;
    detachPointerUp();
    pointerUpHandler.current = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
      const overHandleOrNode = !!el?.closest?.('.react-flow__handle, .react-flow__node');
      if (!overHandleOrNode && connectingNodeId.current && connectingHandleType.current === 'source') {
        const src = connectingNodeId.current;
        const nd = nodes.find((n) => n.id === src);
        if (!nd) { connectingNodeId.current = null; connectingHandleType.current = null; detachPointerUp(); return; }
        const isTask = nd.type === 'feedTask';
        const isPre = nd.type === 'preTask';
        if (!isTask && !isPre) { connectingNodeId.current = null; connectingHandleType.current = null; detachPointerUp(); return; }
        const text = isTask
          ? String((nd as any)?.data?.card?.text || '')
          : String((nd as any)?.data?.p?.text || '');
        const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        pendingDropRef.current = { sourceTaskId: src, dropAt: pos, text };
        try {
          const scopeIsTask = !!resolvedGroupId && String(resolvedGroupId).startsWith('task:');
          const phase = isTask ? String((nd as any)?.data?.card?.phase || '') : '';
          const isDone = String(phase).toLowerCase() === 'done' || phase === 'Done';
          if (isTask && isDone) {
            console.log('[TFP] drop in empty from DONE → create TASK', { sourceId: src, pos });
            const detail = { taskId: src, text, groupId: scopeIsTask ? null : resolvedGroupId };
            window.dispatchEvent(new CustomEvent('edge-task-open', { detail }));
          } else {
            console.log('[TFP] drop in empty → open PRETASK panel', { sourceId: src, from: isTask ? 'task' : 'pretask', pos, text, groupId: scopeIsTask ? null : resolvedGroupId });
            const detail = isTask ? { taskId: src, text, groupId: scopeIsTask ? null : resolvedGroupId } : { preTaskId: src, text, groupId: scopeIsTask ? null : resolvedGroupId };
            window.dispatchEvent(new CustomEvent('edge-pre-open', { detail }));
          }
        } catch {}
      }
      connectingNodeId.current = null; connectingHandleType.current = null; detachPointerUp();
    };
    window.addEventListener('pointerup', pointerUpHandler.current as any, { passive: true, once: true } as any);
  }, [nodes, rf, groupId]);

  const onConnect = useCallback((conn: Connection) => {
    try { console.log('[TFP] onConnect add edge', conn); } catch {}
    setEdges((eds) => addEdge({ ...conn, id: `e_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, type: 'cond', data: { icon: '➡️' }, markerEnd: { type: MarkerType.ArrowClosed } } as any, eds));
    dirtyRef.current = true;
    scheduleSaveRef.current();
    // force immediate save to avoid losing edges if user leaves instantly
    setTimeout(() => { if (dirtyRef.current) runSave(); }, 10);
  }, [setEdges, runSave]);

  // listen for pre-task created globally (CreateTaskModal) and add node at last drop point
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const ce = e as CustomEvent<any>;
        const d = (ce && ce.detail) || {};
        const pre = d?.preTask;
        const parentsTask: string[] = Array.isArray(d?.parentTaskIds) ? d.parentTaskIds.map(String) : [];
        const parentsPre: string[] = Array.isArray(d?.parentPreTaskIds) ? d.parentPreTaskIds.map(String) : [];
        try { console.log('[TFP] pre-task-created event', { preId: pre?.id, parentsTask, parentsPre }); } catch {}
        const ctx = pendingDropRef.current;
        if (!pre || !ctx) return;
        const srcId = String(ctx.sourceTaskId);
        if (!parentsTask.includes(srcId) && !parentsPre.includes(srcId)) return;
        const nid = String(pre.id);
        setNodes((nds: any) => ([...nds, { id: nid, type: 'preTask', position: ctx.dropAt, data: { p: pre } }]));
        setEdges((eds: any) => addEdge({ id: `e_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, source: srcId, target: nid, type: 'cond', data: { icon: '➡️' }, markerEnd: { type: MarkerType.ArrowClosed } } as any, eds));
        dirtyRef.current = true;
        scheduleSaveRef.current();
        // force immediate save as well (two-phase to ensure RF state applied)
        setTimeout(() => { if (dirtyRef.current) runSave(); }, 20);
        setTimeout(() => { if (dirtyRef.current) runSave(); }, 140);
      } finally {
        pendingDropRef.current = null;
      }
    };
    window.addEventListener('pre-task-created', handler as any);
    return () => window.removeEventListener('pre-task-created', handler as any);
  }, [setNodes, setEdges, runSave]);

  // listen for task created (from DONE source) and add node at last drop point
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const ce = e as CustomEvent<any>;
        const d = (ce && ce.detail) || {};
        const taskId = String(d?.taskId || '');
        const parentTaskId = String(d?.parentTaskId || '');
        if (!taskId || !parentTaskId) return;
        const ctx = pendingDropRef.current;
        if (!ctx) return;
        const srcId = String(ctx.sourceTaskId || '');
        if (srcId !== parentTaskId) return;
        const nid = String(taskId);
        const pos = ctx.dropAt || { x: 220, y: 180 };
        // Add feedTask stub and edge
        setNodes((nds: any) => ([...nds, { id: nid, type: 'feedTask', position: pos, data: { card: { id: nid, text: '', fromProcess: true, group: (card as any)?.group || null }, bg: '#fff', brd: '#e5e7eb', groupId, meChatId: String(chatId) } }]));
        setEdges((eds: any) => addEdge({ id: `e_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, source: srcId, target: nid, type: 'cond', data: { icon: '➡️' }, markerEnd: { type: MarkerType.ArrowClosed } } as any, eds));
        dirtyRef.current = true;
        scheduleSaveRef.current();
        setTimeout(() => { if (dirtyRef.current) runSave(); }, 20);
        setTimeout(() => { if (dirtyRef.current) runSave(); }, 140);
        // fetch real task and update card data
        getTask(nid).then((resp:any)=>{ if (resp?.ok) setNodes((nds)=> nds.map((x)=> x.id===nid ? ({...x, data:{ ...(x.data as any), card: mapTaskToFeedCard({ ...(resp.task||{}), phase: resp.phase }, (card as any)?.group) }}) : x)); }).catch(()=>{});
      } finally {
        pendingDropRef.current = null;
      }
    };
    window.addEventListener('task-created', handler as any);
    return () => window.removeEventListener('task-created', handler as any);
  }, [setNodes, setEdges, runSave, groupId, card, chatId]);

  // flush on unmount if dirty
  useEffect(() => {
    return () => { if (dirtyRef.current) { try { runSave(); } catch {} } };
  }, [runSave]);


  // define scheduleSave with access to latest persist
  useEffect(() => {
    scheduleSaveRef.current = () => {
      if (!resolvedGroupId) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => { try { console.log('[TFP] debounce save fire'); } catch {} ; runSave(); }, 450);
    };
  }, [resolvedGroupId, runSave]);

  // load on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!resolvedGroupId) return;
        // Task-scope: use server graph endpoint and skip fetchProcess
        if (String(resolvedGroupId).startsWith('task:')) {
          const rootTaskId = String(resolvedGroupId).slice('task:'.length);
          console.log('[TFP] load task graph', { taskId: rootTaskId });
          const g = await getTaskGraph(rootTaskId).catch(() => null);
          if (!mounted || !g?.ok) return;
          const rfNodes: Node[] = [];
          const rfEdges: Edge[] = [];
          const pos = (g.positions || {}) as Record<string, { x: number; y: number }>;
          const tasksById = new Map(g.tasks.map((t:any)=> [String(t.id), t]));
          const presById = new Map(g.pretasks.map((p:any)=> [String(p.id), p]));
          const rootId = String(card.id);
          const makeTask = (tid:string, preferKey?: string, useFeedCard: boolean = false) => {
            const text = tasksById.get(tid)?.text || '';
            const key = preferKey || `task:${tid}`;
            const p = pos[key] || pos[`task:${tid}`] || { x: 100, y: 120 };
            const baseCard:any = useFeedCard ? (card as any) : { id: tid, text, isEvent: false, fromProcess: true, badge: null, dateLine: null, deadline: null, nextReminderAt: null, acceptCondition: 'NONE', bounty: null, group: (card as any)?.group || null, labels: [], assignee: { name: null } };
            rfNodes.push({ id: tid, type: 'feedTask', position: p, data: { card: baseCard, bg: '#fff', brd: '#e5e7eb', groupId, meChatId: String(chatId) } as any });
            // Для корневой задачи оставляем точную копию из ленты; для остальных — подтягиваем детали
            if (String(tid) !== rootId) {
              getTask(tid).then((resp:any)=>{ if (resp?.ok) setNodes((nds)=> nds.map((x)=> x.id===tid ? ({...x, data:{ ...(x.data as any), card: mapTaskToFeedCard({ ...(resp.task||{}), phase: resp.phase }, (card as any)?.group) }}) : x)); }).catch(()=>{});
            }
          };
          const makePre = (pid:string) => {
            const text = presById.get(pid)?.text || '';
            const key = `pretask:${pid}`;
            const p = pos[key] || { x: 220, y: 180 };
            rfNodes.push({ id: pid, type: 'preTask', position: p, data: { p: { id: pid, text, creatorChatId: chatId, status: 'ARMED', triggerMode: 'AFTER_ALL_DONE' } } as any });
            getPreTask(pid).then((resp:any)=>{ if (resp?.ok && resp.preTask) setNodes((nds)=> nds.map((x)=> x.id===pid ? ({...x, data:{ ...(x.data as any), p: resp.preTask }}) : x)); }).catch(()=>{});
          };
          // nodes — корень рисуем точной копией из ленты
          makeTask(rootTaskId, undefined, true);
          // синхронизируем фазу/детали корня с сервера (во избежание рассинхронов с фидом)
          try {
            getTask(String(rootTaskId)).then((resp:any)=>{
              if (resp?.ok) {
                setNodes((nds)=> nds.map((x)=> x.id===rootTaskId ? ({...x, data:{ ...(x.data as any), card: mapTaskToFeedCard({ ...(resp.task||{}), phase: resp.phase }, (card as any)?.group) }}) : x));
              }
            }).catch(()=>{});
          } catch {}
          for (const t of g.tasks) if (String(t.id) !== rootTaskId) makeTask(String(t.id));
          for (const p of g.pretasks) {
            const pid = String(p.id);
            const st = String((p as any).status || '')
            const tgt = (p as any).targetTaskId ? String((p as any).targetTaskId) : null;
            if (st === 'FIRED' && tgt) {
              // рисуем сразу реальную задачу на месте бывшей предзадачи
              makeTask(tgt, `pretask:${pid}`);
              continue;
            }
            makePre(pid);
          }
          // edges
          for (const e of g.edges) {
            const sid = String(e.source).startsWith('task:') ? String(e.source).slice(5) : String(e.source).slice(8);
            const tid = String(e.target).startsWith('task:') ? String(e.target).slice(5) : String(e.target).slice(8);
            rfEdges.push({ id: `e_${String(e.source)}_${String(e.target)}`, source: sid, target: tid, type: 'cond', data: { icon: '➡️' }, markerEnd: { type: MarkerType.ArrowClosed } } as any);
          }

          // Position tweaks for newly created pre-tasks without saved positions:
          // If there is no saved position for `pretask:<id>`, place it relative to its parent
          // with an offset of (-100px, -50px) so it appears left and slightly up.
          try {
            const nodeById = new Map<string, any>(rfNodes.map((n:any) => [String(n.id), n]));
            for (const p of g.pretasks as any[]) {
              const pid = String((p as any).id);
              const key = `pretask:${pid}`;
              if (pos[key]) continue; // server already saved position
              const incoming = (g.edges as any[]).find((ed:any) => String(ed.target) === key);
              if (!incoming) continue;
              const srcKey = String(incoming.source);
              const srcId = srcKey.startsWith('task:') ? srcKey.slice(5) : srcKey.slice(8);
              const parent = nodeById.get(srcId);
              const cur = nodeById.get(pid);
              if (parent && cur && parent.position) {
                const px = Number(parent.position.x) || 0;
                const py = Number(parent.position.y) || 0;
                // Смещение вправо и вверх: +150 по X, -100 по Y
                cur.position = { x: px + 150, y: py - 100 };
              }
            }

            // Tasks without saved positions: offset relative to their parents too
            for (const e of (g.edges as any[])) {
              const srcKey = String(e.source || '');
              const tgtKey = String(e.target || '');
              const sid = srcKey.startsWith('task:') ? srcKey.slice(5) : (srcKey.startsWith('pretask:') ? srcKey.slice(8) : null);
              const tid = tgtKey.startsWith('task:') ? tgtKey.slice(5) : null;
              if (!sid || !tid) continue; // only position task targets here
              const hasSaved = Boolean(pos[tgtKey] || pos[`task:${tid}`]);
              if (hasSaved) continue;
              const parent = nodeById.get(String(sid));
              const cur = nodeById.get(String(tid));
              if (parent && cur && parent.position) {
                const px = Number(parent.position.x) || 0;
                const py = Number(parent.position.y) || 0;
                cur.position = { x: px + 150, y: py - 100 };
              }
            }
          } catch {}

          setNodes(rfNodes);
          setEdges(rfEdges);
          console.log('[TFP] graph (server) hydrated', { nodes: rfNodes.length, edges: rfEdges.length });
          setTimeout(() => { applyViewportOrFit(); }, 60);
          return;
        }
        console.log('[TFP] fetchProcess start', { groupId: resolvedGroupId });
        const r = await fetchProcess(String(resolvedGroupId));
        if (!mounted || !r?.ok) return;
        console.log('[TFP] fetchProcess ok', { nodes: (r.nodes||[]).length, edges: (r.edges||[]).length });

        const dbNodes = (r.nodes || []) as ProcessNodeDTO[];
        const dbEdges = (r.edges || []) as ProcessEdgeDTO[];

        const dbIdToClient = new Map<string, string>();
        const rfNodes: Node[] = [];

        for (const n of dbNodes) {
          const taskId = (n as any).taskId || null;
          const preId = (n?.metaJson && (n.metaJson as any).preTaskId) ? String((n.metaJson as any).preTaskId) : null;
          const clientId = taskId ? String(taskId) : (preId ? String(preId) : String(n.id));
          dbIdToClient.set(String(n.id), clientId);

          if (taskId) {
            // feedTask node stub
            const stubCard: FeedTaskCardProps = { id: String(taskId), text: String(n.title || ''), isEvent: false, fromProcess: true, badge: null, dateLine: null, deadline: null, nextReminderAt: null, acceptCondition: 'NONE', bounty: null, group: (card as any)?.group || null, labels: [], assignee: { name: null } } as any;
            rfNodes.push({ id: clientId, type: 'feedTask', position: { x: n.posX || 0, y: n.posY || 0 }, data: { card: stubCard, bg: '#fff', brd: '#e5e7eb', groupId, meChatId: String(chatId) } as any });
            // lazy fetch real task
            getTask(String(taskId)).then((resp: any) => {
              if (!resp?.ok) return;
              setNodes((nds) => nds.map((x) => x.id === clientId ? ({ ...x, data: { ...(x.data as any), card: mapTaskToFeedCard({ ...(resp.task||{}), phase: resp.phase }, (card as any)?.group) } }) : x));
            }).catch(() => {});
          } else if (preId) {
            rfNodes.push({ id: clientId, type: 'preTask', position: { x: n.posX || 0, y: n.posY || 0 }, data: { p: { id: preId, text: String(n.title || ''), creatorChatId: chatId, status: 'ARMED', triggerMode: 'AFTER_ALL_DONE' } } as any });
            getPreTask(String(preId)).then((resp: any) => {
              if (!resp?.ok || !resp.preTask) return;
              setNodes((nds) => nds.map((x) => x.id === clientId ? ({ ...x, data: { ...(x.data as any), p: resp.preTask } }) : x));
            }).catch(() => {});
          }
        }

        // ensure origin card exists exactly once
        if (!rfNodes.some((n) => n.id === String(card.id))) {
          rfNodes.unshift({ id: String(card.id), type: 'feedTask', position: { x: 100, y: 120 }, data: { card, bg: card.bg, brd: card.brd, meChatId: chatId, groupId } as any });
        }

        const rfEdges: Edge[] = dbEdges.map((e) => ({
          id: `e_${String(e.id)}`,
          source: dbIdToClient.get(String(e.sourceNodeId)) || String(e.sourceNodeId),
          target: dbIdToClient.get(String(e.targetNodeId)) || String(e.targetNodeId),
          type: 'cond',
          data: { icon: '➡️' },
          markerEnd: { type: MarkerType.ArrowClosed },
        }));

        setNodes(rfNodes);
        setEdges(rfEdges);
        console.log('[TFP] graph hydrated', { rfNodes: rfNodes.length, rfEdges: rfEdges.length });
        // ensure viewport fits the loaded graph
        setTimeout(() => { applyViewportOrFit(); }, 80);
        // sync root task phase/details from server to avoid stale phase from feed
        try {
          getTask(String(card.id)).then((resp:any)=>{
            if (resp?.ok) {
              setNodes((nds)=> nds.map((x)=> x.id===String(card.id) ? ({...x, data:{ ...(x.data as any), card: mapTaskToFeedCard({ ...(resp.task||{}), phase: resp.phase }, (card as any)?.group) }}) : x));
            }
          }).catch(()=>{});
        } catch {}

        // If task-scope — synthesize full history graph around root task
        if (String(resolvedGroupId).startsWith('task:')) {
          const rootTaskId = String(resolvedGroupId).slice('task:'.length);
          try {
            const rel: any = await getTaskRelations(rootTaskId).catch(() => null);
            const preList: any = await listPreTasks({ chatId: String(chatId), status: ['PREVIEW','ARMED','FIRED'] as any }).catch(() => null);
            const outgoing: any[] = (rel && rel.outgoing) || [];
            const incoming: any[] = (rel && rel.incoming) || [];
            const allPre: any[] = (preList && preList.preTasks) || [];

            const currNodes = rf.getNodes();
            const currEdges = rf.getEdges();
            const ids = new Set<string>(currNodes.map(n => String(n.id)));
            const tasksToEnsure = new Set<string>();
            const edgesToEnsure: Array<{ id: string; source: string; target: string }> = [];

            outgoing.forEach((t:any)=>{ const id=String(t.id); tasksToEnsure.add(id); edgesToEnsure.push({ id:`synth_t_${rootTaskId}_${id}`, source:rootTaskId, target:id }); });
            incoming.forEach((t:any)=>{ const id=String(t.id); tasksToEnsure.add(id); edgesToEnsure.push({ id:`synth_t_${id}_${rootTaskId}`, source:id, target:rootTaskId }); });

            // только прямые предзадачи корневой задачи
            const directPre = allPre.filter((p:any)=> Array.isArray(p.links) && p.links.some((l:any)=> String(l.taskId||'')===rootTaskId));
            // только те FIRED-предзадачи, которые были привязаны к корневой задаче (а не все подряд)
            const firedOfRoot = allPre.filter((p:any)=> String(p.status||'')==='FIRED' && (p.links||[]).some((l:any)=> String(l.taskId||'')===rootTaskId));
            const firedIds = new Set<string>(firedOfRoot.map((p:any)=>String(p.id)));
            const afterFired = allPre.filter((p:any)=> Array.isArray(p.links) && p.links.some((l:any)=> firedIds.has(String(l.depPreTaskId||l.preTaskId||''))));

            const addPreNode = (p:any) => {
              const pid = String(p.id);
              if (!ids.has(pid)) {
                rfNodes.push({ id: pid, type: 'preTask', position: { x: 120, y: 200 }, data: { p } } as any);
                ids.add(pid);
              }
            };
            directPre.forEach((p:any)=>{ addPreNode(p); edgesToEnsure.push({ id:`synth_p_${rootTaskId}_${p.id}`, source:rootTaskId, target:String(p.id) }); });
            firedOfRoot.forEach((p:any)=>{
              addPreNode(p);
              // корневая задача -> fired предзадача
              edgesToEnsure.push({ id:`synth_pf_${rootTaskId}_${p.id}`, source:rootTaskId, target:String(p.id) });
              // fired предзадача -> созданная задача (если есть)
              const tgt=String(p.targetTaskId||'');
              if (tgt && tgt !== rootTaskId) {
                tasksToEnsure.add(tgt);
                edgesToEnsure.push({ id:`synth_pt_${p.id}_${tgt}`, source:String(p.id), target:tgt });
              }
            });
            afterFired.forEach((p:any)=>{ addPreNode(p); const deps=(p.links||[]).map((l:any)=> String(l.depPreTaskId||l.preTaskId||'')); deps.filter((x:string)=> firedIds.has(x)).forEach((fid:string)=> edgesToEnsure.push({ id:`synth_pp_${fid}_${p.id}`, source:fid, target:String(p.id) })); });

            for (const tid of tasksToEnsure) {
              if (!tid || ids.has(tid)) continue;
              const stub: any = { id: tid, text: '', isEvent: false, fromProcess: true, badge: null, dateLine: null, deadline: null, nextReminderAt: null, acceptCondition: 'NONE', bounty: null, group: (card as any)?.group || null, labels: [], assignee: { name: null } };
              rfNodes.push({ id: tid, type: 'feedTask', position: { x: 280, y: 220 }, data: { card: stub, bg: '#fff', brd: '#e5e7eb', groupId } as any });
              ids.add(tid);
              getTask(String(tid)).then((resp:any)=>{ if (resp?.ok) setNodes((nds)=> nds.map((x)=> x.id===tid ? ({...x, data: { ...(x.data as any), card: mapTaskToFeedCard(resp.task, (card as any)?.group) }}) : x)); }).catch(()=>{});
            }

            const existing = new Set(currEdges.map(e=> String(e.id)));
            edgesToEnsure.forEach((e)=>{ if (!existing.has(e.id)) rfEdges.push({ id:e.id, source:e.source, target:e.target, type:'cond', data:{ icon:'➡️' }, markerEnd:{ type: MarkerType.ArrowClosed } } as any); });

            if (mounted) {
              setNodes(rfNodes.slice());
              setEdges(rfEdges.slice());
              console.log('[TFP] synth task-scope', { nodes: rfNodes.length, edges: rfEdges.length });
              setTimeout(() => { applyViewportOrFit(); }, 60);
            }
          } catch (e) {
            console.warn('[TFP] synth task-scope failed', e);
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[TaskFeedProcess] load failed', e);
      }
    })();
    return () => { mounted = false; };
  }, [resolvedGroupId, card, chatId, setNodes, setEdges, rf, reloadSeq]);

  // SSE: when a pretask fires into a task, update the canvas inline
  useEffect(() => {
    if (!chatId) return;
    let es: EventSource | null = null;
    try {
      const url = `${API_BASE}/sse/stream?chatId=${encodeURIComponent(String(chatId))}`;
      es = new EventSource(url);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data || '{}');
          if (data && data.type === 'task_fired') {
            const preId = String(data.preId || '');
            const taskId = String(data.taskId || '');
            if (!preId || !taskId) return;
            const n = rf.getNode(preId);
            if (!n) return; // not on current canvas
            const pos = n.position || { x: 160, y: 160 };
            setNodes((nds: any[]) => nds.map((x: any) => (x.id === preId
              ? ({ id: taskId, type: 'feedTask', position: pos, data: { card: { id: taskId, text: '', fromProcess: true, group: (card as any)?.group || null }, bg: '#fff', brd: '#e5e7eb', groupId, meChatId: String(chatId) } })
              : x)));
            setEdges((eds: any[]) => eds.map((e: any) => ({
              ...e,
              source: String(e.source) === preId ? taskId : e.source,
              target: String(e.target) === preId ? taskId : e.target,
            })));
            getTask(taskId).then((resp: any) => {
              if (!resp?.ok) return;
              setNodes((nds: any[]) => nds.map((x: any) => (x.id === taskId ? ({ ...x, data: { ...(x.data as any), card: mapTaskToFeedCard({ ...(resp.task || {}), phase: resp.phase }, (card as any)?.group) } }) : x)));
            }).catch(() => {});
            // Сохраним процесс без задержки, чтобы позиция зафиксировалась до возможного перезагруза графа
            dirtyRef.current = true;
            try { runSave(); } catch { try { scheduleSaveRef.current?.(); } catch {} }
          }
        } catch {}
      };
      es.onerror = () => { try { es && es.close(); } catch {}; es = null; };
    } catch {}
    return () => { try { es && es.close(); } catch {} };
  }, [chatId, rf, groupId, runSave]);

  // render
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        background: '#0f1216',
        color: '#e8eaed',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }} className="rf-feed-scope">
        <ReactFlow
          nodes={nodes}
          edges={edges.map((e) => (e.id === selectedEdgeId ? { ...e, className: 'selected' } as any : e))}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onMoveEnd={(_e: any, viewport: any) => { try { if (viewport) lastViewportRef.current = viewport; } catch {} }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
        </ReactFlow>
        {saveBanner.status !== 'idle' && (
          <div style={{ position:'absolute', left: 10, top: 10, background: saveBanner.status==='error' ? '#7f1d1d' : (saveBanner.status==='saving' ? '#1f2937':'#064e3b'), color:'#fff', border:'1px solid rgba(255,255,255,.2)', borderRadius: 10, padding:'4px 10px', fontSize:12, boxShadow:'0 4px 10px rgba(0,0,0,.2)' }}>
            {saveBanner.text}
          </div>
        )}
      </div>

      {/* FAB back button */}
      <button
        onClick={onClose}
        aria-label="Назад"
        style={{
          position: 'fixed',
          left: '50%',
          bottom: `calc(18px + env(safe-area-inset-bottom, 0px))`,
          transform: 'translateX(-50%)',
          width: 56,
          height: 56,
          borderRadius: 28,
          border: 'none',
          background: '#2563eb',
          color: '#fff',
          boxShadow: '0 10px 24px rgba(0,0,0,.35)',
          fontSize: 22,
          lineHeight: '56px',
          textAlign: 'center',
          cursor: 'pointer',
          zIndex: 3200,
        }}
      >
        ⟵
      </button>

      {/* Task editor modal */}
      <CreateTaskModal open={editOpen} onClose={() => setEditOpen(false)} chatId={chatId} />

      <PreTaskEditModal
        open={preEditOpen}
        chatId={chatId}
        preTask={preEditData}
        onClose={() => { setPreEditOpen(false); setPreEditData(null); }}
        onSaved={() => {
          try { setReloadSeq((x) => x + 1); } catch {}
        }}
      />

      {/* Pre-task creation handled via CreateTaskModal (edge-pre-open) */}
    </div>
  );
}

function mapTaskToFeedCard(t: any, group: any): FeedTaskCardProps {
  const rawPhase = String((t as any)?.phase || (t as any)?.status || '').trim();
  const low = rawPhase.toLowerCase();
  const phase = (['inbox','новые','новое'].includes(low)) ? 'Inbox'
    : (['doing','в работе'].includes(low)) ? 'Doing'
    : (['done','готово','готов'].includes(low)) ? 'Done'
    : (['cancel','отмена','отменено','отменена'].includes(low)) ? 'Cancel'
    : (['approval','согласование','на согласовании'].includes(low)) ? 'Approval'
    : (['wait','ждет','ждёт','ожидание'].includes(low)) ? 'Wait'
    : (rawPhase || 'Inbox');

  const badge = ((): any => {
    switch (phase) {
      case 'Inbox':    return { text: '🌱 Новое',     bg: '#F3F4F6', fg: '#111827', brd: '#E5E7EB' };
      case 'Done':     return { text: '✓ Готово',     bg: '#D1F2DC', fg: '#0f5132', brd: '#A3DFB9' };
      case 'Cancel':   return { text: '❌ Отмена',     bg: '#FDDCDC', fg: '#7a1f1f', brd: '#F3B3B3' };
      case 'Doing':    {
        const prog = Number((t as any)?.progress ?? 0);
        const txt = prog > 0 ? `(${prog}% ) 🔨 В работе` : '🔨 В работе';
        return { text: txt, bg: '#D7E6FF', fg: '#123a7a', brd: '#BBD6FF' };
      }
      case 'Approval': return { text: '👉👈 Согласов', bg: '#FFE9CC', fg: '#6b3d06', brd: '#FFD59A' };
      case 'Wait':     return { text: '🥶 Ждёт',       bg: '#E0F2FF', fg: '#063f5c', brd: '#B9E4FF' };
      default:         return null;
    }
  })();

  const card = {
    id: t.id,
    text: t.text,
    isEvent: String(t.type || '').toUpperCase() === 'EVENT',
    fromProcess: !!(t.fromProcess || t.originPreTaskId),
    phase,
    badge,
    dateLine: null,
    deadline: t.deadlineAt ? { iso: t.deadlineAt, leftText: '', overdue: new Date(t.deadlineAt).getTime() < Date.now() } : null,
    nextReminderAt: t.nextReminderAt || null,
    acceptCondition: (t.acceptCondition || 'NONE'),
    bounty: t.bountyStars ? { stars: t.bountyStars, status: t.bountyStatus || 'NONE' } : null,
    group: group || { title: t.groupTitle || '', public: !!t.isPublicGroup, chipBg: '#1b2234' },
    labels: Array.isArray(t.labels) ? t.labels.map((l: any) => l.title) : (Array.isArray(t.labelTitles) ? t.labelTitles : []),
    assignee: { name: t.assigneeName || null },
  } as FeedTaskCardProps;
  return card;
}
