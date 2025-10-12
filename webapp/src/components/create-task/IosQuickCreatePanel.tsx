import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { createTask, updateTask, listGroups, transcribeVoice, API_BASE, setTaskDeadline, setAcceptCondition, setTaskBounty, type Group, getGroupMembers, type GroupMember } from '../../api';
import { createTaskReminder } from '../../api/reminders';
import DeadlinePicker from '../DeadlinePicker';
import VoiceRecorder from '../VoiceRecorder';
import BountyPicker from '../BountyPicker';
import TonWalletConnect from '../TonWalletConnect';
import useAudioPreview from './hooks/useAudioPreview';
import useTonPayment from './hooks/useTonPayment';
// import { useKeyboardInsets } from '../../hooks/useKeyboardInsets';
import useKeyboardDock from '../../hooks/useKeyboardDock';
import GroupPicker from './GroupPicker';
import CameraCaptureModal from '../CameraCaptureModal';
import IosPostCreateActionsLauncher from '../IosPostCreateActionsLauncher';
import ComplexityToggle from './ComplexityToggle';
import RobotPicker from './robots/RobotPicker';
import WeatherScheduleModal from './robots/WeatherScheduleModal';
import RecurringScheduleModal, { type RecurringConfig } from './robots/RecurringScheduleModal';
import WebApp from '@twa-dev/sdk';

// Use unified keyboard insets (VisualViewport + TWA viewport) to dock the panel

