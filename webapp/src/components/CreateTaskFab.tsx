// webapp/src/components/CreateTaskFab.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CameraCaptureModal from './CameraCaptureModal';
import PostCreateActionsLauncher from './PostCreateActionsLauncher';
import VoiceRecorder from './VoiceRecorder';
import DeadlinePicker from './DeadlinePicker';
import BountyPicker from './BountyPicker';
import TonWalletConnect from './TonWalletConnect';
import RemindersModal from './RemindersModal';
import { createTaskReminder, type ReminderTarget } from '../api/reminders';

import WebApp from '@twa-dev/sdk';
import {
  createTask,
  listGroups,
  type Group,
  getGroupMembers,
  type GroupMember,
  uploadTaskMedia,
  transcribeVoice,
  getGroupLabels,
  attachTaskLabels,
  type GroupLabel,
  setTaskDeadline,
} from '../api';

type PreConfig = {
  links: Array<{ taskId?: string; preTaskId?: string }>;
  mode: 'AFTER_ALL_DONE' | 'DATE_PLUS' | 'DELAY_AFTER' | 'AFTER_ALL_CANCELED';
  startAt?: string | null;
  delayMinutes?: number | null;
  autoCancelOnAny?: boolean;
  plannedAssigneeChatId?: string | null;
};

type Props = {
  defaultGroupId?: string | null;
  chatId: string;
  groups?: Group[];
  onCreated?: () => void;
};

type MemberOption = { chatId: string; name: string };

