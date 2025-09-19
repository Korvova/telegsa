import { useEffect, useMemo, useRef, useState } from 'react';
import TonWalletConnect from '../TonWalletConnect';
import DeadlinePicker from '../DeadlinePicker';
import CameraCaptureModal from '../CameraCaptureModal';
import RemindersModal from '../RemindersModal';
import BountyPicker from '../BountyPicker';
import VoiceRecorder from '../VoiceRecorder';
import PostCreateActionsLauncher from '../PostCreateActionsLauncher';
import ExistingMedia from './ExistingMedia';
import AttachBar from './AttachBar';
import TextComposer from './TextComposer';
import useAudioPreview from './hooks/useAudioPreview';
import useTonPayment from './hooks/useTonPayment';
import PreTaskActionsLauncher from './PreTask/PreTaskActionsLauncher';
import AcceptConditionsModal from './AcceptConditionsModal';
import GroupPicker from './GroupPicker';
import RobotPicker from './robots/RobotPicker';
import WeatherScheduleModal from './robots/WeatherScheduleModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import WebApp from '@twa-dev/sdk';
import {
  attachTaskLabels,
  createTask,
  deleteTask,
  fetchBoard,
  getTaskLabels,
  getGroupLabels,
  getGroupMembers,
  listGroups,
  moveTask,
  setTaskDeadline,
  setAcceptCondition,
  updateTask,
  removeTaskLabel,
  transcribeVoice,
  type Group,
  type GroupMember,
  type GroupLabel,
  uploadTaskMedia,
} from '../../api';
import { createTaskReminder, deleteTaskReminder, listTaskReminders, type ReminderTarget, type TaskReminder as RItem } from '../../api/reminders';

type PreConfig = {
  links: Array<{ taskId?: string; preTaskId?: string }>;
  mode: 'AFTER_ALL_DONE' | 'DATE_PLUS' | 'DELAY_AFTER' | 'AFTER_ALL_CANCELED';
  startAt?: string | null;
  delayMinutes?: number | null;
  autoCancelOnAny?: boolean;
  plannedAssigneeChatId?: string | null;
};

type MemberOption = { chatId: string; name: string };