export default function IosQuickCreatePanel({ open, onClose, chatId, defaultGroupId, onCreated, initialEdit }: { open: boolean; onClose: () => void; chatId: string; defaultGroupId?: string | null; onCreated?: () => void; initialEdit?: any; }) {
  const microRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bootRef = useRef<HTMLInputElement | null>(null); // hidden input to keep iOS gesture chain
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // Docking handled by useKeyboardDock; no keyboard insets used here
  const [arming, setArming] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const { url: voiceUrl } = useAudioPreview(voiceFile);
  const [sttBusy, setSttBusy] = useState(false);
  const [uploadProg, setUploadProg] = useState<{ done: number; total: number } | null>(null);
  // attachments (docs, gallery, camera)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileAnyRef = useRef<HTMLInputElement | null>(null);
  const filePhotoRef = useRef<HTMLInputElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  // deadline (🚩)
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  // accept (☝️)
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptCondition, setAcceptConditionState] = useState<'NONE' | 'PHOTO' | 'APPROVAL' | 'PHOTO_AND_APPROVAL' | 'DOC_AND_APPROVAL'>('NONE');
  // reminders (⏰)
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [remindersDraft, setRemindersDraft] = useState<Array<{ target: 'ME' | 'RESPONSIBLE' | 'ALL'; fireAtIso: string }>>([]);
  // complexity (🔘)
  const [complexity, setComplexity] = useState<number | null>(null);
  // bounty (💰)
  const [bountyOpen, setBountyOpen] = useState(false);
  const [bountyAmount, setBountyAmount] = useState<number>(0);
  const [bountyRub, setBountyRub] = useState<number | null>(null);
  const [bountyLocked, setBountyLocked] = useState<boolean>(false);
  const [walletConnecting, setWalletConnecting] = useState<boolean>(false); // hide BountyPicker when wallet modal is open
  const { startPayment, refund, loadDraft, clearDraft } = useTonPayment(chatId);
  // robots (🤖)
  const [robotOpen, setRobotOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string | null>(null);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [weatherCfg, setWeatherCfg] = useState<null | { atIso: string; city: string; lat: number; lon: number; op: 'GE'|'LE'; valueC: number }>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringCfg, setRecurringCfg] = useState<RecurringConfig | null>(null);
  // group selection (like Android header)
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(defaultGroupId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groupTab, setGroupTab] = useState<'own' | 'member'>('own');
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  // members for PostCreateActionsLauncher
  const [members, setMembers] = useState<Array<{ chatId: string; name: string }>>([]);
  // edit mode
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const isEdit = !!editTaskId;

  // (no continuous kb tracking; compute on demand)
  // lock keyboard height at moment of opening modal to center above keyboard
  const [modalDockBottom, setModalDockBottom] = useState(0);
  const computeKbLiftNow = () => {
    try {
      const vv: VisualViewport | undefined = (typeof window !== 'undefined' ? (window as any).visualViewport : undefined);
      const innerH = (typeof window !== 'undefined' ? window.innerHeight : 0);
      const vvH = vv?.height || innerH;
      const raw = Math.max(0, innerH - vvH);
      return raw > 120 ? raw : 0;
    } catch { return 0; }
  };
  // (no effect: we lock value on modal open and reset shortly after)
  // Use the same docking logic as SettingsKeyboardTest (robust on iOS)
  useKeyboardDock(microRef as any, { openFollowMs: 600, closeFollowMs: 0, noLift: true });

  useEffect(() => {
    if (!open) return;
    // temporary fallback lift while viewport syncs (iOS only)
    let tf: any = null;
    const tryFocus = () => { focusEditableEnd(); };
    tryFocus();
    const t1 = setTimeout(tryFocus, 60);
    const t2 = setTimeout(tryFocus, 240);
    // aggressively ensure caret is inside to actually open the iOS keyboard
    let keepFocus = true;
    let focusTries = 0;
    const focusLoop = () => {
      if (!keepFocus) return;
      focusTries += 1;
      try { focusEditableEnd(); } catch {}
      try {
        const vv: VisualViewport | undefined = (typeof window !== 'undefined' ? (window as any).visualViewport : undefined);
        const innerH = (typeof window !== 'undefined' ? window.innerHeight : 0);
        const vvH = vv?.height || innerH;
        const opened = Math.max(0, innerH - vvH) > 0;
        if (opened || focusTries > 20) { keepFocus = false; return; }
      } catch {}
      setTimeout(focusLoop, 60);
    };
    setTimeout(focusLoop, 0);
    // arm interactions guard for a short time to absorb the opening tap
    setArming(true);
    const armT = setTimeout(() => setArming(false), 220);
    return () => { if (tf) clearTimeout(tf); clearTimeout(t1); clearTimeout(t2); clearTimeout(armT); setArming(true); };
  }, [open]);

  // load groups when panel opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const r = await listGroups(chatId);
        if ((r as any)?.ok) setGroups((r as any).groups || []);
      } catch {}
    })();
  }, [open, chatId]);

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
        const uniq = new Map<string, { chatId: string; name: string }>();
        raw.forEach((m) => { if (!m?.chatId) return; const nm = (m.name || String(m.chatId)).trim(); uniq.set(String(m.chatId), { chatId: String(m.chatId), name: nm || String(m.chatId) }); });
        if (!cancelled) { const arr = Array.from(uniq.values()); setMembers(arr.length ? arr : [{ chatId, name: 'Я' }]); }
      } catch { if (!cancelled) setMembers([{ chatId, name: 'Я' }]); }
    }
    loadMembers();
    return () => { cancelled = true; };
  }, [groupId, chatId]);

  // Compute schedule info display
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

  // Compute recurring info display
  const recurringInfo = useMemo(() => {
    if (!recurringCfg) return null;
    const { pattern, time, excludeDays, monthDay, weekOfMonth, dayOfWeek, count } = recurringCfg;
    const parts = [];
    if (pattern === 'daily') {
      parts.push(`Каждый день в ${time}`);
      if (excludeDays && excludeDays.length > 0) {
        const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        parts.push(`кроме ${excludeDays.map(d => days[d]).join(', ')}`);
      }
    } else {
      if (monthDay) {
        parts.push(`Каждый месяц ${monthDay}-го числа в ${time}`);
      } else if (weekOfMonth && dayOfWeek !== undefined) {
        const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
        parts.push(`Каждый месяц ${weekOfMonth}-я неделя ${days[dayOfWeek]} в ${time}`);
      }
    }
    if (count) parts.push(`(${count} раз)`);
    else parts.push('(всегда)');
    return parts.join(' ');
  }, [recurringCfg]);

  // Apply initialEdit if provided (like Android CreateTaskModal)
  useEffect(() => {
    if (!open || !initialEdit) return;
    try {
      const d = initialEdit || {};
      const taskId: string = String(d.taskId || '');
      if (!taskId) return;
      setEditTaskId(taskId);
      setText(String(d.text || ''));
      setGroupId((d.groupId ?? null) as string | null);
      setDeadlineAt(d.deadlineAt || null);
      setAcceptConditionState((d.acceptCondition as any) || 'NONE');
    } catch {}
  }, [open, initialEdit]);

  // Aggressive focus loop for edit mode (like panel open logic)
  // Triggered when text changes AND we're in edit mode - ensures text is rendered before focusing
  useEffect(() => {
    if (!open || !editTaskId || !text) return;
    // Aggressive focus loop to ensure caret placement for edit
    let keepFocus = true;
    let focusTries = 0;
    const focusLoop = () => {
      if (!keepFocus) return;
      focusTries += 1;
      try { ensureCaretFocus(); } catch {}
      try {
        const vv: VisualViewport | undefined = (typeof window !== 'undefined' ? (window as any).visualViewport : undefined);
        const innerH = (typeof window !== 'undefined' ? window.innerHeight : 0);
        const vvH = vv?.height || innerH;
        const opened = Math.max(0, innerH - vvH) > 0;
        if (opened || focusTries > 20) { keepFocus = false; return; }
      } catch {}
      setTimeout(focusLoop, 60);
    };
    setTimeout(focusLoop, 0);
    return () => { keepFocus = false; };
  }, [open, editTaskId, text]);

  // Clear edit mode when panel closes
  useEffect(() => {
    if (!open) {
      setEditTaskId(null);
    }
  }, [open]);

  const groupLabel = () => {
    try {
      if (!groupId) return 'Моя группа';
      const g = groups.find(g => String(g.id) === String(groupId));
      if (!g) return 'Группа';
      const isPublic = (g as any)?.isPublic === true;
      return (isPublic ? '🌍 ' : '📁 ') + (g.title || 'Группа');
    } catch { return 'Группа'; }
  };
  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter(Boolean) as File[];
    if (!arr.length) return;
    setPendingFiles(prev => [...prev, ...arr]);
    // Keep keyboard up
    try { setTimeout(() => ensureCaretFocus(), 0); } catch {}
  };
  const openCamera = () => setCameraOpen(true);

  // Handlers to trigger file pickers in capture phase (bypass overlay preventDefault on iOS)
  const firePickAny = (e?: any) => { try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch {} try { fileAnyRef.current?.click(); } catch {} };
  const firePickPhoto = (e?: any) => { try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch {} try { filePhotoRef.current?.click(); } catch {} };

  // accept external focus request from FAB to keep iOS gesture chain
  useEffect(() => {
    const onReq = () => {
      try {
        focusEditableEnd();
      } catch {}
    };
    window.addEventListener('create-task-focus', onReq as any);
    return () => window.removeEventListener('create-task-focus', onReq as any);
  }, []);

  // Keep keyboard up when toggling tools (📎/🤖) — both on open and on close
  useEffect(() => {
    if (!open) return;
    const t0 = setTimeout(() => refocusWithCaretStrong(), 0);
    const t1 = setTimeout(() => refocusWithCaretStrong(), 80);
    const t2 = setTimeout(() => refocusWithCaretStrong(), 160);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); };
  }, [toolsOpen, open]);

  // init draft (bounty) if exists on server when modal opens (like Android)
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
  }, [open, loadDraft]);

  // minimal background stabilization while panel is visible on iOS (no hard height/overflow changes)
  useEffect(() => {
    if (!open) return;
    const body = document.body as any;
    const html = document.documentElement as any;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width, overscroll: html.style.overscrollBehaviorY || '' } as any;
    try { (WebApp as any)?.disableVerticalSwipes?.(); } catch {}
    try { (WebApp as any)?.expand?.(); } catch {}
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    html.style.overscrollBehaviorY = 'contain';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      html.style.overscrollBehaviorY = prev.overscroll;
      try { window.scrollTo(0, scrollY); } catch {}
    };
  }, [open]);

  // Save edit function (similar to Android CreateTaskModal)
  const doSaveEdit = async (): Promise<void> => {
    if (!editTaskId) return;
    const val = text.trim();
    setBusy(true);
    try {
      // Update task text if changed
      if (val) {
        try {
          await updateTask(editTaskId, val, chatId);
        } catch (e: any) {
          if (String(e?.message || '').includes('403')) alert('У вас нет прав на это действие');
          throw e;
        }
      }
      // Update deadline
      try {
        await setTaskDeadline(editTaskId, chatId, deadlineAt);
      } catch {}
      // Update accept conditions
      try {
        await setAcceptCondition(editTaskId, chatId, acceptCondition as any);
      } catch {}
      // Upload new files if any
      if (pendingFiles.length) {
        for (const raw of pendingFiles) {
          try {
            let f = raw;
            if (isHeicLike(f)) { f = await convertHeicToJpeg(f); }
            if (isImageLike(f)) { f = await downscaleImageToMax(f, 2560, 0.9); }
            await uploadFileXHR(editTaskId, chatId, f);
          } catch {}
        }
      }
      try {
        WebApp?.HapticFeedback?.notificationOccurred?.('success');
      } catch {}
      // Notify feed/canvas of local changes
      try {
        const g = (groups || []).find((x: any) => String(x.id) === String(groupId || '')) as any;
        const groupTitle = g ? String(g.title || '') : undefined;
        const isPublicGroup = g ? Boolean((g as any).isPublic) : undefined;
        window.dispatchEvent(new CustomEvent('task-patched', {
          detail: {
            id: editTaskId,
            text: val || undefined,
            deadlineAt: deadlineAt ?? undefined,
            acceptCondition,
            groupId: groupId ?? null,
            groupTitle,
            isPublicGroup,
          }
        }));
      } catch {}
      try {
        onCreated?.();
      } catch {}
      // Clear form and close
      setText('');
      setVoiceFile(null);
      setPendingFiles([]);
      setDeadlineAt(null);
      setAcceptConditionState('NONE');
      setRemindersDraft([]);
      setComplexity(null);
      setScheduleAt(null);
      setWeatherCfg(null);
      setRecurringCfg(null);
      setEditTaskId(null);
      onClose();
    } catch (e: any) {
      alert('Не удалось сохранить изменения');
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<{ id: string; title: string } | null> => {
    // If in edit mode, use doSaveEdit and return null
    if (isEdit) {
      await doSaveEdit();
      return null;
    }

    const val = text.trim();
    if ((val.length === 0 && !voiceFile && pendingFiles.length === 0) || busy) return null;
    setBusy(true);
    setUploadProg(null);
    try {
      const gid = groupId ?? defaultGroupId ?? undefined;
      const baseText = val || 'Голосовое сообщение';

      // If any robot config is set (schedule/weather/recurring), create a preTask instead
      if (scheduleAt || weatherCfg || recurringCfg) {
        const api = await import('../../api');
        const body: any = {
          chatId,
          groupId: gid ?? null,
          text: baseText,
          plannedAssigneeChatId: null,
          triggerMode: 'DATE_PLUS',
          startAt: scheduleAt || null,
          delayMinutes: null,
          autoCancelOnAny: false,
          links: [],
          arm: true,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        // Add weather payload if configured
        if (weatherCfg) {
          body.payload = {
            ...(body.payload || {}),
            weather: {
              kind: 'TEMP_AT_2M',
              lat: weatherCfg.lat,
              lon: weatherCfg.lon,
              city: weatherCfg.city,
              op: weatherCfg.op,
              valueC: weatherCfg.valueC
            }
          };
        }

        // Add recurring config if configured
        if (recurringCfg) {
          body.recurringConfig = recurringCfg;
          // Calculate first run time based on recurringCfg
          if (recurringCfg.time && !body.startAt) {
            const [hours, minutes] = recurringCfg.time.split(':').map(Number);
            const now = new Date();
            const firstRun = new Date(now);
            firstRun.setHours(hours, minutes, 0, 0);

            // If time already passed today, schedule for tomorrow/next month
            if (firstRun <= now) {
              if (recurringCfg.pattern === 'daily') {
                firstRun.setDate(firstRun.getDate() + 1);
              } else if (recurringCfg.pattern === 'monthly') {
                firstRun.setMonth(firstRun.getMonth() + 1);
              }
            }

            // For daily: check excluded days
            if (recurringCfg.pattern === 'daily' && recurringCfg.excludeDays) {
              let attempts = 0;
              while (recurringCfg.excludeDays.includes(firstRun.getDay()) && attempts < 7) {
                firstRun.setDate(firstRun.getDate() + 1);
                attempts++;
              }
            }

            // For monthly: set specific day or week
            if (recurringCfg.pattern === 'monthly') {
              if (recurringCfg.monthDay) {
                firstRun.setDate(recurringCfg.monthDay);
                if (firstRun <= now) {
                  firstRun.setMonth(firstRun.getMonth() + 1);
                }
              } else if (recurringCfg.weekOfMonth !== undefined && recurringCfg.dayOfWeek !== undefined) {
                const firstDayOfMonth = new Date(firstRun.getFullYear(), firstRun.getMonth(), 1);
                const firstDayOfWeek = firstDayOfMonth.getDay();
                const offset = (recurringCfg.dayOfWeek - firstDayOfWeek + 7) % 7;
                const targetDate = 1 + offset + (recurringCfg.weekOfMonth - 1) * 7;
                firstRun.setDate(targetDate);
                if (firstRun <= now) {
                  firstRun.setMonth(firstRun.getMonth() + 1);
                  const newFirstDay = new Date(firstRun.getFullYear(), firstRun.getMonth(), 1);
                  const newFirstDayOfWeek = newFirstDay.getDay();
                  const newOffset = (recurringCfg.dayOfWeek - newFirstDayOfWeek + 7) % 7;
                  const newTargetDate = 1 + newOffset + (recurringCfg.weekOfMonth - 1) * 7;
                  firstRun.setDate(newTargetDate);
                }
              }
            }

            body.startAt = firstRun.toISOString();
          }
        }

        const resp = await (api as any).createPreTask(body);
        if (!(resp as any)?.ok) {
          if (String((resp as any)?.error || '') === 'quota_exceeded') {
            const userChoice = confirm(
              '❌ Превышен лимит на создание задач!\n\n' +
              'Вы исчерпали квоту на создание задач в этом месяце.\n\n' +
              'Нажмите "ОК", чтобы перейти в настройки и пополнить квоту.'
            );
            if (userChoice) {
              onClose();
              try {
                window.dispatchEvent(new CustomEvent('navigate-to-settings', { detail: { tab: 'quota' } }));
              } catch {}
            }
            return null;
          }
          throw new Error((resp as any)?.error || 'pretask_create_failed');
        }

        // PreTask created successfully
        try {
          window.dispatchEvent(new CustomEvent('pre-task-created', {
            detail: {
              preTask: (resp as any)?.preTask || null,
              parentTaskIds: [],
              parentPreTaskIds: []
            }
          }));
        } catch {}

        setText('');
        setVoiceFile(null);
        setPendingFiles([]);
        setDeadlineAt(null);
        setAcceptConditionState('NONE');
        setRemindersDraft([]);
        setComplexity(null);
        setScheduleAt(null);
        setWeatherCfg(null);
        setRecurringCfg(null);
        try { onCreated?.(); } catch {}
        onClose();
        return { id: (resp as any)?.preTask?.id || '', title: baseText };
      }

      // Regular task creation (no robot configs)
      const r = await createTask(chatId, baseText, gid as any, complexity ?? undefined);
      if ((r as any)?.ok !== false) {
        const newTaskId = (r as any)?.task?.id || '';
        if (newTaskId) {
          // Upload sequentially like Android modal
          const queue: File[] = [];
          if (voiceFile) queue.push(voiceFile);
          if (pendingFiles.length) queue.push(...pendingFiles);
          setUploadProg({ done: 0, total: queue.length });
          let done = 0;
          const failed: File[] = [];
          for (const raw of queue) {
            let f = raw;
            if (isHeicLike(f)) { f = await convertHeicToJpeg(f); }
            if (isImageLike(f)) { f = await downscaleImageToMax(f, 2560, 0.9); }
            // retry up to 2 attempts
            let ok = false; let lastErr: any = null;
            for (let attempt = 0; attempt < 2 && !ok; attempt++) {
              try { await uploadFileXHR(newTaskId, chatId, f); ok = true; } catch (e) { lastErr = e; }
            }
            if (!ok) {
              try { console.warn('[ios-panel] file upload failed', f?.name, lastErr); } catch {}
              failed.push(raw);
            }
            done += 1; setUploadProg({ done, total: queue.length });
          }
          // If some files failed, keep panel open and leave failed files in the list for retry
          if (failed.length > 0) {
            setPendingFiles(failed.filter(x => x !== voiceFile));
            setVoiceFile(failed.includes(voiceFile as any) ? voiceFile : null);
            setBusy(false);
            setUploadProg(null);
            try { alert(`Не удалось загрузить: ${failed.map(f => f.name || 'файл').join(', ')}`); } catch {}
            return null; // do not clear/close
          }
          // apply deadline if set
          if (deadlineAt) {
            try { await setTaskDeadline(newTaskId, chatId, deadlineAt); } catch {}
          }
          // apply accept condition if set
          if (acceptCondition && acceptCondition !== 'NONE') {
            try { await setAcceptCondition(newTaskId, chatId, acceptCondition); } catch {}
          }
          // apply reminders if any
          if (remindersDraft.length) {
            for (const rm of remindersDraft) {
              try { await createTaskReminder(newTaskId, { createdBy: chatId, target: rm.target, fireAt: rm.fireAtIso }); } catch {}
            }
          }
          // apply bounty if locked (like Android)
          if (bountyLocked && bountyRub && bountyRub > 0) {
            try {
              await setTaskBounty(newTaskId, chatId, bountyRub);
            } catch (e) {
              console.warn('[ios-panel] failed to set bounty', e);
            }
          }
        }
        // Clear bounty draft after successful creation
        if (bountyLocked) {
          try {
            await clearDraft();
          } catch {}
        }
        setText('');
        setVoiceFile(null);
        setPendingFiles([]);
        setDeadlineAt(null);
        setAcceptConditionState('NONE');
        setRemindersDraft([]);
        setComplexity(null);
        setBountyAmount(0);
        setBountyRub(null);
        setBountyLocked(false);
        setScheduleAt(null);
        setWeatherCfg(null);
        setRecurringCfg(null);
        try { onCreated?.(); } catch {}
        onClose();
        return { id: newTaskId, title: baseText };
      }
      return null;
    } catch (e: any) {
      // Проверяем, не превышена ли квота
      try {
        const msg = String(e?.message || '');
        const isQuotaError = /quota_exceeded/i.test(msg) || (e?.response?.status === 402);
        if (isQuotaError) {
          // Показываем красивое сообщение
          const userChoice = confirm(
            '❌ Превышен лимит на создание задач!\n\n' +
            'Вы исчерпали квоту на создание задач в этом месяце.\n\n' +
            'Нажмите "ОК", чтобы перейти в настройки и пополнить квоту.'
          );
          if (userChoice) {
            // Закрываем панель и переходим в настройки
            onClose();
            // Отправляем событие для переключения на таб "Настройки"
            try {
              window.dispatchEvent(new CustomEvent('navigate-to-settings', { detail: { tab: 'quota' } }));
            } catch {}
          }
        } else {
          alert('Не удалось создать задачу');
        }
      } catch {}
    } finally {
      setBusy(false);
    }
    return null;
  };

  // Simple caret helper to keep iOS keyboard up when starting mic
  const ensureCaretFocus = () => {
    try {
      // tap hidden input first to preserve gesture chain
      bootRef.current?.focus({ preventScroll: true } as any);
    } catch {}
    try {
      const el = inputRef.current as HTMLTextAreaElement | null;
      if (el) {
        el.focus({ preventScroll: true } as any);
        const len = (el.value || '').length; el.setSelectionRange?.(len, len);
      }
    } catch {}
  };

  // STT animation label (А./А../А...)
  const [sttTick, setSttTick] = useState(0);
  useEffect(() => {
    if (!sttBusy) return;
    const t = setInterval(() => setSttTick((n) => (n + 1) % 3), 500);
    return () => clearInterval(t);
  }, [sttBusy]);
  const sttLabel = (() => 'А' + '.'.repeat((sttTick % 3) + 1))();

  const handleTranscribe = async (lang: 'ru' | 'en' = 'ru') => {
    if (!voiceFile || sttBusy) return;
    setSttBusy(true);
    try {
      const r = await transcribeVoice(voiceFile, lang);
      if ((r as any)?.ok && typeof (r as any).text === 'string') {
        const recognized = String((r as any).text || '').trim();
        if (recognized) {
          setText((prev) => (prev.trim() ? `${prev}\n${recognized}` : recognized));
          setTimeout(() => ensureCaretFocus(), 0);
        }
      } else {
        alert((r as any)?.error || 'Не удалось распознать речь');
      }
    } catch (e: any) {
      try { alert(e?.message || 'Ошибка распознавания'); } catch {}
    } finally {
      setSttBusy(false);
    }
  };

  // XHR upload with better reliability on iOS and large files
  function uploadFileXHR(taskId: string, chatId2: string, file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = `${API_BASE}/tasks/${encodeURIComponent(taskId)}/media?chatId=${encodeURIComponent(chatId2)}`;
        const form = new FormData();
        form.append('file', file, file.name);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.responseType = 'json';
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve();
          return reject(new Error(`upload_failed_${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('upload_network_error'));
        try { xhr.send(form); } catch (e) { reject(e as any); }
      } catch (e) { reject(e as any); }
    });
  }

  // Convert HEIC/HEIF images to JPEG for better backend compatibility
  const isHeicLike = (f: File) => {
    const t = String(f.type || '').toLowerCase();
    const n = String(f.name || '').toLowerCase();
    return t.includes('image/heic') || t.includes('image/heif') || /\.(heic|heif)$/.test(n);
  };
  const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src; });
  async function convertHeicToJpeg(file: File): Promise<File> {
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader(); fr.onload = () => resolve(String(fr.result || '')); fr.onerror = reject; fr.readAsDataURL(file);
      });
      const img = await loadImage(dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width; canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d'); if (!ctx) return file;
      ctx.drawImage(img, 0, 0);
      const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob_failed')), 'image/jpeg', 0.92));
      const base = (file.name || 'photo').replace(/\.(heic|heif)$/i, '');
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    } catch { return file; }
  }

  const isImageLike = (f: File) => String(f.type || '').toLowerCase().startsWith('image/') && !/image\/(gif)/i.test(f.type || '');
  async function downscaleImageToMax(file: File, maxEdge = 2560, quality = 0.9): Promise<File> {
    try {
      const dataUrl: string = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result || '')); fr.onerror = reject; fr.readAsDataURL(file); });
      const img = await loadImage(dataUrl);
      let w = img.naturalWidth || img.width; let h = img.naturalHeight || img.height;
      const scale = Math.max(w, h) > maxEdge ? (maxEdge / Math.max(w, h)) : 1;
      // Also compress very large files even if under maxEdge
      if (scale >= 1 && file.size <= 6 * 1024 * 1024) return file;
      const nw = Math.round(w * scale); const nh = Math.round(h * scale);
      const canvas = document.createElement('canvas'); canvas.width = nw; canvas.height = nh;
      const ctx = canvas.getContext('2d'); if (!ctx) return file; ctx.drawImage(img, 0, 0, nw, nh);
      const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob_failed')), 'image/jpeg', quality));
      const base = (file.name || 'image').replace(/\.(jpeg|jpg|png|gif|webp|heic|heif)$/i, '');
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    } catch { return file; }
  }


  const removePendingAt = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  if (!open) return null;

  // For contentEditable we rely on natural height; keep helper no-op
  const adjustTextHeight = (_el: HTMLElement | null) => {};

  const focusEditableEnd = () => {
    try {
      const el = inputRef.current as HTMLTextAreaElement | null;
      if (!el) return;
      el.focus({ preventScroll: true } as any);
      const len = (el.value || '').length;
      el.setSelectionRange?.(len, len);
    } catch {}
  };

  const refocusWithCaretStrong = () => {
    try { inputRef.current?.click(); } catch {}
    try { bootRef.current?.focus({ preventScroll: true } as any); } catch {}
    focusEditableEnd();
    // schedule a couple more attempts for iOS
    setTimeout(() => focusEditableEnd(), 0);
    setTimeout(() => focusEditableEnd(), 60);
    requestAnimationFrame(() => focusEditableEnd());
  };

  const overlay = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: walletConnecting ? 1 : 999999, pointerEvents: 'auto', isolation: 'isolate' as any, backfaceVisibility: 'hidden' as any, transform: 'translateZ(0)',
        // darker dim; add blur on non‑iOS only
        background: 'rgba(0,0,0,.8)',
        backdropFilter: (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent || '')) ? undefined : 'blur(8px)',
        WebkitBackdropFilter: (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent || '')) ? undefined : ('blur(8px)' as any),
        touchAction: 'none',
        overscrollBehavior: 'none',
        visibility: walletConnecting ? 'hidden' as any : 'visible' as any  // Hide completely when wallet is connecting
      }}
      onClick={() => {
        // Do not close panel while any sub-modal/sheet is open
        if (pickerOpen || deadlineOpen || acceptOpen || remindersOpen || cameraOpen || robotOpen || scheduleOpen || weatherOpen || recurringOpen || bountyOpen) return;
        if (!arming && !busy) onClose();
      }}
      onTouchStart={(e) => {
        try {
          const t = e.target as Node | null;
          const withinPanel = !!(t && microRef.current && microRef.current.contains(t));
          if (!withinPanel) {
            // ignore while a sub-modal is open
            if (pickerOpen || deadlineOpen || acceptOpen || remindersOpen || cameraOpen || robotOpen || scheduleOpen || weatherOpen || recurringOpen || bountyOpen) return;
            e.preventDefault(); e.stopPropagation(); if (!arming && !busy) onClose();
          }
        } catch {}
      }}
      onPointerDown={(e) => {
        try {
          const t = e.target as Node | null;
          const withinPanel = !!(t && microRef.current && microRef.current.contains(t));
          if (!withinPanel) {
            if (pickerOpen || deadlineOpen || acceptOpen || remindersOpen || cameraOpen || robotOpen || scheduleOpen || weatherOpen || recurringOpen || bountyOpen) return;
            e.preventDefault(); e.stopPropagation(); if (!arming && !busy) onClose();
          }
        } catch {}
      }}
      onMouseDown={(e) => {
        try {
          const t = e.target as Node | null;
          const withinPanel = !!(t && microRef.current && microRef.current.contains(t));
          if (!withinPanel) {
            if (pickerOpen || deadlineOpen || acceptOpen || remindersOpen || cameraOpen || robotOpen || scheduleOpen || weatherOpen || recurringOpen || bountyOpen) return;
            e.preventDefault(); e.stopPropagation(); if (!arming && !busy) onClose();
          }
        } catch {}
      }}
      onTouchMove={(e) => { try { e.preventDefault(); e.stopPropagation(); } catch {} }}
      onWheel={(e) => { try { e.preventDefault(); e.stopPropagation(); } catch {} }}
    >
      {/* hidden focus target to rebootstrap iOS keyboard reliably */}
      <input ref={bootRef} aria-hidden={true} tabIndex={-1} style={{ position:'fixed', opacity:0, width:1, height:1, bottom:0, left:0, pointerEvents:'none' }} />

      <div
        ref={microRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: 10,
          right: 10,
          bottom: 0,
          pointerEvents: arming ? 'none' : 'auto',
          zIndex: walletConnecting ? 1 : 1000000, // Lower z-index when wallet modal is open
          // transform managed by useKeyboardDock
          transition: 'none',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          willChange: 'transform',
          backfaceVisibility: 'hidden' as any,
        }}
      >
        {/* group picker header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Группа</div>
          <button
            onMouseDownCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
            onTouchStartCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
            onClick={() => {
              setPickerOpen(true);
              // blur while modal is open
              try { inputRef.current?.blur(); (document.activeElement as any)?.blur?.(); } catch {}
              // after keyboard hides, center fully
              setTimeout(() => setModalDockBottom(0), 300);
            }}
            title="Выбрать группу"
            style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', fontSize: 12, cursor: 'pointer' }}
          >
            <b>{groupLabel()}</b>
          </button>
        </div>
        <div
          style={{
            position: 'relative',
            background: '#111827',
            border: '1px solid #2a3346',
            borderRadius: 12,
            borderBottomLeftRadius: toolsOpen ? 0 : 12,
            borderBottomRightRadius: toolsOpen ? 0 : 12,
            padding: 8,
          }}
        >
          <div style={{ position: 'relative', flex: 1, minWidth: 0, paddingRight: 52, paddingLeft: 52 }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => { setText(e.target.value); adjustTextHeight(e.currentTarget); }}
              onInput={(e) => adjustTextHeight(e.currentTarget as HTMLTextAreaElement)}
              onFocus={(e) => adjustTextHeight(e.currentTarget)}
              placeholder="Новая задача…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#0b1220', color: '#e8eaed',
                border: '1px solid #1f2937', borderRadius: 14,
                // like Android composer: compact left inset with leading 💰 inside field
                padding: '8px 12px', paddingLeft: 30,
                fontSize: 16, lineHeight: '20px',
                minHeight: 38, resize: 'none' as any, overflow: 'hidden',
              }}
            />

            {/* bounty inside input (top-left) */}
            <button
              onMouseDownCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
              onTouchStartCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
              onClick={() => { setBountyOpen(true); try { inputRef.current?.blur(); (document.activeElement as any)?.blur?.(); } catch {}; setTimeout(()=>setModalDockBottom(0), 300); }}
              title="Вознаграждение"
              style={{ position: 'absolute', left: 55, top: 8, width: 26, height: 26, borderRadius: 999, border: '1px solid #1f2937', background: '#0b1220', color: '#facc15', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
            >💵</button>

            {/* send slot: 💾 (save) when editing, ➤ (create) or mic (🎙️) when creating */}
            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, pointerEvents: 'none' }}>
              <div style={{ width: '100%', height: '100%', pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isEdit ? (
                  <button
                    onClick={doSaveEdit}
                    disabled={busy}
                    title="Сохранить"
                    style={{ width: 36, height: 36, borderRadius: 999, background: '#2563eb', color: '#fff', border: '1px solid transparent', fontSize: 16, opacity: busy ? 0.6 : 1, cursor: 'pointer' }}
                  >
                    💾
                  </button>
                ) : (text.trim().length > 0 || !!voiceFile || pendingFiles.length > 0) ? (
                  // If robot is configured (schedule/weather/recurring), just save without post-actions
                  (scheduleAt || weatherCfg || recurringCfg) ? (
                    <button
                      onClick={save}
                      disabled={busy}
                      title="Создать"
                      style={{ width: 36, height: 36, borderRadius: 999, background: '#2563eb', color: '#fff', border: '1px solid transparent', fontSize: 16, opacity: busy ? 0.6 : 1, cursor: 'pointer' }}
                    >
                      ➤
                    </button>
                  ) : (
                    <IosPostCreateActionsLauncher
                      label="➤"
                      disabled={busy}
                      style={{ width: 36, height: 36, borderRadius: 999, background: '#2563eb', color: '#fff', border: '1px solid transparent', fontSize: 16, opacity: busy ? 0.6 : 1 }}
                      meChatId={chatId}
                      members={members}
                      onMake={async () => {
                        // Call save and get taskId/title
                        const result = await save();
                        if (!result) throw new Error('Task creation failed');
                        return { taskId: result.id, taskTitle: result.title };
                      }}
                    />
                  )
                ) : (
                  <div onMouseDownCapture={ensureCaretFocus} onTouchStartCapture={ensureCaretFocus} style={{ width:'100%', height:'100%' }}>
                    <VoiceRecorder maxSeconds={30} buttonStyle={{ width:'100%', height:'100%' }} onRecorded={(file) => { setVoiceFile(file); setTimeout(() => ensureCaretFocus(), 0); }} />
                  </div>
                )}
              </div>
            </div>

            {/* paperclip inside input (top-right, before send) */}
            <button
              onMouseDownCapture={(e) => { try { e.preventDefault(); e.stopPropagation(); } catch {}; ensureCaretFocus(); }}
              onTouchStartCapture={(e) => { try { e.preventDefault(); e.stopPropagation(); } catch {}; ensureCaretFocus(); }}
              onClick={() => { setToolsOpen(v => !v); requestAnimationFrame(() => refocusWithCaretStrong()); setTimeout(() => refocusWithCaretStrong(), 80); }}
              title="Вложения и действия"
              style={{ position: 'absolute', right: 52, top: 8, width: 28, height: 28, borderRadius: 999, border: '1px solid #1f2937', background: '#0b1220', color: '#9ca3af' }}
            >📎</button>

            {/* robot button inside input (left overlay, symmetric to send) */}
            {!isEdit && !scheduleAt && !weatherCfg && !recurringCfg && (
              <div style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, pointerEvents: 'none', zIndex: 1 }}>
                <div style={{ width: '100%', height: '100%', pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <button
                    onMouseDownCapture={(e) => { try { e.preventDefault(); e.stopPropagation(); setModalDockBottom(computeKbLiftNow()); } catch {}; }}
                    onTouchStartCapture={(e) => { try { e.preventDefault(); e.stopPropagation(); setModalDockBottom(computeKbLiftNow()); } catch {}; }}
                    onClick={() => { setRobotOpen(true); try { inputRef.current?.blur(); (document.activeElement as any)?.blur?.(); } catch {}; setTimeout(()=>setModalDockBottom(0), 300); }}
                    title="Роботы"
                    style={{ width: 36, height: 36, borderRadius: 999, background: '#2563eb', color: '#fff', border: '1px solid transparent', fontSize: 16 }}
                    aria-label="Роботы"
                  >
                    🤖
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* voice attachment row */}
          {voiceFile && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
              {voiceUrl ? (
                <audio src={voiceUrl} controls style={{ height: 28, maxWidth: '70%' }} />
              ) : (
                <div style={{ fontSize: 12, opacity: 0.85, flex: 1, minWidth: 0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{voiceFile.name || 'voice'}</div>
              )}
              <button
                onClick={() => handleTranscribe('ru')}
                disabled={sttBusy}
                title="Распознать речь"
                style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', fontSize: 12, cursor: 'pointer' }}
              >
                {sttBusy ? sttLabel : '~А'}
              </button>
              <button
                onClick={() => setVoiceFile(null)}
                title="Убрать голосовой файл"
                style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', fontSize: 14, cursor: 'pointer' }}
              >✕</button>
            </div>
          )}
          {/* file chips (documents/photos) inside dark panel */}
          {pendingFiles.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop: voiceFile ? 6 : 8 }}>
              {pendingFiles.map((f, idx) => (
                <div key={`${idx}-${f.name}-${f.size}`} style={{ display:'inline-flex', alignItems:'center', gap:8, maxWidth:'100%', background:'#0b1220', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:999, padding:'4px 10px' }}>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth: 200 }}>{f.name || 'файл'}</span>
                  <button
                    onClick={() => removePendingAt(idx)}
                    title="Убрать файл"
                    style={{ background:'transparent', border:'none', color:'#e8eaed', cursor:'pointer', fontSize:14, lineHeight:1 }}
                  >✕</button>
                </div>
              ))}
              {uploadProg && uploadProg.total > 0 ? (
                <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.9 }}>
                  Загружаю {uploadProg.done}/{uploadProg.total}…
                </div>
              ) : null}
            </div>
          )}
        </div>
        {toolsOpen && (
          <div
            style={{
              // без зазора к верхнему блоку
              marginTop: 0,
              background: '#0f1422',
              border: '1px solid #2a3346',
              // убираем двойную границу и скругление сверху — прилипает вплотную
              borderTopWidth: 0,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 12,
              padding: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
              <button onMouseDownCapture={firePickAny} onTouchStartCapture={firePickAny} onClick={firePickAny} title="📑 Документ" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', cursor:'pointer' }}>📑</button>
              <button onMouseDownCapture={firePickPhoto} onTouchStartCapture={firePickPhoto} onClick={firePickPhoto} title="🖼️ Галерея" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', cursor:'pointer' }}>🖼️</button>
              <button
                onMouseDownCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
                onTouchStartCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
                onClick={() => { openCamera(); try { inputRef.current?.blur(); (document.activeElement as any)?.blur?.(); } catch {}; setTimeout(()=>setModalDockBottom(0), 300); }}
                title="📸 Камера"
                style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', cursor:'pointer' }}
              >📸</button>
              <button
                onMouseDownCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
                onTouchStartCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
                onClick={() => { setDeadlineOpen(true); try { inputRef.current?.blur(); (document.activeElement as any)?.blur?.(); } catch {}; setTimeout(()=>setModalDockBottom(0), 300); }}
                title="Установить дедлайн"
                style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', cursor:'pointer' }}
              >🚩</button>
              <button
                onMouseDownCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
                onTouchStartCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
                onClick={() => { setAcceptOpen(true); try { inputRef.current?.blur(); (document.activeElement as any)?.blur?.(); } catch {}; setTimeout(()=>setModalDockBottom(0), 300); }}
                title="Условия приёма"
                style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', cursor:'pointer' }}
              >☝️</button>
              <button
                onMouseDownCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
                onTouchStartCapture={(e)=>{ try{ e.preventDefault(); e.stopPropagation(); } catch{}; setModalDockBottom(computeKbLiftNow()); }}
                onClick={() => { setRemindersOpen(true); try { inputRef.current?.blur(); (document.activeElement as any)?.blur?.(); } catch {}; setTimeout(()=>setModalDockBottom(0), 300); }}
                title="Добавить напоминание"
                style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', cursor:'pointer' }}
              >⏰</button>
              <ComplexityToggle
                value={complexity}
                onChange={(n)=>{ setComplexity(n); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); } catch {} }}
                dockBottom={modalDockBottom}
                onBeforeOpen={() => { setModalDockBottom(computeKbLiftNow()); try { inputRef.current?.blur(); (document.activeElement as any)?.blur?.(); } catch {} }}
                onAfterClose={() => { setTimeout(()=>setModalDockBottom(0), 300); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }}
                style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', cursor:'pointer' }}
              />
            </div>
          </div>
          )}
          {/* Robot config banners */}
          {!isEdit && recurringCfg && (
            <div style={{ marginTop:6, fontSize:12, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', background:'#1e3a5f', color:'#e0f2fe', border:'1px solid #3b82f6', borderRadius:8, padding:'6px 10px' }}>
              <span style={{ fontWeight:500 }}>🔂 {recurringInfo}</span>
              <button onClick={() => { setRecurringCfg(null); setScheduleAt(null); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); } catch {} }} title="Сбросить повторение" style={{ background:'transparent', border:'none', color:'#93c5fd', cursor:'pointer', fontSize:14, fontWeight:600 }}>(x)</button>
            </div>
          )}
          {!isEdit && weatherCfg && (
            <div style={{ marginTop:6, fontSize:12, display:'flex', alignItems:'center', gap:6, background:'#1e3a5f', color:'#e0f2fe', border:'1px solid #3b82f6', borderRadius:8, padding:'6px 10px' }}>
              <span style={{ fontWeight:500 }}>{`🌦️ Если ${new Date(weatherCfg.atIso).toLocaleString()} в (${weatherCfg.city}) погода (${weatherCfg.op==='GE'?'>=':'<='}) ${weatherCfg.valueC}°`}</span>
              <button onClick={() => { setWeatherCfg(null); setScheduleAt(null); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); } catch {} }} title="Сбросить погодное условие" style={{ background:'transparent', border:'none', color:'#93c5fd', cursor:'pointer', fontSize:14, fontWeight:600 }}>(x)</button>
            </div>
          )}
          {!isEdit && !weatherCfg && scheduleInfo && (
            <div style={{ marginTop:6, fontSize:12, display:'flex', alignItems:'center', gap:6, background:'#1e3a5f', color:'#e0f2fe', border:'1px solid #3b82f6', borderRadius:8, padding:'6px 10px' }}>
              <span style={{ fontWeight:500 }}>🕒 Создастся: {scheduleInfo.when} • {scheduleInfo.left}</span>
              <button onClick={() => { setScheduleAt(null); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); } catch {} }} title="Сбросить плановую дату" style={{ background:'transparent', border:'none', color:'#93c5fd', cursor:'pointer', fontSize:14, fontWeight:600 }}>(x)</button>
            </div>
          )}
          {/* Bounty banner (like Android) */}
          {(bountyLocked || bountyAmount > 0) && (
            <div style={{ marginTop:6, fontSize:12, display:'flex', alignItems:'center', gap:6, background:'#facc15', color:'#000', border:'1px solid #eab308', borderRadius:8, padding:'6px 10px', fontWeight:500 }}>
              <span>💵 Вознаграждение: {bountyRub ? `${bountyRub}₽` : `${bountyAmount.toFixed(2)} TON`}{bountyLocked ? ' (оплачено)' : ''}</span>
              {bountyLocked ? (
                <button onClick={async () => {
                  try {
                    await refund(bountyAmount);
                    setBountyAmount(0);
                    setBountyRub(null);
                    setBountyLocked(false);
                    try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); } catch {}
                  } catch (e: any) {
                    alert(e?.message || 'Не удалось вернуть средства');
                  }
                }} title="Вернуть средства" style={{ background:'transparent', border:'none', color:'#000', cursor:'pointer', fontSize:14, fontWeight:600 }}>↩️ Вернуть</button>
              ) : (
                <button onClick={() => { setBountyAmount(0); setBountyRub(null); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); } catch {} }} title="Убрать вознаграждение" style={{ background:'transparent', border:'none', color:'#000', cursor:'pointer', fontSize:14, fontWeight:600 }}>(x)</button>
              )}
            </div>
          )}
          {(deadlineAt || (acceptCondition && acceptCondition !== 'NONE') || remindersDraft.length > 0 || (complexity !== null && complexity > 0)) && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
              {deadlineAt ? (
                <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'#0b1220', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:999, padding:'4px 10px' }}>
                  <span>🚩 {new Date(deadlineAt).toLocaleString()}</span>
                  <button onClick={() => { setDeadlineAt(null); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); } catch {} }} title="Убрать дедлайн" style={{ background:'transparent', border:'none', color:'#e8eaed', cursor:'pointer', fontSize:14, lineHeight:1 }}>✕</button>
                </div>
              ) : null}
              {acceptCondition && acceptCondition !== 'NONE' ? (
                <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'#0b1220', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:999, padding:'4px 10px' }}>
                  <span>☝️ {acceptCondition === 'PHOTO' ? 'нужно фото' : acceptCondition === 'APPROVAL' ? 'нужно согласование' : acceptCondition === 'PHOTO_AND_APPROVAL' ? 'фото + согласование' : acceptCondition === 'DOC_AND_APPROVAL' ? 'документ + согласование' : ''}</span>
                  <button onClick={() => { setAcceptConditionState('NONE'); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); } catch {} }} title="Убрать условия" style={{ background:'transparent', border:'none', color:'#e8eaed', cursor:'pointer', fontSize:14, lineHeight:1 }}>✕</button>
                </div>
              ) : null}
              {remindersDraft.map((r, idx) => (
                <div key={`rem-${idx}`} style={{ display:'inline-flex', alignItems:'center', gap:8, background:'#0b1220', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:999, padding:'4px 10px' }}>
                  <span>⏰ {new Date(r.fireAtIso).toLocaleString()} ({r.target==='ME'?'мне': r.target==='RESPONSIBLE'?'ответственному':'всем'})</span>
                  <button onClick={() => { setRemindersDraft(prev => prev.filter((_, i) => i !== idx)); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); } catch {} }} title="Убрать напоминание" style={{ background:'transparent', border:'none', color:'#e8eaed', cursor:'pointer', fontSize:14, lineHeight:1 }}>✕</button>
                </div>
              ))}
              {(complexity !== null && complexity > 0) ? (
                <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'#0b1220', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:999, padding:'4px 10px' }}>
                  <span>🔘 Сложность: {complexity}</span>
                  <button onClick={() => { setComplexity(null); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); } catch {} }} title="Убрать сложность" style={{ background:'transparent', border:'none', color:'#e8eaed', cursor:'pointer', fontSize:14, lineHeight:1 }}>✕</button>
                </div>
              ) : null}
            </div>
          )}
        {/* hidden pickers always mounted to avoid iOS unmount race */}
        <input ref={fileAnyRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />
        <input ref={filePhotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />

        {/* GroupPicker modal */}
        <GroupPicker
          open={pickerOpen}
          groupTab={groupTab}
          setGroupTab={setGroupTab}
          ownGroups={(groups || []).filter((g:any)=>g?.kind==='own') as any}
          memberGroups={(groups || []).filter((g:any)=>g?.kind==='member') as any}
          groupId={groupId}
          setGroupId={(id) => setGroupId(id)}
          selectedLabelId={selectedLabelId}
          setSelectedLabelId={(id) => setSelectedLabelId(id)}
          onClose={() => {
            // try to restore caret immediately and with retries
            try {
              refocusWithCaretStrong();
              setTimeout(()=>refocusWithCaretStrong(),80);
              setTimeout(()=>refocusWithCaretStrong(),160);
            } catch {}
            setPickerOpen(false);
          }}
          onApply={() => {
            // try to restore caret immediately and with retries
            try {
              refocusWithCaretStrong();
              setTimeout(()=>refocusWithCaretStrong(),80);
              setTimeout(()=>refocusWithCaretStrong(),160);
            } catch {}
            setPickerOpen(false);
          }}
          // Center above keyboard at open; recenter fully after keyboard hides
          dockBottom={modalDockBottom}
        />
        {/* Deadline picker */}
        <DeadlinePicker
          open={deadlineOpen}
          value={deadlineAt}
          onChange={(v) => setDeadlineAt(v)}
          centered={true}
          dockBottom={modalDockBottom}
          onClose={() => { setDeadlineOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }}
        />
        {/* Accept sheet (iOS style) */}
        {acceptOpen && (
          // Render accept sheet in a portal for consistent centering on iOS
          createPortal(
            <div onClick={()=>{ setAcceptOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:1000005, display:'flex', alignItems:'center', justifyContent:'center', paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.max(0, modalDockBottom)}px)`, backdropFilter: (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent || '')) ? undefined : 'blur(8px)', WebkitBackdropFilter: (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent || '')) ? undefined : ('blur(8px)' as any) }}>
              <div onClick={(e)=>e.stopPropagation()} onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()} onTouchStart={(e)=>e.stopPropagation()} onMouseDownCapture={(e)=>e.stopPropagation()} onPointerDownCapture={(e)=>e.stopPropagation()} onTouchStartCapture={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(520px, 94vw)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontWeight:700 }}>☝️ Условия приёма</div>
                  <button onClick={()=>{ setAcceptOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }} style={{ background:'transparent', border:'none', color:'#8aa0ff', fontSize:18, cursor:'pointer' }}>✕</button>
                </div>
                {(['NONE','PHOTO','APPROVAL','PHOTO_AND_APPROVAL','DOC_AND_APPROVAL'] as const).map((opt)=> (
                  <label key={opt} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0' }}>
                    <input type="radio" checked={acceptCondition===opt} onChange={()=>setAcceptConditionState(opt)} />
                    <span>{opt==='NONE'?'Без условий': opt==='PHOTO'?'Нужно фото 📸': opt==='APPROVAL'?'Нужно согласование 🤝': opt==='PHOTO_AND_APPROVAL'?'Фото + согласование 📸🤝':'Документ + согласование 📎🤝'}</span>
                  </label>
                ))}
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:10 }}>
                  <button onClick={()=>{ setAcceptConditionState('NONE'); setAcceptOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }} style={{ padding:'10px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Без условий</button>
                  <button onClick={()=>{ setAcceptOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }} style={{ padding:'10px 12px', borderRadius:10, border:'1px solid transparent', background:'#2563eb', color:'#fff' }}>Готово</button>
                </div>
              </div>
            </div>,
            document.body
          )
        )}
        {/* Reminders sheet (iOS style) */}
        {remindersOpen && (
          <RemindersSheet
            dockBottom={modalDockBottom}
            onClose={()=>{ setRemindersOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }}
            onPick={(item)=>{ setRemindersDraft(prev=>[...prev, item]); setRemindersOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }}
          />
        )}
        <CameraCaptureModal
          open={cameraOpen}
          dockBottom={modalDockBottom}
          onClose={() => { setCameraOpen(false); ensureCaretFocus(); }}
          onCapture={(file) => { setPendingFiles(prev => [...prev, file]); ensureCaretFocus(); }}
        />
        {/* Robot modals - wrapped in high zIndex container for iOS */}
        {robotOpen && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000010 }}>
            <RobotPicker
              open={robotOpen}
              onClose={() => { setRobotOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }}
              onPickSchedule={() => { setRobotOpen(false); setScheduleOpen(true); }}
              onPickWeather={() => { setRobotOpen(false); setWeatherOpen(true); }}
              onPickRecurring={() => { setRobotOpen(false); setRecurringOpen(true); }}
            />
          </div>,
          document.body
        )}
        <DeadlinePicker
          open={scheduleOpen}
          value={scheduleAt}
          title="Плановое создание"
          icon="🕒"
          centered={true}
          dockBottom={modalDockBottom}
          onChange={(v) => {
            if (!v) { setScheduleAt(null); return; }
            const dt = new Date(v);
            if (Number.isNaN(dt.getTime()) || dt.getTime() <= Date.now()) {
              alert('Нельзя выбрать прошлое время');
              return;
            }
            setScheduleAt(v);
          }}
          onClose={() => { setScheduleOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }}
        />
        {weatherOpen && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000010 }}>
            <WeatherScheduleModal
              open={weatherOpen}
              onClose={() => { setWeatherOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }}
              onApply={(p) => { setWeatherOpen(false); setWeatherCfg(p); setScheduleAt(p.atIso); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }}
            />
          </div>,
          document.body
        )}
        {recurringOpen && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000010 }}>
            <RecurringScheduleModal
              open={recurringOpen}
              onClose={() => { setRecurringOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }}
              onApply={(cfg) => {
                setRecurringOpen(false);
                setRecurringCfg(cfg);
                try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {}
              }}
            />
          </div>,
          document.body
        )}
        {/* Bounty picker (iOS style - above keyboard when open) - hide when wallet is connecting */}
        {bountyOpen && !walletConnecting && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000005, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.max(0, modalDockBottom)}px)` }}>
            <BountyPicker
              open={bountyOpen && !walletConnecting}
              initial={bountyAmount}
              initialRub={bountyRub}
              onApply={async (amountTon, approxRub) => {
                const rubAmount = approxRub ?? null;
                if (!bountyLocked) {
                  // Start payment flow
                  try {
                    setWalletConnecting(true); // hide BountyPicker while wallet modal is opening
                    await startPayment(amountTon, rubAmount);
                    // Payment successful, now update state and close
                    setBountyAmount(amountTon);
                    setBountyRub(rubAmount);
                    setBountyLocked(true);
                    setBountyOpen(false);
                    setWalletConnecting(false);
                    try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {}
                  } catch (e: any) {
                    // If wallet connection is needed, close entire iOS panel so TON Connect modal is visible
                    const msg = String(e?.message || '');
                    if (/подключите.*кошел/i.test(msg)) {
                      // Wallet modal is now open - close the entire panel to let user see it
                      // User should connect wallet, then reopen panel to retry payment
                      setWalletConnecting(false);
                      setBountyOpen(false);
                      onClose(); // Close the entire iOS panel
                      return;
                    } else {
                      // Other error - show alert and close
                      setWalletConnecting(false);
                      alert(msg || 'Не удалось выполнить оплату');
                      setBountyOpen(false);
                    }
                  }
                } else {
                  // Just update display
                  setBountyAmount(amountTon);
                  setBountyRub(rubAmount);
                  setBountyOpen(false);
                  try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {}
                }
              }}
              onClose={() => { setBountyOpen(false); try { refocusWithCaretStrong(); setTimeout(()=>refocusWithCaretStrong(),80); setTimeout(()=>refocusWithCaretStrong(),160); } catch {} }}
            />
          </div>,
          document.body
        )}
        {/* Hidden TonConnect initializer while panel is open (like Android) */}
        {open && (<div style={{ display: 'none' }}><TonWalletConnect chatId={chatId} /></div>)}
      </div>
    </div>
  );

  try { return createPortal(overlay, document.body); } catch { return overlay; }
}

function RemindersSheet({ onClose, onPick, dockBottom = 0 }: { onClose: () => void; onPick: (p: { target: 'ME' | 'RESPONSIBLE' | 'ALL'; fireAtIso: string }) => void; dockBottom?: number }) {
  const [target, setTarget] = useState<'ME'|'RESPONSIBLE'|'ALL'>('ME');
  const [dateStr, setDateStr] = useState<string>('');
  const [timeStr, setTimeStr] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const nowMinDate = (() => { const d = new Date(); const pad=(n:number)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; })();
  const applyPlusMinutes = (min: number) => { const d=new Date(Date.now()+min*60000); d.setSeconds(0,0); const pad=(n:number)=>String(n).padStart(2,'0'); setDateStr(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`); setTimeStr(`${pad(d.getHours())}:${pad(d.getMinutes())}`); };
  const setTodayAt = (h:number,m:number)=>{ const d=new Date(); d.setSeconds(0,0); const pad=(n:number)=>String(n).padStart(2,'0'); setDateStr(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`); setTimeStr(`${pad(h)}:${pad(m)}`); };
  const setTomorrowAt = (h:number,m:number)=>{ const d=new Date(); d.setDate(d.getDate()+1); d.setSeconds(0,0); const pad=(n:number)=>String(n).padStart(2,'0'); setDateStr(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`); setTimeStr(`${pad(h)}:${pad(m)}`); };
  const makeISO = (d:string,t:string): string | null => { if (!d||!t) return null; const dd=new Date(`${d}T${t}`); return Number.isNaN(dd.getTime())?null:dd.toISOString(); };
  const sheet = (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:1000005, display:'flex', alignItems:'center', justifyContent:'center', paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.max(0, dockBottom)}px)`, backdropFilter: (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent || '')) ? undefined : 'blur(8px)', WebkitBackdropFilter: (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent || '')) ? undefined : ('blur(8px)' as any) }}>
      <div onClick={(e)=>e.stopPropagation()} onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()} onTouchStart={(e)=>e.stopPropagation()} onMouseDownCapture={(e)=>e.stopPropagation()} onPointerDownCapture={(e)=>e.stopPropagation()} onTouchStartCapture={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(520px, 94vw)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div style={{ fontWeight:700 }}>⏰ Напоминание</div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#8aa0ff', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:8 }}>
          {(['ME','RESPONSIBLE','ALL'] as const).map(k => (
            <label key={k} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
              <input type="radio" name="r_tgt" checked={target===k} onChange={()=>setTarget(k)} />
              <span>{k==='ME'?'Мне':k==='RESPONSIBLE'?'Ответственному':'Всем'}</span>
            </label>
          ))}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8, paddingLeft:4, paddingRight:4 }}>
          <input type="date" value={dateStr} min={nowMinDate} onChange={(e)=>setDateStr(e.target.value)} style={{ width:'calc(100% - 8px)', maxWidth:'calc(100% - 8px)', minWidth:0, boxSizing:'border-box', background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:10, padding:'6px 8px', fontSize:14 }} />
          <input type="time" value={timeStr} onChange={(e)=>setTimeStr(e.target.value)} style={{ width:'calc(100% - 8px)', maxWidth:'calc(100% - 8px)', minWidth:0, boxSizing:'border-box', background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:10, padding:'6px 8px', fontSize:14 }} />
        </div>
        {error ? <div style={{ color:'salmon', fontSize:12, marginTop:6 }}>{error}</div> : null}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:10 }}>
          <button onClick={()=>applyPlusMinutes(15)} style={{ padding:'10px 12px', borderRadius:12, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>+15м</button>
          <button onClick={()=>applyPlusMinutes(60)} style={{ padding:'10px 12px', borderRadius:12, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>+1ч</button>
          <button onClick={()=>setTodayAt(18,0)} style={{ padding:'10px 12px', borderRadius:12, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Сегодня 18:00</button>
          <button onClick={()=>setTomorrowAt(9,0)} style={{ padding:'10px 12px', borderRadius:12, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Завтра 09:00</button>
          <button onClick={()=>applyPlusMinutes(24*60*7)} style={{ padding:'10px 12px', borderRadius:12, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Через неделю</button>
          <span />
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
          <button onClick={onClose} style={{ padding:'10px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отмена</button>
          <button onClick={()=>{ setError(null); const iso = makeISO(dateStr, timeStr); if (!iso) { setError('Выберите дату и время'); return; } if (new Date(iso).getTime() <= Date.now()) { setError('Нельзя в прошлое'); return; } onPick({ target, fireAtIso: iso }); }} style={{ padding:'10px 12px', borderRadius:10, border:'1px solid transparent', background:'#2563eb', color:'#fff' }}>Добавить</button>
        </div>
      </div>
    </div>
  );
  try { return createPortal(sheet, document.body); } catch { return sheet; }
}