export default function CreateTaskFab({
  defaultGroupId = null,
  chatId,
  groups: groupsProp,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);

  const isSimpleMode = useMemo(
    () => typeof defaultGroupId !== 'undefined',
    [defaultGroupId],
  );

  const [step, setStep] = useState<0 | 1>(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const [groups, setGroups] = useState<Group[]>(groupsProp || []);
  const [groupId, setGroupId] = useState<string | null>(defaultGroupId ?? null);

  const [members, setMembers] = useState<MemberOption[]>([]);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusText = () => { try { setTimeout(() => textAreaRef.current?.focus(), 0); } catch {} };
  const membersAsOptions: MemberOption[] = members.map(m => ({ chatId: m.chatId, name: m.name }));

  // Локальные вложения ДО отправки (обязательно объявляем ДО firstAudio)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // первый аудио-файл среди вложений (если есть)
  const firstAudio = useMemo(
    () => pendingFiles.find(f => f.type?.startsWith('audio/')) || null,
    [pendingFiles]
  );

  // URL для <audio>
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!firstAudio) {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      setAudioPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(firstAudio);
    setAudioPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstAudio]);

  const [sttBusy, setSttBusy] = useState(false);

  // Ярлыки группы и выбранный ярлык
  const [groupLabels, setGroupLabels] = useState<GroupLabel[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);

  // можно отправлять если есть текст ИЛИ есть вложения (в т.ч. аудио)
  const canSend = text.trim().length > 0 || pendingFiles.length > 0;

  // UI refs и модалки
  const [pickerOpen, setPickerOpen] = useState(false);
  const sendRef = useRef<HTMLDivElement | null>(null);
  const fileAnyRef = useRef<HTMLInputElement | null>(null);
  const filePhotoRef = useRef<HTMLInputElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [remindersDraft, setRemindersDraft] = useState<{ target: ReminderTarget; fireAtIso: string }[]>([]);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptCondition, setAcceptConditionState] = useState<'NONE' | 'PHOTO' | 'APPROVAL' | 'PHOTO_AND_APPROVAL' | 'DOC_AND_APPROVAL'>('NONE');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [bountyOpen, setBountyOpen] = useState(false);
  const [bountyAmount, setBountyAmount] = useState<number>(0);
  const [bountyRub, setBountyRub] = useState<number | null>(null);
  const [bountyLocked, setBountyLocked] = useState<boolean>(false);
  const [preCfg, setPreCfg] = useState<PreConfig | null>(null);

  // server-side draft: lock panel if draft exists on server
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/telegsar-api/bounty/draft/get?chatId=${encodeURIComponent(chatId)}`);
        const j = await r.json().catch(()=>({}));
        const d = j?.draft;
        if (d && typeof d.amountTon === 'number') {
          setBountyAmount(d.amountTon);
          setBountyRub(typeof d.amountRub === 'number' ? d.amountRub : null);
          setBountyLocked(true);
          setOpen(true);
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startTonPayment(taskId?: string | null, amountTonParam?: number, amountRubParam?: number | null) {
    try {
      // Ensure TonConnect is initialized
      let tonAny: any = (window as any).ton;
      if (!tonAny?.sendTransaction) {
        try {
          const appOrigin = (import.meta as any).env?.VITE_PUBLIC_ORIGIN || location.origin;
          const mod: any = await import('@tonconnect/ui');
          const inst = new mod.TonConnectUI({ manifestUrl: `${appOrigin}/tonconnect-manifest.json` });
          (window as any).ton = inst;
          tonAny = inst;
        } catch {}
      }

      const st = await fetch(`/telegsar-api/wallet/ton/status?chatId=${encodeURIComponent(chatId)}`);
      const sj = await st.json();
      if (sj?.network && sj.network !== 'mainnet') { alert('Кошелёк подключен к '+sj.network+'. Переключите сеть на Mainnet и переподключите.'); return; }
      if (!sj?.connected) { try { tonAny?.openModal?.(); } catch {}; alert('Подключите тон-кошелёк для оплаты.'); return; }
      const ownerAddress = sj?.address || '';
      const amountToUse = (typeof amountTonParam === 'number' && amountTonParam > 0) ? amountTonParam : bountyAmount;
      const fr = await fetch('/telegsar-api/bounty/fund-request', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId, ownerAddress, amount: amountToUse, taskId: taskId || null }) });
      const fj = await fr.json().catch(()=>({ ok:false, error:'internal' }));
      if (!fr.ok || !fj?.ok) { alert(String(fj?.error || `http_${fr.status}`)); return; }
      const ton = (window as any).ton;
      if (!ton?.sendTransaction) { alert('TonConnect не инициализирован'); try { tonAny?.openModal?.(); } catch {}; return; }
      await ton.sendTransaction(fj.transaction);
      // Фиксируем только после успешной отправки в кошельке
      const lockedTon = amountToUse;
      const lockedRub = (typeof amountRubParam === 'number' ? amountRubParam : bountyRub) ?? null;
      setBountyAmount(lockedTon);
      setBountyRub(lockedRub);
      setBountyLocked(true);
      try { await fetch('/telegsar-api/bounty/draft/set', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId, amountTon: lockedTon, amountRub: lockedRub ?? undefined }) }); } catch {}
    } catch (e:any) { alert(e?.message || 'payment_failed'); }
  }

  // Keep global FABs in sync with modal visibility (covers draft-open and reloads)
  useEffect(() => {
    try { window.dispatchEvent(new CustomEvent('create-task-open', { detail: open })); } catch {}
  }, [open]);

  // табы в пикере групп
  const [groupTab, setGroupTab] = useState<'own' | 'member'>('own');
  const ownGroups = useMemo(() => groups.filter(g => g.kind === 'own'), [groups]);
  const memberGroups = useMemo(() => groups.filter(g => g.kind === 'member'), [groups]);

  const groupLabel = () => {
    if (!groupId) return 'Моя группа';
    const g = groups.find(g => g.id === groupId);
    if (!g) return 'Группа';
    const isTg = (g as any).isTelegramGroup === true;
    return (isTg ? '➡️📁 ' : '📁 ') + g.title;
  };

  const onPickFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files).slice(0, 10);
    setPendingFiles(prev => [...prev, ...arr]);
    focusText();
  };

  const openCamera = () => {
    const hasGUM = typeof (navigator as any)?.mediaDevices?.getUserMedia === 'function';
    if (hasGUM) setCameraOpen(true);
    else filePhotoRef.current?.click();
  };

  // подгружаем группы при необходимости
  useEffect(() => {
    if (groupsProp && groupsProp.length) {
      setGroups(groupsProp);
      return;
    }
    if (!chatId) return;
    listGroups(chatId).then(r => { if (r.ok) setGroups(r.groups); }).catch(() => {});
  }, [chatId, groupsProp]);

  // Загружаем ярлыки при выборе группы
  useEffect(() => {
    setSelectedLabelId(null);
    setGroupLabels([]);
    if (!groupId) return; // для личной группы ярлыков нет
    let cancelled = false;
    (async () => {
      setLabelsLoading(true);
      try {
        const labels = await getGroupLabels(groupId);
        if (!cancelled) setGroupLabels(labels || []);
      } catch {
        if (!cancelled) setGroupLabels([]);
      } finally {
        if (!cancelled) setLabelsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  // транскрибация
async function handleTranscribe(lang: 'ru' | 'en' = 'ru') {
  if (!firstAudio || sttBusy) return;
  setSttBusy(true);
  try {
    const r = await transcribeVoice(firstAudio, lang);

    if (r && r.ok && typeof r.text === 'string') {
      const recognized: string = r.text; // гарантируем строку
      setText(prev => (prev.trim() ? `${prev}\n${recognized}` : recognized));
    } else {
      alert(r?.error || 'Не удалось распознать речь');
    }
  } catch (e: any) {
    console.error('[STT] error', e);
    alert(e?.message || 'Ошибка распознавания');
  } finally {
    setSttBusy(false);
  }
}

function PreTaskActionsLauncher({
  label = '➤',
  disabled,
  style,
  meChatId,
  members = [],
  onMakePreTask,
}: {
  label?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  meChatId: string;
  members?: MemberOption[];
  onMakePreTask: (plannedAssigneeChatId: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subView, setSubView] = useState<'root' | 'members'>('root');

  function openSheet() {
    if (disabled) return;
    setOpen(true);
    setSubView('root');
  }
  function closeSheet() {
    if (busy) return;
    setOpen(false);
    setSubView('root');
  }

  async function runSafely(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      try { WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
      closeSheet();
    } catch (e) {
      console.error('[PreTaskActionsLauncher] error', e);
      try { WebApp?.HapticFeedback?.notificationOccurred?.('error'); } catch {}
      alert('Не удалось создать предзадачу.');
    } finally { setBusy(false); }
  }

  const doAssignSelf = () => runSafely(async () => { await onMakePreTask(meChatId || null); });

  const doAssignMember = (m: MemberOption) => runSafely(async () => { await onMakePreTask(m.chatId); });

  const sheet = !open ? null : (
    <div onClick={closeSheet} style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', padding:12 }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:520, background:'#131a26', border:'1px solid #2a3346', borderRadius:16, padding:12, color:'#fff', boxShadow:'0 16px 50px rgba(0,0,0,.45)' }}>
        {subView==='root' ? (
          <>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:10 }}>Кого сделать ответственным?</div>
            <button disabled={busy} style={styles.btn} onClick={doAssignSelf}>Сделать себя ответственным</button>
            <button disabled={busy || members.length===0} style={styles.btn} onClick={()=>setSubView('members')}>Выбрать из группы</button>
            <div style={{ fontSize:12, opacity:0.7, marginTop:8, textAlign:'center' }}>Предзадача запустится по условиям. Ответственный будет назначен при запуске.</div>
            <button style={styles.closeBtn} onClick={closeSheet}>Закрыть</button>
          </>
        ) : (
          <>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:10 }}>Выберите участника группы</div>
            <div style={{ maxHeight:320, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
              {members.map(m => (
                <div key={m.chatId} style={styles.row}>
                  <div style={{ display:'flex', flexDirection:'column' }}>
                    <div style={{ fontSize:15 }}>{m.name || m.chatId}</div>
                    <div style={{ fontSize:12, opacity:0.7 }}>{m.chatId}</div>
                  </div>
                  <button disabled={busy} style={styles.smallBtn} onClick={()=>doAssignMember(m)}>Выбрать</button>
                </div>
              ))}
              {members.length===0 && (<div style={{ opacity:0.7, textAlign:'center', padding:8 }}>В группе пока нет участников.</div>)}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button style={styles.btn} onClick={()=>setSubView('root')}>Назад</button>
              <button style={styles.closeBtn} onClick={closeSheet}>Закрыть</button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button disabled={disabled} onClick={openSheet} style={{ width:'100%', height:'100%', borderRadius:999, background: disabled ? '#2a3350' : '#2563eb', color:'#fff', border:'1px solid transparent', cursor: disabled ? 'default' : 'pointer', ...style }}>{label}</button>
      {sheet ? createPortal(sheet, document.body) : null}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid #2a3346',
    background: '#202840',
    color: '#e8eaed',
    cursor: 'pointer',
    marginBottom: 8,
    textAlign: 'center',
  },
  smallBtn: {
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid #2a3346',
    background: '#202840',
    color: '#e8eaed',
    cursor: 'pointer',
  },
  closeBtn: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid #2a3346',
    background: '#1f222b',
    color: '#e8eaed',
    cursor: 'pointer',
    marginBottom: 8,
    textAlign: 'center',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 8,
    borderRadius: 10,
    border: '1px solid #2a3346',
  },
};

function PreTaskToggle({ chatId, groupId: _parentGroupId, value, onApplied, style }: {
  chatId: string;
  groupId: string | null;
  value?: PreConfig | null;
  onApplied: (cfg: PreConfig | null) => void;
  style?: any;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  type LinkItem = { id: string; text: string; kind: 'TASK' | 'PRETASK'; status?: string };
  const [items, setItems] = useState<LinkItem[]>([]);
  const [selected, setSelected] = useState<Map<string, LinkItem>>(new Map());
  const [q, setQ] = useState('');
  const [labelFilterId, setLabelFilterId] = useState<string | null>(null);
  const [taskLabelsCache, setTaskLabelsCache] = useState<Record<string, string[]>>({});
  const [groupLabels, setGroupLabels] = useState<{ id: string; title: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; title: string }[]>([]);
  const [browseGroupId, setBrowseGroupId] = useState<string | null>(_parentGroupId ?? null);
  const [mode, setMode] = useState<PreConfig['mode']>('AFTER_ALL_DONE');
  const [startAt, setStartAt] = useState<string | null>(null);
  const [delayInput, setDelayInput] = useState<string>('');
  const [autoCancel, setAutoCancel] = useState<boolean>(false);

  const [applied, setApplied] = useState<PreConfig | null>(null);
  // синхронизируем снаружи (для стабильности между рендерами)
  useEffect(() => {
    setApplied(value ?? null);
  }, [value]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = !s ? items : items.filter(it => it.text.toLowerCase().includes(s));
    if (labelFilterId) {
      base = base.filter(it => {
        if (it.kind !== 'TASK') return true;
        const lab = taskLabelsCache[it.id] || [];
        return lab.includes(labelFilterId);
      });
    }
    return base;
  }, [q, items, labelFilterId, taskLabelsCache]);

  function normStatus(raw: string) {
    const s = String(raw || '');
    const i = s.indexOf('::');
    return i >= 0 ? s.slice(i + 2) : s;
  }

  async function load() {
    setBusy(true);
    try {
      const api = await import('../api');
      // load groups for browsing once
      try {
        const r = await api.listGroups(chatId);
        const arr = (r as any)?.ok ? (r as any).groups : [];
        setGroups(arr.map((g: any) => ({ id: g.id, title: g.title })));
      } catch {}

      const b = await api.fetchBoard(chatId, browseGroupId ?? undefined);
      const cols = (b?.columns || []) as any[];
      const tasks: LinkItem[] = cols.flatMap((c:any) => (c.tasks || []).map((t:any) => ({ id: String(t.id), text: String(t.text || ''), kind: 'TASK' as const, status: normStatus(String(c.name || '')) })));
      let pret: LinkItem[] = [];
      try {
        const pr = await api.listPreTasks({ chatId, status: ['PREVIEW','ARMED'] });
        if (pr?.ok && Array.isArray(pr.preTasks)) pret = pr.preTasks.map((p:any) => ({ id: String(p.id), text: String(p.text || ''), kind: 'PRETASK' as const, status: String(p.status || '') }));
      } catch {}
      setItems([ ...pret, ...tasks ]);
      // labels of selected browse group for filter
      if (browseGroupId) {
        try { const gl = await (await import('../api')).getGroupLabels(browseGroupId); setGroupLabels(gl.map(l => ({ id: l.id, title: l.title }))); } catch {}
      } else { setGroupLabels([]); }
    } catch {}
    setBusy(false);
  }

  useEffect(() => { if (open) load(); }, [open, browseGroupId]);
  // preselect previously applied links when reopening
  useEffect(() => {
    if (!open) return;
    if (value && value.links && value.links.length) {
      const map = new Map<string, LinkItem>();
      for (const l of value.links) {
        if (l.taskId) {
          const it = items.find(x => x.kind==='TASK' && x.id === l.taskId);
          const key = `TASK:${String(l.taskId)}`;
          map.set(key, it || { id: String(l.taskId), text: `(выбрана ранее) #${String(l.taskId).slice(0,6)}`, kind:'TASK', status: undefined });
        } else if (l.preTaskId) {
          const it = items.find(x => x.kind==='PRETASK' && x.id === l.preTaskId);
          const key = `PRETASK:${String(l.preTaskId)}`;
          map.set(key, it || { id: String(l.preTaskId), text: `⚫ (выбрана ранее) #${String(l.preTaskId).slice(0,6)}`, kind:'PRETASK', status: undefined });
        }
      }
      if (map.size) setSelected(map);
      setMode(value.mode);
      setStartAt(value.startAt || null);
      setDelayInput(typeof value.delayMinutes === 'number' ? String(Math.max(0, value.delayMinutes)) : '');
      setAutoCancel(!!value.autoCancelOnAny);
    }
  }, [open, items, value]);

  // when label filter changes — fetch labels for unknown tasks lazily
  useEffect(() => {
    if (!labelFilterId) return;
    (async () => {
      const need = items.filter(it => !(taskLabelsCache[it.id]));
      if (!need.length) return;
      try {
        const api = await import('../api');
        const entries: [string, string[]][] = [];
        for (const it of need.slice(0, 100)) { // safeguard
          try {
            const ls = await api.getTaskLabels(it.id);
            const ids = (ls || []).map((x:any)=>x.id).filter(Boolean);
            entries.push([it.id, ids]);
          } catch {}
        }
        setTaskLabelsCache(prev => ({ ...prev, ...Object.fromEntries(entries) }));
      } catch {}
    })();
  }, [labelFilterId, items]);

  // Иконка должна отражать применённую конфигурацию
  const icon = (value && value.links?.length) || (applied && applied.links?.length) ? '⚫' : '🔘';

  function apply() {
    const links = Array.from(selected.values()).map(v => (v.kind === 'TASK' ? { taskId: v.id } : { preTaskId: v.id }));
    const cfg: PreConfig = {
      links,
      mode,
      startAt: startAt || null,
      delayMinutes: delayInput.trim()==='' ? null : Math.max(0, parseInt(delayInput,10) || 0),
      autoCancelOnAny: autoCancel,
    };
    setApplied(cfg);
    onApplied(cfg);
    setOpen(false);
  }

  function clear() {
    setSelected(new Map());
    setApplied(null);
    onApplied(null);
  }

  return (
    <>
      <button type="button" title={icon === '⚫' ? 'Изменить предзадачу' : 'Настроить предзадачу'} onClick={() => setOpen(true)} style={style}>{icon}</button>
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setOpen(false)}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 96vw)', maxHeight: '80vh', overflow: 'auto', background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Связанные задачи</div>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <input placeholder="Поиск по названию" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 8, padding: '8px 10px' }} />
              {applied && (
                <button onClick={clear} title="Сбросить предзадачу" style={{ borderRadius: 999, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', padding: '6px 10px', cursor: 'pointer' }}>Сбросить</button>
              )}
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:12, opacity:.8 }}>Группа:</span>
              <select value={browseGroupId ?? ''} onChange={(e)=>setBrowseGroupId(e.target.value || null)} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'4px 6px' }}>
                <option value="">Моя группа</option>
                {groups.map(g => (<option key={g.id} value={g.id}>{g.title}</option>))}
              </select>
              <span style={{ fontSize:12, opacity:.8 }}>Ярлык:</span>
              <select value={labelFilterId ?? ''} onChange={(e)=>setLabelFilterId(e.target.value || null)} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'4px 6px' }}>
                <option value="">Все</option>
                {groupLabels.map(l => (<option key={l.id} value={l.id}>{l.title}</option>))}
              </select>
              <input placeholder="Поиск…" value={q} onChange={e=>setQ(e.target.value)} style={{ flex:1, background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'6px 8px' }} />
            </div>
            <div style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 8, maxHeight: 280, overflow: 'auto', background: '#0f172a' }}>
              {busy ? (
                <div style={{ padding: 12, opacity: 0.7 }}>Загрузка…</div>
              ) : (
                filtered.map(it => {
                  const key = `${it.kind}:${it.id}`;
                  const statusText = it.kind === 'TASK' ? (it.status || '') : `⚫ ${it.status || ''}`;
                  const color = (()=>{
                    const s = (it.status || '').toLowerCase();
                    if (s==='doing') return '#1e3a8a';
                    if (s==='done') return '#2e7d32';
                    if (s==='cancel') return '#b91c1c';
                    if (s==='approval') return '#c2410c';
                    if (s==='wait') return '#0369a1';
                    return '#e5e7eb';
                  })();
                  return (
                  <label key={key} style={{ display: 'flex', alignItems:'center', justifyContent:'space-between', padding: '6px 8px', cursor: 'pointer', gap:8 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={(e) => {
                        const s = new Map(selected);
                        if (e.target.checked) s.set(key, it);
                        else s.delete(key);
                        setSelected(s);
                      }}
                      style={{ marginRight: 8 }}
                    />
                    <span style={{ flex:1, color }}>
                      {it.kind === 'PRETASK' ? '⚫ ' : ''}
                      {it.text.length > 100 ? (it.text.slice(0, 100) + '…') : it.text}
                    </span>
                    {statusText ? (<span style={{ fontSize:12, color }}>{statusText}</span>) : null}
                  </label>
                );})
              )}
            </div>
            {selected.size > 0 && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Выбранные задачи: {Array.from(selected.entries()).map(([k,s]) => (
                  <span key={k} style={{ marginRight: 12 }}>
                    {s.kind === 'PRETASK' ? '⚫ ' : ''}{s.text.length > 30 ? (s.text.slice(0, 30) + '…') : s.text} <button onClick={() => { const m = new Map(selected); m.delete(k); setSelected(m); }} style={{ background: 'transparent', border: 'none', color: '#93c5fd', cursor: 'pointer' }}>(x)</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label><input type="radio" name="prmode" checked={mode==='AFTER_ALL_DONE'} onChange={()=>setMode('AFTER_ALL_DONE')} /> ➡️ Сразу</label>
                <label>
                  <input type="radio" name="prmode" checked={mode==='DATE_PLUS'} onChange={()=>setMode('DATE_PLUS')} /> 📅 + выбранные
                  {mode==='DATE_PLUS' && (
                    <input type="datetime-local" value={startAt || ''} onChange={e => setStartAt(e.target.value || null)} style={{ marginLeft: 8, background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'2px 6px' }} />
                  )}
                </label>
                <label>
                  <input type="radio" name="prmode" checked={mode==='DELAY_AFTER'} onChange={()=>setMode('DELAY_AFTER')} /> ⏰ Через X минут
                  {mode==='DELAY_AFTER' && (
                    <input type="text" inputMode="numeric" pattern="\\d*" value={delayInput} onChange={e => setDelayInput(e.target.value.replace(/\D/g,'').replace(/^0+(?=\d)/,''))} style={{ marginLeft: 8, width: 100, background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'2px 6px' }} placeholder="минуты" />
                  )}
                </label>
                <label><input type="radio" name="prmode" checked={mode==='AFTER_ALL_CANCELED'} onChange={()=>setMode('AFTER_ALL_CANCELED')} /> 🚫➡️ После отменены запуск</label>
              </div>
              {mode !== 'AFTER_ALL_CANCELED' && (
                <label style={{ display: 'block', marginTop: 8 }}>
                  <input type="checkbox" checked={autoCancel} onChange={e => setAutoCancel(e.target.checked)} /> 🚫 Отменить, если одна из выбранных отменена.
                </label>
              )}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} style={{ borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', padding: '8px 12px', cursor: 'pointer' }}>Отмена</button>
              <button disabled={!selected.size} onClick={apply} style={{ borderRadius: 8, border: '1px solid transparent', background: '#2563eb', color: '#fff', padding: '8px 12px', cursor: selected.size ? 'pointer' : 'not-allowed' }}>Применить</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


  // участники выбранной группы (или сам себя для “Моей группы”)
  useEffect(() => {
    let cancelled = false;

    async function loadMembers() {
      if (!groupId) {
        const meName =
          WebApp?.initDataUnsafe?.user
            ? [WebApp.initDataUnsafe.user.first_name, WebApp.initDataUnsafe.user.last_name].filter(Boolean).join(' ')
            : String(chatId);
        if (!cancelled) setMembers([{ chatId, name: meName || String(chatId) }]);
        return;
      }

      try {
        const r = await getGroupMembers(groupId);
        if (!r.ok) throw new Error('members_load_failed');

        const owner = r.owner ? [r.owner] : [];
        const raw: GroupMember[] = [...owner, ...(r.members || [])];

        const uniq = new Map<string, MemberOption>();
        raw.forEach((m) => {
          if (!m?.chatId) return;
          const nm = (m.name || String(m.chatId)).trim();
          uniq.set(String(m.chatId), { chatId: String(m.chatId), name: nm || String(m.chatId) });
        });

        if (!cancelled) {
          const arr = Array.from(uniq.values());
          setMembers(arr.length ? arr : [{ chatId, name: 'Я' }]);
        }
      } catch {
        if (!cancelled) setMembers([{ chatId, name: 'Я' }]);
      }
    }

    loadMembers();
    return () => { cancelled = true; };
  }, [groupId, chatId]);

  const openModal = () => {
    setOpen(true);
    setStep(0);
    try { window.dispatchEvent(new CustomEvent('create-task-open', { detail: true })); } catch {}
  };
  const closeModal = () => {
    if (bountyLocked) return; // нельзя закрыть при наличии вознаграждения
    setOpen(false);
    setBusy(false);
    setText('');
    setGroupId(defaultGroupId ?? null);
    setPendingFiles([]);
    setSelectedLabelId(null);
    setGroupLabels([]);
    setDeadlineAt(null);
    setAcceptConditionState('NONE');
    setRemindersDraft([]);
    try { window.dispatchEvent(new CustomEvent('create-task-open', { detail: false })); } catch {}
  };
  const back = () => {
    if (isSimpleMode) { closeModal(); return; }
    if (step === 0) { closeModal(); return; }
    setStep(0);
  };

  return (
    <>
      {/* Hidden TonConnect initializer to ensure window.ton exists while modal is open */}
      {open && (
        <div style={{ display: 'none' }}>
          <TonWalletConnect chatId={chatId} />
        </div>
      )}
      {/* FAB [+] */}
      <button
        onClick={openModal}
        aria-label="Создать задачу"
        style={{
          position: 'fixed',
          right: 16,
          bottom: `calc(84px + env(safe-area-inset-bottom, 0px))`,
          width: 56,
          height: 56,
          borderRadius: 28,
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          boxShadow: '0 10px 24px rgba(0,0,0,.35)',
          fontSize: 28,
          lineHeight: '56px',
          textAlign: 'center',
          cursor: 'pointer',
          zIndex: 50,
        }}
      >
        +
      </button>

      {/* Модалка */}
      {open && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.45)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 640,
              background: '#111827',
              color: '#e5e7eb',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              borderTop: '1px solid #1f2937',
            }}
          >
            {/* Заголовок */}





            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>


                {isSimpleMode && (
                  <button
                    onClick={() => setPickerOpen(true)}
                    title="Выбрать группу"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: '1px solid #2a3346',
                      background: '#202840',
                      color: '#e8eaed',
                      fontSize: 12,
                      cursor: 'pointer',
                      flex: '0 0 40%',
                      maxWidth: '40%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                       📁 <b>{groupLabel()}</b>
                    </div>
                  </button>
                )}

                {isSimpleMode ? (
                  groupId ? (
                    <select
                      value={selectedLabelId ?? ''}
                      onChange={(e) => { setSelectedLabelId(e.target.value || null); focusText(); }}
                      title="Выбрать ярлык"
                      style={{
                        background: '#0b1220',
                        color: '#e5e7eb',
                        border: '1px solid #1f2937',
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                        flex: '0 0 40%',
                        maxWidth: '40%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <option value="">{labelsLoading ? '🏷️ Загрузка…' : '🏷️ Без ярлыка'}</option>
                      {groupLabels.map((l) => (
                        <option key={l.id} value={l.id}>🏷️ {l.title}</option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ fontSize: 12, opacity: 0.85 }}>Моя группа</div>
                  )
                ) : (
                  <div style={{ fontWeight: 700 }}>
                    {step === 0 ? 'Текст задачи' : 'Выбор группы'}
                  </div>
                )}
              

              </div>
              <button
                onClick={closeModal}
                style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer' }}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            {/* Контент */}
            {isSimpleMode ? (
              <>
                <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
                  {/* Весь бар: textarea/плеер сверху, вложения снизу */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {/* Текст/плеер + кнопка справа */}
                    <div
                      style={{
                        position: 'relative',
                        flex: 1,
                        minWidth: 0,
                        paddingRight: 52,
                      }}
                    >
                      {firstAudio && !text.trim() ? (
                        <div style={{ display: 'grid', gap: 6 }}>
                          <audio controls src={audioPreviewUrl ?? undefined} style={{ width: '100%', outline: 'none' }} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setPendingFiles(prev => prev.filter(f => f !== firstAudio));
                              }}
                              title="Удалить запись"
                              style={{
                                padding: '6px 10px',
                                borderRadius: 10,
                                border: '1px solid #2a3346',
                                background: '#202840',
                                color: '#e8eaed',
                                cursor: 'pointer',
                              }}
                            >
                              ✕
                            </button>

                            <button
                              type="button"
                              onClick={() => handleTranscribe('ru')}
                              disabled={sttBusy}
                              title="Транскрибировать (~A)"
                              style={{
                                padding: '6px 10px',
                                borderRadius: 10,
                                border: '1px solid #2a3346',
                                background: '#202840',
                                color: '#e8eaed',
                                cursor: sttBusy ? 'default' : 'pointer',
                              }}
                            >
                              {sttBusy ? '…' : '~A'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <textarea
                          ref={textAreaRef}
                          autoFocus
                          rows={1}
                          placeholder="Опиши задачу…"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && text.trim()) {
                              e.preventDefault();
                              sendRef.current
                                ?.querySelector('button')
                                ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                            }
                          }}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            background: '#0b1220',
                            color: '#e5e7eb',
                            border: '1px solid #1f2937',
                            borderRadius: 14,
                            padding: '8px 12px',
                            paddingLeft: 44,
                            resize: 'none',
                            minHeight: 38,
                            maxHeight: 80,
                            lineHeight: '20px',
                            overflowY: 'auto',
                          }}
                        />
                      )}
                      
                      <button
                        type="button"
                        onClick={() => { setBountyOpen(true); focusText(); }}
                        title="Вознаграждение"
                        style={{
                          position: 'absolute',
                          left: 8,
                          top: 6,
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          border: '1px solid #1f2937',
                          background: '#0b1220',
                          color: '#facc15',
                          cursor: 'pointer',
                          zIndex: 5,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        🥮
                      </button>

                      {/* Тогглер вложений (🧷) — простая форма */}
                      <button
                        type="button"
                        onClick={() => { setToolsOpen(v => !v); focusText(); }}
                        title={toolsOpen ? 'Скрыть вложения' : 'Показать вложения'}
                        style={{
                          position: 'absolute',
                          right: 52,
                          top: 8,
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          border: '1px solid #1f2937',
                          background: '#0b1220',
                          color: '#9ca3af',
                          cursor: 'pointer',
                          zIndex: 5,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        📎
                      </button>

                      {/* Предзадача (кнопка убрали отсюда; см. панель инструментов ниже) */}

                      {/* Кнопка справа (➤ / 🎙️) */}
                      <div
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 36,
                          height: 36,
                          pointerEvents: 'none',
                        }}
                      >
                        <div ref={sendRef} style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}>
                          {canSend ? (
                            <>
                              {preCfg && preCfg.links?.length ? (
                                <PreTaskActionsLauncher
                                  label="➤"
                                  meChatId={chatId}
                                  members={membersAsOptions}
                                  onMakePreTask={async (plannedAssigneeChatId) => {
                                    const val = text.trim();
                                    const title = val || 'Голосовая заметка';
                                    const api = await import('../api');
                                    const resp = await api.createPreTask({
                                      chatId,
                                      groupId: groupId ?? null,
                                      text: title,
                                      plannedAssigneeChatId: plannedAssigneeChatId ?? null,
                                      triggerMode: preCfg.mode,
                                      startAt: preCfg.startAt ?? null,
                                      delayMinutes: preCfg.delayMinutes ?? null,
                                      autoCancelOnAny: preCfg.autoCancelOnAny ?? false,
                                      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                                      links: preCfg.links,
                                      arm: true,
                                    });
                                    if (!resp?.ok) throw new Error(resp?.error || 'pretask_create_failed');
                                    setText('');
                                    setPreCfg(null);
                                    onCreated?.();
                                    closeModal();
                                  }}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                  }}
                                />
                              ) : (
                                <PostCreateActionsLauncher
                                  label="➤"
                                  disabled={!canSend}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: 999,
                                    background: '#2563eb',
                                    color: '#fff',
                                    border: '1px solid transparent',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 16,
                                  }}
                                  meChatId={chatId}
                                  members={membersAsOptions}
                                  onMake={async () => {
                                    const val = text.trim();
                                    const title = val || 'Голосовая заметка';
                                    const r = await createTask(chatId, title, groupId ?? undefined);
                                    if (!r?.ok || !r?.task?.id) throw new Error('create_failed');
                                    const newTaskId = r.task.id;

                                    // Привязать выбранный ярлык
                                    if (groupId && selectedLabelId) {
                                      try { await (await import('../api')).attachTaskLabels(newTaskId, chatId, [selectedLabelId]); } catch {}
                                    }

                                    // Привязать дедлайн
                                    if (deadlineAt) {
                                      try { await (await import('../api')).setTaskDeadline(newTaskId, chatId, deadlineAt); } catch {}
                                    }

                                    // Привязать условия приёма
                                    if (acceptCondition !== 'NONE') {
                                      try { await (await import('../api')).setAcceptCondition(newTaskId, chatId, acceptCondition as any); } catch {}
                                    }

                                    // Зафиксировать сумму в ₽ на задаче — только если оплата подтверждена (bountyLocked)
                                    if (bountyLocked && bountyAmount > 0 && (bountyRub ?? null) !== null) {
                                      try {
                                        const api = await import('../api');
                                        await api.setTaskBounty(newTaskId, chatId, Number(bountyRub));
                                      } catch {}
                                    }

                                    // Оплата теперь происходит на этапе выбора суммы (авто-запуск)

                                    if (pendingFiles.length) {
                                      for (const f of pendingFiles) {
                                        try { await uploadTaskMedia(newTaskId, chatId, f); } catch {}
                                      }
                                    }

                                    // Создать запланированные напоминания
                                    if (remindersDraft.length) {
                                      for (const rm of remindersDraft) {
                                        try { await createTaskReminder(newTaskId, { createdBy: chatId, target: rm.target, fireAt: rm.fireAtIso }); } catch {}
                                      }
                                    }

                                    WebApp?.HapticFeedback?.notificationOccurred?.('success');
                                    // после отправки — если до этого была предоплата, снимаем фиксацию и сбрасываем драфт
                                    try { if (bountyLocked) { setBountyLocked(false); await fetch('/telegsar-api/bounty/draft/clear', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId }) }); } } catch {}
                                    onCreated?.();
                                    closeModal();

                                    return { taskId: newTaskId, taskTitle: title };
                                  }}
                                />
                              )}
                            </>
                          ) : (
                            <VoiceRecorder
                              maxSeconds={30}
                              buttonStyle={{ width: '100%', height: '100%' }}
                              onRecorded={(file) => {
                                setPendingFiles(prev => [...prev, file]);
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Панель вложений под полем */}
                    {toolsOpen && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => fileAnyRef.current?.click()}
                        title="Прикрепить файл"
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          border: '1px solid #2a3346', background: '#202840',
                          color: '#e8eaed', cursor: 'pointer',
                        }}
                      >📑</button>

                      <button
                        type="button"
                        onClick={() => filePhotoRef.current?.click()}
                        title="Выбрать фото"
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          border: '1px solid #2a3346', background: '#202840',
                          color: '#e8eaed', cursor: 'pointer',
                        }}
                      >🖼️</button>

                      <button
                        type="button"
                        onClick={openCamera}
                        title="Открыть камеру"
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          border: '1px solid #2a3346', background: '#202840',
                          color: '#e8eaed', cursor: 'pointer',
                        }}
                      >📸</button>

                      <button
                        type="button"
                        onClick={() => setDeadlineOpen(true)}
                        title="Установить дедлайн"
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          border: '1px solid #2a3346', background: '#202840',
                          color: '#e8eaed', cursor: 'pointer',
                        }}
                      >🚩</button>

                      <button
                        type="button"
                        onClick={() => setAcceptOpen(true)}
                        title="Условия приёма"
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          border: '1px solid #2a3346', background: '#202840',
                          color: '#e8eaed', cursor: 'pointer',
                        }}
                      >☝️</button>

                      <button
                        type="button"
                        onClick={() => setRemindersOpen(true)}
                        title="Добавить напоминание"
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          border: '1px solid #2a3346', background: '#202840',
                          color: '#e8eaed', cursor: 'pointer',
                        }}
                      >⏰</button>

                      {/* 🔘 / ⚫ Предзадача — как просили в панельке с 📑🖼️📸🚩☝️⏰ */}
                      <PreTaskToggle
                        chatId={chatId}
                        groupId={groupId ?? null}
                        value={preCfg}
                        onApplied={(cfg) => { setPreCfg(cfg); setToolsOpen(true); focusText(); }}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          border: '1px solid #2a3346',
                          background: '#202840',
                          color: '#e8eaed',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      />

                  </div>
                  )}

                    {deadlineAt ? (
                      <div style={{ fontSize: 12, opacity: 0.85 }}>🚩 Дедлайн: {new Date(deadlineAt).toLocaleString()}</div>
                    ) : null}

                    {remindersDraft.length > 0 && (
                      <div style={{ fontSize: 12, opacity: 0.85, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>⏰ Напоминания:</span>
                        {remindersDraft.map((r, idx) => {
                          const d = new Date(r.fireAtIso);
                          const pad = (n: number) => String(n).padStart(2, '0');
                          const when = `${pad(d.getDate())}.${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                          const label = r.target === 'ME' ? 'Себе' : r.target === 'RESPONSIBLE' ? 'Ответственному' : 'Всем';
                          return (
                            <span key={`${idx}-${r.fireAtIso}-${r.target}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1b2030', border: '1px solid #2a3346', borderRadius: 999, padding: '2px 8px' }}
                            >
                              <span>{label} {when}</span>
                              <button
                                onClick={() => setRemindersDraft(prev => prev.filter((_, i) => i !== idx))}
                                title="Удалить"
                                style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer' }}
                              >
                                (x)
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {acceptCondition === 'PHOTO' && (
                      <div style={{ fontSize: 12, opacity: 0.85 }}>☝️ Требуется фото 📸</div>
                    )}
                    {acceptCondition === 'APPROVAL' && (
                      <div style={{ fontSize: 12, opacity: 0.85 }}>☝️ Требуется согласование 🤝</div>
                    )}

                    {bountyLocked && bountyAmount > 0 ? (() => {
                      const tonText = bountyAmount.toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
                      const rubText = typeof bountyRub === 'number' ? `${bountyRub} ₽` : '';
                      return (
                        <div style={{ fontSize: 12, opacity: 0.95, display:'grid', gap:6 }}>
                          <div>
                            🥮 Вознаграждение: {rubText ? `(${rubText}) ` : ''}≈ {tonText} TON
                            {bountyLocked && (
                              <button
                                onClick={async ()=>{
                                  try {
                                    if (!confirm('Вернуть средства? Комиссия не возвращается.')) return;
                                    const st = await fetch(`/telegsar-api/wallet/ton/status?chatId=${encodeURIComponent(chatId)}`);
                                    const sj = await st.json();
                                    const ownerAddress = sj?.address || '';
                                    const rr = await fetch('/telegsar-api/bounty/refund-request', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId, ownerAddress, amount: bountyAmount }) });
                                    const rj = await rr.json().catch(()=>({ ok:false, error:'internal' }));
                                    if (!rr.ok || !rj?.ok) { alert(String(rj?.error || `http_${rr.status}`)); return; }
                                    setBountyLocked(false);
                                    setBountyAmount(0);
                                    setBountyRub(null);
                                    try { await fetch('/telegsar-api/bounty/draft/clear', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId }) }); } catch {}
                                    alert('Возврат запрошен.');
                                  } catch (e:any) { alert(e?.message || 'refund_failed'); }
                                }}
                                title="Отменить и вернуть средства (без комиссии)"
                                style={{ marginLeft:8, padding:'0 8px', borderRadius:999, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', cursor:'pointer' }}>×</button>
                            )}
                            {bountyLocked && (
                              <button
                                onClick={async () => { if (confirm('Сбросить предзадачу без возврата?')) { setBountyLocked(false); setBountyAmount(0); setBountyRub(null); try { await fetch('/telegsar-api/bounty/draft/clear', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId }) }); } catch {} } }}
                                title="Сбросить предзадачу (без возврата)"
                                style={{ marginLeft:8, padding:'0 8px', borderRadius:999, border:'1px solid #2a3346', background:'#3a1020', color:'#fca5a5', cursor:'pointer' }}
                              >Разблокировать</button>
                            )}
                          </div>
                        </div>
                      );
                    })() : null}

                    {pendingFiles.length ? (
                      <div
                        style={{
                          marginLeft: 4,
                          fontSize: 12,
                          opacity: 0.85,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        Прикреплено: {pendingFiles.map((f) => f.name || 'файл').join(', ')}
                      </div>
                    ) : null}
                  </div>

                  {/* скрытые инпуты */}
                  <input
                    ref={fileAnyRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => onPickFiles(e.target.files)}
                  />
                  <input
                    ref={filePhotoRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => onPickFiles(e.target.files)}
                  />
                </div>
              </>
            ) : (
              <>
                {step === 0 && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ position: 'relative' }}>
                      <textarea
                        ref={textAreaRef}
                        autoFocus
                        rows={5}
                        placeholder="Опиши задачу…"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0b1220',
                          color: '#e5e7eb',
                          border: '1px solid #1f2937',
                          borderRadius: 12,
                          padding: 10,
                          paddingLeft: 44,
                          resize: 'vertical',
                        }}
                      />
                      {/* ⭐ слева внутри инпута (мастер) */}
                      <button
                        type="button"
                        onClick={() => { setBountyOpen(true); focusText(); }}
                        title="Вознаграждение"
                        style={{
                          position: 'absolute',
                          left: 8,
                          top: 8,
                          width: 26,
                          height: 26,
                          borderRadius: 999,
                          border: '1px solid #1f2937',
                          background: '#0b1220',
                          color: '#facc15',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        🥮
                      </button>
                      <button
                        type="button"
                        onClick={() => { setToolsOpen(v => !v); focusText(); }}
                        title={toolsOpen ? 'Скрыть вложения' : 'Показать вложения'}
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: 8,
                          width: 26,
                          height: 26,
                          borderRadius: 999,
                          border: '1px solid #1f2937',
                          background: '#172133ff',
                          color: '#9ca3af',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        @
                      </button>
                    </div>

                    {/* Панель вложений (мастер, шаг 0) */}
                    {toolsOpen && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => { setBountyOpen(true); focusText(); }}
                        title="Вознаграждение"
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                      >
                        🥮
                      </button>
                      <button
                        type="button"
                        onClick={() => fileAnyRef.current?.click()}
                        title="Прикрепить файл"
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                      >
                        📑
                      </button>
                      <button
                        type="button"
                        onClick={() => filePhotoRef.current?.click()}
                        title="Выбрать фото"
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                      >
                        🖼️
                      </button>
                      <button
                        type="button"
                        onClick={openCamera}
                        title="Открыть камеру"
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                      >
                        📸
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeadlineOpen(true)}
                        title="Установить дедлайн"
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                      >
                        🚩
                      </button>

                      <input ref={fileAnyRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />
                      <input ref={filePhotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />

                      {/* 🔘/⚫ в панельке шага 0 */}
                      <PreTaskToggle
                        chatId={chatId}
                        groupId={groupId ?? null}
                        value={preCfg}
                        onApplied={(cfg) => { setPreCfg(cfg); focusText(); }}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                      />
                    </div>
                    )}

                    {deadlineAt ? (
                      <div style={{ fontSize: 12, opacity: 0.85 }}>🚩 Дедлайн: {new Date(deadlineAt).toLocaleString()}</div>
                    ) : null}

                    {pendingFiles.length ? (
                      <div style={{ fontSize: 12, opacity: 0.85 }}>
                        Прикреплено: {pendingFiles.map((f) => f.name || 'файл').join(', ')}
                      </div>
                    ) : null}
                  </div>
                )}

                {step === 1 && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Проект</div>
                    <select
                      value={groupId ?? ''}
                      onChange={(e) => setGroupId(e.target.value ? e.target.value : null)}
                      style={{
                        background: '#0b1220',
                        color: '#e5e7eb',
                        border: '1px solid #1f2937',
                        borderRadius: 10,
                        padding: '8px 10px',
                      }}
                    >
                      <option value="">Моя группа</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'space-between' }}>
                  <button
                    onClick={back}
                    disabled={busy}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: '#1f2937',
                      color: '#e5e7eb',
                      border: '1px solid #374151',
                      cursor: 'pointer',
                    }}
                  >
                    {step === 0 ? 'Отмена' : '← Назад'}
                  </button>

                  <PostCreateActionsLauncher
                    label={step === 0 ? '→ Далее' : 'Создать'}
                    disabled={step === 0 ? !text.trim() : !text.trim()}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: '#2563eb',
                      color: '#fff',
                      border: '1px solid transparent',
                      cursor: 'pointer',
                      minWidth: 120,
                    }}
                    meChatId={chatId}
                    members={membersAsOptions}
                    onMake={async () => {
                      if (step === 0) {
                        setStep(1);
                        throw new Error('__DEFER__');
                      }

                      const val = text.trim();
                      if (!val) throw new Error('empty');

                      const r = await createTask(chatId, val, groupId ?? undefined);
                      if (!r?.ok || !r?.task?.id) throw new Error('create_failed');
                      const newTaskId = r.task.id;

                      // Привязать выбранный ярлык к задаче
                      if (groupId && selectedLabelId) {
                        try { await attachTaskLabels(newTaskId, chatId, [selectedLabelId]); } catch {}
                      }

                      // Привязать дедлайн
                      if (deadlineAt) {
                        try { await setTaskDeadline(newTaskId, chatId, deadlineAt); } catch {}
                      }

                      // Привязать условия приёма
                      if (acceptCondition !== 'NONE') {
                        try { const mod = await import('../api'); await mod.setAcceptCondition(newTaskId, chatId, acceptCondition as any); } catch {}
                      }

                      if (pendingFiles.length) {
                        for (const f of pendingFiles) {
                          try { await uploadTaskMedia(newTaskId, chatId, f); } catch {}
                        }
                      }

                      // Создать запланированные напоминания
                      if (remindersDraft.length) {
                        for (const rm of remindersDraft) {
                          try { await createTaskReminder(newTaskId, { createdBy: chatId, target: rm.target, fireAt: rm.fireAtIso }); } catch {}
                        }
                      }

                      WebApp?.HapticFeedback?.notificationOccurred?.('success');
                      onCreated?.();
                      closeModal();

                      return { taskId: newTaskId, taskTitle: val };
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Пикер группы */}
      {pickerOpen && isSimpleMode && (
        <div
          onClick={() => { setPickerOpen(false); focusText(); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1b2030',
              color: '#e8eaed',
              border: '1px solid #2a3346',
              borderRadius: 12,
              padding: 12,
              width: 'min(460px, 92vw)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Выберите группу</div>
              <button
                onClick={() => { setPickerOpen(false); focusText(); }}
                style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                onClick={() => setGroupTab('own')}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid #2a3346',
                  background: groupTab === 'own' ? '#1b2030' : '#121722',
                  color: groupTab === 'own' ? '#8aa0ff' : '#e8eaed',
                  cursor: 'pointer',
                }}
              >
                Мои проекты ({ownGroups.length})
              </button>
              <button
                onClick={() => setGroupTab('member')}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid #2a3346',
                  background: groupTab === 'member' ? '#1b2030' : '#121722',
                  color: groupTab === 'member' ? '#8aa0ff' : '#e8eaed',
                  cursor: 'pointer',
                }}
              >
                Проекты со мной ({memberGroups.length})
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8, maxHeight: '50vh', overflow: 'auto' }}>
              {groupTab === 'own' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" name="group" checked={!groupId} onChange={() => setGroupId(null)} />
                  <span>Моя группа (личная доска)</span>
                </label>
              )}

              {groupTab === 'own'
                ? ownGroups.map((g) => (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="radio" name="group" checked={groupId === g.id} onChange={() => setGroupId(g.id)} />
                      <span>{g.title}</span>
                    </label>
                  ))
                : memberGroups.map((g) => (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="radio" name="group" checked={groupId === g.id} onChange={() => setGroupId(g.id)} />
                      <span>
                        {g.title}
                        {g.ownerName && <span style={{ opacity: 0.7, marginLeft: 6 }}>(👑 {g.ownerName})</span>}
                      </span>
                    </label>
                  ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => { setPickerOpen(false); setToolsOpen(true); focusText(); }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a3346',
                  background: '#202840',
                  color: '#e8eaed',
                }}
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка напоминания при создании */}
      <RemindersModal
        open={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        onPick={({ target, fireAtIso }) => {
          setRemindersDraft(prev => [...prev, { target, fireAtIso }]);
          setRemindersOpen(false);
        }}
      />

      {/* модалка камеры */}
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => { setCameraOpen(false); focusText(); }}
        onCapture={(file) => { setPendingFiles((prev) => [...prev, file]); focusText(); }}
      />

      {/* модалка дедлайна */}
      <DeadlinePicker
        open={deadlineOpen}
        value={deadlineAt}
        onChange={(v) => setDeadlineAt(v)}
        onClose={() => { setDeadlineOpen(false); focusText(); }}
      />

      {acceptOpen && (
        <div
          onClick={() => { setAcceptOpen(false); focusText(); }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex: 2000, display:'flex', alignItems:'center', justifyContent:'center' }}
        >
          <div onClick={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(420px, 92vw)' }}>
            <div style={{ fontWeight:700, marginBottom:8 }}>☝️ Условия приёма</div>
            <div style={{ display:'grid', gap:8 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" checked={acceptCondition==='NONE'} onChange={()=>setAcceptConditionState('NONE')} />
                <span>Без условий</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" checked={acceptCondition==='PHOTO'} onChange={()=>setAcceptConditionState('PHOTO')} />
                <span>Нужно фото 📸</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" checked={acceptCondition==='APPROVAL'} onChange={()=>setAcceptConditionState('APPROVAL')} />
                <span>Нужно согласование 🤝</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" checked={acceptCondition==='PHOTO_AND_APPROVAL'} onChange={()=>setAcceptConditionState('PHOTO_AND_APPROVAL')} />
                <span>Фото + согласование 📸🤝</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" checked={acceptCondition==='DOC_AND_APPROVAL'} onChange={()=>setAcceptConditionState('DOC_AND_APPROVAL')} />
                <span>Документ + согласование 📎🤝</span>
              </label>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10 }}>
              <button onClick={()=>{ setAcceptOpen(false); focusText(); }} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Готово</button>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ Bounty picker */}
      <BountyPicker
        open={bountyOpen}
        initial={bountyAmount}
        initialRub={bountyRub ?? null}
        onApply={async (n, approxRub) => {
          // сохраняем выбранную сумму, но НЕ блокируем панель до подтверждения транзакции
          setBountyAmount(n);
          const rub = typeof approxRub === 'number' ? approxRub : (bountyRub ?? null);
          setBountyRub(rub);
          // авто-оплата сразу после выбора — передаём сумму явно, чтобы избежать гонок setState
          setTimeout(() => { startTonPayment(null, n, rub ?? null); }, 0);
        }}
        onClose={() => { setBountyOpen(false); focusText(); }}
      />
    </>
  );
}