export default function CreateTaskModal({
  open,
  onClose,
  chatId,
  defaultGroupId = null,
  groups: groupsProp,
  onCreated,
  initialEdge,
  initialEdit,
}: {
  open: boolean;
  onClose: () => void;
  chatId: string;
  defaultGroupId?: string | null;
  groups?: Group[];
  onCreated?: () => void;
  initialEdge?: { text: string; groupId: string | null; links: Array<{ taskId?: string; preTaskId?: string }>; mode?: string; startAt?: string | null; delayMinutes?: number | null; autoCancelOnAny?: boolean };
  initialEdit?: any;
}) {
  const [text, setText] = useState('');
  const [_busy, setBusy] = useState(false);
  const [groups, setGroups] = useState<Group[]>(groupsProp || []);
  const [groupId, setGroupId] = useState<string | null>(defaultGroupId ?? null);

  const [members, setMembers] = useState<MemberOption[]>([]);
  const membersAsOptions: MemberOption[] = members.map(m => ({ chatId: m.chatId, name: m.name }));
  const [groupLabels, setGroupLabels] = useState<GroupLabel[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);

  // attachments
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileAnyRef = useRef<HTMLInputElement | null>(null);
  const filePhotoRef = useRef<HTMLInputElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [remindersDraft, setRemindersDraft] = useState<{ target: ReminderTarget; fireAtIso: string }[]>([]);

  // accept conditions
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptCondition, setAcceptConditionState] = useState<'NONE' | 'PHOTO' | 'APPROVAL' | 'PHOTO_AND_APPROVAL' | 'DOC_AND_APPROVAL'>('NONE');

  // tools panel
  const [toolsOpen, setToolsOpen] = useState(false);

  // bounty
  const [bountyOpen, setBountyOpen] = useState(false);
  const [bountyAmount, setBountyAmount] = useState<number>(0);
  const [bountyRub, setBountyRub] = useState<number | null>(null);
  const [_bountyLocked, setBountyLocked] = useState<boolean>(false);

  // pretask config
  const [preCfg, setPreCfg] = useState<PreConfig | null>(null);
  const [edgeContext, setEdgeContext] = useState<null | { kind: 'TASK' | 'PRETASK'; text: string }>(null);
  const [robotOpen, setRobotOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);

  // edit mode
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const isEdit = !!editTaskId;
  const [_editOrigGroupId, setEditOrigGroupId] = useState<string | null>(null);
  const [existingMedia, setExistingMedia] = useState<{ id:string; url:string; kind:string; fileName?:string }[]>([]);

  const isSimpleMode = useMemo(() => true, []);
  const canSend = text.trim().length > 0 || pendingFiles.length > 0;
  const { startPayment, refund, loadDraft, clearDraft } = useTonPayment(chatId);

  // focus helpers
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusText = () => { try { setTimeout(() => textAreaRef.current?.focus(), 0); } catch {} };

  // load groups if empty
  useEffect(() => { (async () => { try { if (!groupsProp || groupsProp.length === 0) { const r = await listGroups(chatId); if ((r as any)?.ok) setGroups((r as any).groups); } } catch {} })(); }, [chatId]);

  // focus input on open (for [+] button scenario)
  useEffect(() => { if (open) { try { setTimeout(() => { focusText(); }, 0); } catch {} } }, [open]);

  // apply initialEdge if provided (race-safe when event was emitted before modal mount)
  useEffect(() => {
    if (!open || !initialEdge) return;
    try {
      setPreCfg({
        links: initialEdge.links || [],
        mode: (initialEdge.mode as any) || 'AFTER_ALL_DONE',
        startAt: initialEdge.startAt ?? null,
        delayMinutes: initialEdge.delayMinutes ?? null,
        autoCancelOnAny: !!initialEdge.autoCancelOnAny,
        plannedAssigneeChatId: null,
      });
      setEdgeContext({ kind: (initialEdge.links||[]).some(l=>l.preTaskId)?'PRETASK':'TASK', text: initialEdge.text || '' });
      // по свайпу поле не заполняем текстом — только фокус для ввода
      setText('');
      setGroupId(initialEdge.groupId ?? null);
      setTimeout(() => { focusText(); }, 0);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialEdge]);

  // apply initialEdit if provided
  useEffect(() => {
    if (!open || !initialEdit) return;
    try {
      const d = initialEdit || {};
      const taskId: string = String(d.taskId || '');
      if (!taskId) return;
      setEditTaskId(taskId);
      setText(String(d.text || ''));
      setGroupId((d.groupId ?? null) as string | null);
      setEditOrigGroupId((d.groupId ?? null) as string | null);
      setDeadlineAt(d.deadlineAt || null);
      setAcceptConditionState((d.acceptCondition as any) || 'NONE');
      setTimeout(() => { focusText(); }, 0);
    } catch {}
  }, [open, initialEdit]);

  // load members for group (or self)
  useEffect(() => {
    let cancelled = false;
    async function loadMembers() {
      if (!groupId) {
        const meName = WebApp?.initDataUnsafe?.user ? [WebApp.initDataUnsafe.user.first_name, WebApp.initDataUnsafe.user.last_name].filter(Boolean).join(' ') : String(chatId);
        if (!cancelled) setMembers([{ chatId, name: meName || String(chatId) }]);
        return;
      }
      try {
        const r = await getGroupMembers(groupId);
        if (!r.ok) throw new Error('members_load_failed');
        const owner = r.owner ? [r.owner] : [];
        const raw: GroupMember[] = [...owner, ...(r.members || [])];
        const uniq = new Map<string, MemberOption>();
        raw.forEach((m) => { if (!m?.chatId) return; const nm = (m.name || String(m.chatId)).trim(); uniq.set(String(m.chatId), { chatId: String(m.chatId), name: nm || String(m.chatId) }); });
        if (!cancelled) { const arr = Array.from(uniq.values()); setMembers(arr.length ? arr : [{ chatId, name: 'Я' }]); }
      } catch { if (!cancelled) setMembers([{ chatId, name: 'Я' }]); }
    }
    loadMembers();
    return () => { cancelled = true; };
  }, [groupId, chatId]);

  // load group labels
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!groupId) { setGroupLabels([]); setSelectedLabelId(null); return; }
      try {
        setLabelsLoading(true);
        const labs = await getGroupLabels(groupId);
        if (!cancelled) setGroupLabels(labs);
      } finally { if (!cancelled) setLabelsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  function groupLabel() {
    if (!groupId) return 'Моя группа';
    const g = groups.find(g => g.id === groupId);
    if (!g) return 'Группа';
    const isTg = (g as any)?.title?.startsWith?.('tg::');
    const isPublic = (g as any)?.isPublic === true;
    const icon = isPublic ? '🌍 ' : (isTg ? '➡️📁 ' : '📁 ');
    return icon + (g.title || 'Группа');
  }

  // pick files handlers
  function onPickFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files);
    setPendingFiles(prev => [...prev, ...arr]);
    focusText();
  }
  function openCamera() { setCameraOpen(true); }

  // stt (transcribe)
  const firstAudio = useMemo(() => pendingFiles.find(f => f.type.startsWith('audio/')) || null, [pendingFiles]);
  const { url: audioPreviewUrl } = useAudioPreview(firstAudio);
  const [sttBusy, setSttBusy] = useState(false);
  async function handleTranscribe(lang: 'ru' | 'en' = 'ru') {
    if (!firstAudio || sttBusy) return; setSttBusy(true);
    try { const r = await transcribeVoice(firstAudio, lang); if (r && (r as any).ok && typeof (r as any).text === 'string') { const recognized = (r as any).text; setText(prev => (prev.trim() ? `${prev}\n${recognized}` : recognized)); } else alert((r as any)?.error || 'Не удалось распознать речь'); }
    catch (e: any) { console.error('[STT] error', e); alert(e?.message || 'Ошибка распознавания'); }
    finally { setSttBusy(false); }
  }

  // schedule info (create later)
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string | null>(null);
  // когда открываем планировщик 🕒 — временно убираем фокус, чтобы потом вернуть и поднять клавиатуру
  useEffect(() => { if (scheduleOpen) { try { textAreaRef.current?.blur(); } catch {} } }, [scheduleOpen]);
  // weather config
  const [weatherCfg, setWeatherCfg] = useState<null | { atIso: string; city: string; lat: number; lon: number; op: 'GE'|'LE'; valueC: number }>(null);

  // UI modals
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groupTab, setGroupTab] = useState<'own' | 'member'>('own');
  const ownGroups = useMemo(() => groups.filter(g => (g as any).kind === 'own'), [groups]);
  const memberGroups = useMemo(() => groups.filter(g => (g as any).kind === 'member'), [groups]);
  const scheduleInfo = useMemo(() => {
    if (!scheduleAt) return null;
    const d = new Date(String(scheduleAt));
    if (Number.isNaN(d.getTime())) return null;
    const ms = d.getTime() - Date.now();
    const signOverdue = ms < 0; const abs = Math.abs(ms);
    const dd = Math.floor(abs / 86400000), hh = Math.floor((abs % 86400000) / 3600000), mm = Math.floor((abs % 3600000) / 60000);
    const left = signOverdue ? 'скоро' : (dd > 0 ? `${dd}д ${hh}ч` : (hh > 0 ? `${hh}ч ${mm}м` : `${mm}м`));
    return { when: d.toLocaleString(), left };
  }, [scheduleAt]);

  const scheduledBanner = (!isEdit && weatherCfg) ? (
    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
      <span>{`🌦️ Если ${new Date(weatherCfg.atIso).toLocaleString()} в (${weatherCfg.city}) погода (${weatherCfg.op==='GE'?'>=':'<='}) ${weatherCfg.valueC}°`}</span>
      <button onClick={() => { setWeatherCfg(null); setScheduleAt(null); setPreCfg(null); }} title="Сбросить погодное условие" style={{ background:'transparent', border:'none', color:'#93c5fd', cursor:'pointer' }}>(x)</button>
    </div>
  ) : ((!isEdit && scheduleInfo) ? (
    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9, display:'flex', alignItems:'center', gap:6 }}>
      <span>🕒 Создастся: {scheduleInfo.when} • {scheduleInfo.left}</span>
      <button onClick={() => { setScheduleAt(null); setPreCfg(null); focusText(); }} title="Сбросить плановую дату" style={{ background:'transparent', border:'none', color:'#93c5fd', cursor:'pointer' }}>(x)</button>
    </div>
  ) : null);

  // const sendRef = useRef<HTMLDivElement | null>(null);
  const MAX_LINES = 6; const LINE_PX = 20; const MAX_HEIGHT_PX = MAX_LINES * LINE_PX + 16;
  const adjustTextHeight = () => { const el = textAreaRef.current; if (!el) return; el.style.height = 'auto'; const maxPx = MAX_HEIGHT_PX; const next = Math.min(maxPx, el.scrollHeight); el.style.height = `${next}px`; el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden'; };
  useEffect(() => { adjustTextHeight(); }, [text]);
  useEffect(() => { if (open) setTimeout(adjustTextHeight, 0); }, [open]);

  // listen to edit open
  useEffect(() => {
    const handler = async (e: Event) => {
      try {
        const d: any = (e as any).detail || {};
        const taskId: string = String(d.taskId || '');
        if (!taskId) return;
        setEditTaskId(taskId);
        setText(String(d.text || ''));
        setGroupId((d.groupId ?? null) as string | null);
        setEditOrigGroupId((d.groupId ?? null) as string | null);
        setDeadlineAt(d.deadlineAt || null);
        setAcceptConditionState((d.acceptCondition as any) || 'NONE');
        try {
          const labels = await getTaskLabels(taskId).catch(() => []);
          if (Array.isArray(labels) && labels.length) setSelectedLabelId(labels[0].id);
        } catch {}
        try {
          const r = await listTaskReminders(taskId).catch(() => ({ ok:false, reminders: [] } as any));
          const arr: RItem[] = (r && (r as any).reminders) || [];
          setRemindersDraft(arr.map(x => ({ target: x.target as any, fireAtIso: String((x as any).fireAt || (x as any).createdAt || '') })));
        } catch {}
        try {
          const mediaArr = Array.isArray((d as any).media) ? (d as any).media : [];
          setExistingMedia(mediaArr.map((m:any) => ({ id:String(m.id), url:String(m.url), kind:String(m.kind), fileName:m.fileName })));
        } catch {}
        try { setTimeout(() => { focusText(); }, 0); } catch {}
      } finally {
        // leave groupId & others as set
      }
    };
    window.addEventListener('edit-task-open', handler as any);
    return () => window.removeEventListener('edit-task-open', handler as any);
  }, []);

  // edge-pre-open for quick pre-config linking
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const ce = e as CustomEvent<any>;
        const d = (ce && ce.detail) || {};
        const tid = d?.taskId ? String(d.taskId) : '';
        const pid = d?.preTaskId ? String(d.preTaskId) : '';
        const gid = (typeof d.groupId === 'string' || d.groupId === null) ? d.groupId : null;
        if (!tid && !pid) return;
        if (tid) {
          setPreCfg({ links: [{ taskId: tid }], mode: 'AFTER_ALL_DONE', startAt: null, delayMinutes: null, autoCancelOnAny: false, plannedAssigneeChatId: null });
          setEdgeContext({ kind: 'TASK', text: String(d.text || '') });
        } else {
          setPreCfg({ links: [{ preTaskId: pid }], mode: 'AFTER_ALL_DONE', startAt: null, delayMinutes: null, autoCancelOnAny: false, plannedAssigneeChatId: null });
          setEdgeContext({ kind: 'PRETASK', text: String(d.text || '') });
        }
        // по свайпу поле не заполняем текстом — только фокус для ввода
        setText('');
        try { setTimeout(() => { focusText(); }, 0); } catch {}
        if (gid !== undefined) setGroupId(gid ?? null);
      } catch {}
    };
    window.addEventListener('edge-pre-open', handler as EventListener);
    return () => window.removeEventListener('edge-pre-open', handler as EventListener);
  }, []);

  // init draft (bounty) if exists on server when modal opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      const d = await loadDraft();
      if (d && typeof d.amountTon === 'number') {
        setBountyAmount(d.amountTon);
        setBountyRub(typeof d.amountRub === 'number' ? d.amountRub : null);
        setBountyLocked(true);
      }
    })();
  }, [open]);

  // create
  async function doCreate(): Promise<{ id: string; title: string } | null> {
    const val = text.trim(); if (!val) return null;
    setBusy(true);
    try {
      const r = await createTask(chatId, val, groupId ?? undefined);
      if (!r?.ok || !r?.task?.id) throw new Error('create_failed');
      const newTaskId = r.task.id;
      if (groupId && selectedLabelId) { try { await attachTaskLabels(newTaskId, chatId, [selectedLabelId]); } catch {} }
      if (deadlineAt) { try { await setTaskDeadline(newTaskId, chatId, deadlineAt); } catch {} }
      if (pendingFiles.length) { for (const f of pendingFiles) { try { await uploadTaskMedia(newTaskId, chatId, f); } catch {} } }
      if (remindersDraft.length) { for (const rm of remindersDraft) { try { await createTaskReminder(newTaskId, { createdBy: chatId, target: rm.target, fireAt: rm.fireAtIso }); } catch {} } }
      try { WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
      // clear bounty draft after success
      try { if (_bountyLocked) { await clearDraft(); setBountyLocked(false); } } catch {}
      onCreated?.();
      onClose();
      return { id: newTaskId, title: val };
    } finally { setBusy(false); }
  }

  // save edits
  async function doSaveEdit() {
    if (!editTaskId) return;
    const val = text.trim();
    setBusy(true);
    try {
      if (val) { try { await updateTask(editTaskId, val); } catch {} }
      try { await setTaskDeadline(editTaskId, chatId, deadlineAt); } catch {}
      try { await setAcceptCondition(editTaskId, chatId, acceptCondition as any); } catch {}
      try {
        const cur = await getTaskLabels(editTaskId).catch(() => [] as any);
        const curIds: string[] = Array.isArray(cur) ? cur.map((l:any)=>String(l.id)) : [];
        if (groupId) {
          if (selectedLabelId) {
            try { await attachTaskLabels(editTaskId, chatId, [selectedLabelId]); } catch {}
            for (const lid of curIds) if (lid !== selectedLabelId) { try { await removeTaskLabel(editTaskId, lid, chatId); } catch {} }
          } else {
            for (const lid of curIds) { try { await removeTaskLabel(editTaskId, lid, chatId); } catch {} }
          }
        }
      } catch {}
      try {
        const listed = await listTaskReminders(editTaskId).catch(()=>({ ok:false, reminders: [] } as any));
        const current: RItem[] = (listed && (listed as any).reminders) || [];
        for (const rr of current) { try { await deleteTaskReminder(editTaskId, String((rr as any).id)); } catch {} }
        for (const d of remindersDraft) { try { await createTaskReminder(editTaskId, { createdBy: chatId, target: d.target, fireAt: d.fireAtIso }); } catch {} }
      } catch {}
      if (pendingFiles.length) { for (const f of pendingFiles) { try { await uploadTaskMedia(editTaskId, chatId, f); } catch {} } }
      // if group changed, move to Inbox of target group
      try {
        if (groupId !== _editOrigGroupId) {
          const b = await fetchBoard(chatId, groupId ?? undefined).catch(()=>null as any);
          const cols = (b && (b as any).columns) || [];
          const inbox = cols.find((c:any) => {
            const nm = String(c.name||'');
            const i = nm.indexOf('::');
            const status = i>=0 ? nm.slice(i+2) : nm;
            return status === 'Inbox';
          }) || cols[0];
          if (inbox) { try { await moveTask(editTaskId, String(inbox.id), 0); } catch {} }
        }
      } catch {}
      try { WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
      // уведомим ленту/полотно о локальных изменениях карточки
      try {
        const g = (groups || []).find((x:any) => String(x.id) === String(groupId || '')) as any;
        const groupTitle = g ? String(g.title || '') : undefined;
        const isPublicGroup = g ? Boolean((g as any).isPublic) : undefined;
        window.dispatchEvent(new CustomEvent('task-patched', { detail: {
          id: editTaskId,
          text: val || undefined,
          deadlineAt: deadlineAt ?? undefined,
          acceptCondition,
          groupId: groupId ?? null,
          groupTitle,
          isPublicGroup,
        }}));
      } catch {}
      onCreated?.(); onClose();
    } finally { setBusy(false); }
  }

  return !open ? null : (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, background: '#111827', color: '#e5e7eb', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, borderTop: '1px solid #1f2937' }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          {/* Левая часть: теперь кнопка закрытия (и удалить при редактировании) */}
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer' }} aria-label="Закрыть">✕</button>
            {isEdit && (
              <button onClick={() => setDeleteOpen(true)} title="Удалить задачу" style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid #2a3346', background: '#3b1a1a', color: '#ffd7d7', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>🗑️</button>
            )}
          </div>
          {/* Правая часть: сначала ярлык, затем группа (группа ближе к правому краю) */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {groupId ? (
              <select value={selectedLabelId ?? ''} onChange={(e) => { setSelectedLabelId(e.target.value || null); focusText(); }} title="Выбрать ярлык" style={{ background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 999, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                <option value="">{labelsLoading ? '🏷️ Загрузка…' : '🏷️ Без ярлыка'}</option>
                {groupLabels.map((l) => (<option key={l.id} value={l.id}>🏷️ {l.title}</option>))}
              </select>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.85 }}>Моя группа</div>
            )}
            <button onClick={() => setPickerOpen(true)} title="Выбрать группу" style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid #2a3346', background: '#202840', color: ((groupId && (groups.find(g=>g.id===groupId) as any)?.isPublic) ? '#86efac' : '#e8eaed'), fontSize: 12, cursor: 'pointer' }}>
              <b>{groupLabel()}</b>
            </button>
          </div>
        </div>

        {/* Edge links info */}
        {preCfg && (preCfg.links||[]).length>0 && (
          <div style={{ border:'1px solid #1f2937', background:'#0b1220', color:'#e5e7eb', borderRadius:12, padding:10, marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span title="Связь">{(preCfg.links||[]).some(l=>l.preTaskId)?'⚫':'🔘'}</span>
              <div style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{edgeContext?.text ? edgeContext.text : 'Есть связанная задача'}</div>
              <button onClick={() => { setPreCfg(null); setEdgeContext(null); }} title="Убрать связь" style={{ marginLeft:'auto', background:'transparent', border:'none', color:'#93c5fd', cursor:'pointer' }}>×</button>
            </div>
            <div style={{ fontSize:12, opacity:.8, marginTop:6 }}>после выполнения запустить:</div>
          </div>
        )}

        {/* composer */}
        <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <div style={{ display:'flex', gap:8, alignItems:'start' }}>
              {!isEdit && !scheduleAt && !weatherCfg && (
                <button
                  type="button"
                  onClick={() => { try { textAreaRef.current?.blur(); } catch {}; setRobotOpen(true); }}
                  title="Роботы"
                  style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#172133', color: '#8aa0ff', cursor: 'pointer' }}
                >🤖</button>
              )}
              <div style={{ position:'relative', flex:1, minWidth:0 }}>
            <TextComposer
              text={text}
              setText={setText}
              textAreaRef={textAreaRef as React.RefObject<HTMLTextAreaElement>}
              adjustTextHeight={adjustTextHeight}
              firstAudio={firstAudio}
              audioPreviewUrl={audioPreviewUrl}
              sttBusy={sttBusy}
              onTranscribe={(l)=>handleTranscribe(l)}
              onOpenBounty={()=>{ setBountyOpen(true); focusText(); }}
              toolsOpen={toolsOpen}
              onToggleTools={()=>{ setToolsOpen(v=>!v); focusText(); }}
              onRemoveAudio={()=>{ setPendingFiles(prev => prev.filter(f => f !== firstAudio)); }}
              rightSlot={(
                isEdit ? (
                  <button
                    type="button"
                    title="Сохранить"
                    onClick={doSaveEdit}
                    style={{ width:'100%', height:'100%', borderRadius:999, background:'#2563eb', color:'#fff', border:'1px solid transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}
                  >💾</button>
                ) : ((!isEdit && (!!scheduleAt || !!weatherCfg)) || (preCfg && preCfg.links?.length)) ? (
                  <PreTaskActionsLauncher
                    label="➤"
                    meChatId={chatId}
                    members={membersAsOptions}
                    onMakePreTask={async (plannedAssigneeChatId) => {
                      const val = text.trim();
                      const title = val || 'Новая задача';
                      const body: any = {
                        chatId,
                        groupId: groupId ?? null,
                        text: title,
                        plannedAssigneeChatId: plannedAssigneeChatId ?? null,
                        triggerMode: (scheduleAt ? 'DATE_PLUS' : (((preCfg as any)?.mode) || 'AFTER_ALL_DONE')),
                        startAt: scheduleAt || (preCfg as any)?.startAt || null,
                        delayMinutes: (preCfg as any)?.delayMinutes ?? null,
                        autoCancelOnAny: (preCfg as any)?.autoCancelOnAny ?? false,
                        links: Array.isArray((preCfg as any)?.links) ? (preCfg as any).links : [],
                        arm: true,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                      };
                      if (weatherCfg) {
                        body.payload = { ...(body.payload||{}), weather: { kind: 'TEMP_AT_2M', lat: weatherCfg.lat, lon: weatherCfg.lon, city: weatherCfg.city, op: weatherCfg.op, valueC: weatherCfg.valueC } };
                      }
                      const api = await import('../../api');
                      const resp = await (api as any).createPreTask(body);
                      if (!(resp as any)?.ok) throw new Error((resp as any)?.error || 'pretask_create_failed');
                      try {
                        const linksArr:any[] = (preCfg?.links || []) as any[];
                        const parentsTask = linksArr.filter((l:any)=>l.taskId).map((l:any)=>String(l.taskId));
                        const parentsPre = linksArr.filter((l:any)=>l.preTaskId).map((l:any)=>String(l.preTaskId));
                        window.dispatchEvent(new CustomEvent('pre-task-created', { detail: { preTask: (resp as any)?.preTask || null, parentTaskIds: parentsTask, parentPreTaskIds: parentsPre } }));
                      } catch {}
                      setText(''); setPreCfg(null); setScheduleAt(null); setWeatherCfg(null); onCreated?.(); onClose();
                    }}
                    style={{ width: '100%', height: '100%' }}
                  />
                ) : canSend ? (
                  <PostCreateActionsLauncher
                    label="➤"
                    disabled={!canSend}
                    style={{ width: '100%', height: '100%', borderRadius: 999, background: '#2563eb', color: '#fff', border: '1px solid transparent', cursor: canSend ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}
                    meChatId={chatId}
                    members={membersAsOptions}
                    onMake={async () => {
                      const res = await doCreate();
                      return { taskId: res?.id || '', taskTitle: res?.title || (text.trim() || 'Задача') } as any;
                    }}
                  />
                ) : (
                  <VoiceRecorder maxSeconds={30} buttonStyle={{ width: '100%', height: '100%' }} onRecorded={(file) => { setPendingFiles(prev => [...prev, file]); }} />
                )
              )}
            />
              </div>
            </div>
          </div>

          {/* scheduled info under textarea */}
          {scheduledBanner}

          {/* tools panel (basic) */}
          {toolsOpen && (
            <AttachBar
              chatId={chatId}
              groupId={groupId}
              preCfg={preCfg}
              onApplyPreCfg={(cfg)=>{ setPreCfg(cfg); focusText(); }}
              onPickFiles={onPickFiles}
              onOpenCamera={openCamera}
              onOpenDeadline={()=>setDeadlineOpen(true)}
              onOpenAccept={()=>setAcceptOpen(true)}
              onOpenReminders={()=>setRemindersOpen(true)}
              fileAnyRef={fileAnyRef}
              filePhotoRef={filePhotoRef}
            />
          )}

          {/* existing media (edit) */}
          {isEdit && existingMedia.length>0 && (<ExistingMedia items={existingMedia as any} />)}

          {/* deadline/reminders/accept info */}
          {deadlineAt ? (
            <div style={{ fontSize: 12, opacity: 0.85 }}>🚩 Дедлайн: {new Date(deadlineAt).toLocaleString()}</div>
          ) : null}
          {acceptCondition && acceptCondition !== 'NONE' ? (
            <div style={{ fontSize: 12, opacity: 0.9 }}>☝️ Условия: {
              acceptCondition === 'PHOTO' ? 'нужно фото' :
              acceptCondition === 'APPROVAL' ? 'нужно согласование' :
              acceptCondition === 'PHOTO_AND_APPROVAL' ? 'фото + согласование' :
              acceptCondition === 'DOC_AND_APPROVAL' ? 'документ + согласование' : '—'
            }</div>
          ) : null}
          {remindersDraft.length > 0 ? (
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              ⏰ Напоминания: {remindersDraft.map((r) => {
                try {
                  const d = new Date(r.fireAtIso);
                  const v = isNaN(d.getTime()) ? r.fireAtIso : d.toLocaleString();
                  const who = r.target === 'ME' ? 'мне' : (r.target === 'RESPONSIBLE' ? 'ответственному' : 'всем');
                  return `${v} (${who})`;
                } catch { return `${r.fireAtIso}`; }
              }).join('; ')}
            </div>
          ) : null}
          {!isSimpleMode && scheduleInfo ? (
            <div style={{ fontSize: 12, opacity: 0.9, display:'flex', alignItems:'center', gap:6 }}>
              <span>🕒 Создастся: {scheduleInfo.when} • {scheduleInfo.left}</span>
            </div>
          ) : null}

          {pendingFiles.length ? (<div style={{ fontSize: 12, opacity: 0.85 }}>Добавится: {pendingFiles.map((f) => f.name || 'файл').join(', ')}</div>) : null}
        </div>

        {/* Modals */}
        <RemindersModal open={remindersOpen} onClose={() => setRemindersOpen(false)} onPick={({ target, fireAtIso }) => { setRemindersDraft(prev => [...prev, { target, fireAtIso }]); setRemindersOpen(false); }} />
        <CameraCaptureModal open={cameraOpen} onClose={() => { setCameraOpen(false); focusText(); }} onCapture={(file) => { setPendingFiles((prev) => [...prev, file]); focusText(); }} />
        <DeadlinePicker open={deadlineOpen} value={deadlineAt} onChange={(v) => setDeadlineAt(v)} onClose={() => { setDeadlineOpen(false); focusText(); }} />
        <DeadlinePicker open={scheduleOpen} value={scheduleAt} title="Плановое создание" icon="🕒" onChange={(v) => { if (!v) { setScheduleAt(null); setPreCfg(null); return; } const dt = new Date(v); if (Number.isNaN(dt.getTime()) || dt.getTime() <= Date.now()) { alert('Нельзя выбрать прошлое время'); return; } setScheduleAt(v); setPreCfg({ links: [], mode: 'DATE_PLUS', startAt: v, delayMinutes: null, autoCancelOnAny: false } as any); }} onClose={() => { setScheduleOpen(false); try { setTimeout(() => textAreaRef.current?.focus(), 0); } catch {} }} />
        <AcceptConditionsModal open={acceptOpen} value={acceptCondition} onChange={(v)=>setAcceptConditionState(v)} onClose={() => { setAcceptOpen(false); focusText(); }} />

        <RobotPicker
          open={robotOpen}
          onClose={() => { setRobotOpen(false); try { setTimeout(() => textAreaRef.current?.focus(), 0); } catch {} }}
          onPickSchedule={() => { setRobotOpen(false); setScheduleOpen(true); }}
          onPickWeather={() => { setRobotOpen(false); setWeatherOpen(true); }}
        />
        <WeatherScheduleModal
          open={weatherOpen}
          onClose={() => { setWeatherOpen(false); try { setTimeout(() => textAreaRef.current?.focus(), 0); } catch {} }}
          onApply={(p) => { setWeatherOpen(false); setWeatherCfg(p); setScheduleAt(p.atIso); try { setTimeout(() => textAreaRef.current?.focus(), 0); } catch {} }}
        />

        <BountyPicker
          open={bountyOpen}
          initial={bountyAmount}
          initialRub={bountyRub ?? null}
          onApply={async (n, approxRub) => {
            const rub = typeof approxRub === 'number' ? approxRub : (bountyRub ?? null);
            try {
              await startPayment(n, rub ?? null, isEdit ? editTaskId : null);
              setBountyAmount(n);
              setBountyRub(rub ?? null);
              setBountyLocked(true);
            } catch (e:any) {
              alert(e?.message || 'payment_failed');
            }
          }}
          onClose={() => { setBountyOpen(false); focusText(); }}
        />

        {/* Hidden TonConnect initializer while modal is open */}
        {open && (<div style={{ display: 'none' }}><TonWalletConnect chatId={chatId} /></div>)}

        <GroupPicker
          open={pickerOpen}
          groupTab={groupTab}
          setGroupTab={setGroupTab}
          ownGroups={ownGroups as any}
          memberGroups={memberGroups as any}
          groupId={groupId}
          setGroupId={(id)=>setGroupId(id)}
          selectedLabelId={selectedLabelId}
          setSelectedLabelId={(id)=>setSelectedLabelId(id)}
          onClose={() => setPickerOpen(false)}
          onApply={() => { setPickerOpen(false); setToolsOpen(true); focusText(); }}
        />

        <DeleteConfirmModal
          open={deleteOpen}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={async ()=>{
            if (!editTaskId) return;
            try {
              setBusy(true);
              const res = await deleteTask(editTaskId);
              if ((res as any)?.ok !== false) {
                try { window.dispatchEvent(new CustomEvent('task-removed', { detail: { id: editTaskId } })); } catch {}
                try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
                onClose();
              }
            } finally { setBusy(false); setDeleteOpen(false); }
          }}
        />
      </div>
      {/* bounty locked info */}
      {(_bountyLocked || bountyAmount>0) && (
        <div style={{ marginTop:8, fontSize:12, opacity:0.95 }}>
          🥮 Вознаграждение: {typeof bountyRub==='number' ? `(${bountyRub} ₽) `:''}≈ {bountyAmount.toFixed(9).replace(/0+$/,'').replace(/\.$/,'')} TON
          {_bountyLocked && (
            <>
              <button onClick={async ()=>{ try{ if(!confirm('Вернуть средства? Комиссия не возвращается.')) return; await refund(bountyAmount); setBountyLocked(false); setBountyAmount(0); setBountyRub(null); alert('Возврат запрошен.'); } catch(e:any){ alert(e?.message||'refund_failed'); } }} style={{ marginLeft:8, padding:'0 8px', borderRadius:999, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>×</button>
              <button onClick={async ()=>{ if (confirm('Сбросить предзадачу без возврата?')) { setBountyLocked(false); setBountyAmount(0); setBountyRub(null); try { await clearDraft(); } catch {} } }} style={{ marginLeft:8, padding:'0 8px', borderRadius:999, border:'1px solid #2a3346', background:'#3a1020', color:'#fca5a5' }}>Разблокировать</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
