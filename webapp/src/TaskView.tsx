// src/TaskView.tsx

import { useEffect, useMemo, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { createPortal } from 'react-dom';
import CameraCaptureModal from './components/CameraCaptureModal';
import PayoutPromptModal from './components/PayoutPromptModal';

import type { Task, TaskMedia, GroupLabel } from './api';
import {
  getTask,
  getTaskWithGroup,
  updateTask,
  completeTask,
  deleteTask,
  // участники группы
  type GroupMember,
  getGroupMembers,
  // борда / группы / ярлыки
  getTaskLabels,
  removeTaskLabel,
  listGroups,
  API_BASE,
  fetchBoard,
  moveTask,
  type Group,
  setTaskDeadline,
} from './api';
import DeadlinePicker from './components/DeadlinePicker';

import { type StageKey } from './components/StageScroller';
import StageCarousel from './components/StageCarousel';
import ResponsibleActions from './components/ResponsibleActions';
import CommentsThread from './components/CommentsThread';
import WatchersBlock from './components/WatchersBlock';
import { listWatchers as apiListWatchers, subscribe as apiWatchersSubscribe, unsubscribe as apiWatchersUnsubscribe } from './api/watchers';
import EventPanel from './components/EventPanel';
import ShareNewTaskMenu from './components/ShareNewTaskMenu';
import RankName from './components/RankName';
import TaskLabelDrawer from './components/TaskLabelDrawer';
import RemindersModal from './components/RemindersModal';
import TaskHistoryModal from './components/TaskHistoryModal';
import { listTaskReminders, createTaskReminder, deleteTaskReminder, type TaskReminder as TReminder } from './api/reminders';

type Props = {
  taskId: string;
  onClose: (groupId?: string | null) => void;
  onChanged: () => void;
  meChatId?: string;
  myRankIcon?: string | null;
};

export default function TaskView({ taskId, onClose, onChanged, meChatId: meProp, myRankIcon, origin = 'group' as any }: Props & { origin?: 'feed' | 'group' }) {
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<Task | null>(null);
  const [text, setText] = useState('');
  // автосохранение — отдельный таймер; статуса saving не держим
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<string | undefined>(undefined);
  const isDone = phase === 'Done';

  const [labelDrawerOpen, setLabelDrawerOpen] = useState(false);
  const [taskLabels, setTaskLabels] = useState<GroupLabel[]>([]);
  const [acceptPickerOpen, setAcceptPickerOpen] = useState(false);
  const [approvalReason, setApprovalReason] = useState('');
  const [approvalAction, setApprovalAction] = useState<null | 'RETURN' | 'CANCEL'>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);

  // список всех групп для селектора
  const [allGroups, setAllGroups] = useState<Group[]>([]);

  // табы селектора
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [groupTab, setGroupTab] = useState<'own' | 'member'>('own');

  const ownGroups = useMemo(() => allGroups.filter(g => g.kind === 'own'), [allGroups]);
  const memberGroups = useMemo(() => allGroups.filter(g => g.kind === 'member'), [allGroups]);

  const [isClosing] = useState(false); // не используется, но нужна для совместимости
  const [thumbStage, setThumbStage] = useState<0 | 1 | 2>(0); // 0=скрыт, 1=появление, 2=затухание

  // заголовок группы
  const [groupTitle, setGroupTitle] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  // куда возвращаться при закрытии
  const groupIdRef = useRef<string | null | undefined>(undefined);

  // мягкий «тик» для обновления карточки после назначений
  const [refreshTick, setRefreshTick] = useState(0);

  // кто я (для «Сделать ответственным себя»)
  const meChatId = String(meProp || '');

  const [media, setMedia] = useState<TaskMedia[]>([]);
  const [completeNeedPhotoOpen, setCompleteNeedPhotoOpen] = useState(false);
  const [completeNeedDocOpen, setCompleteNeedDocOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const autosaveTimer = useRef<any>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveDoneTimer = useRef<any>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  // Временный флаг: только что назначаем ответственного — пока нет имени, показываем плейсхолдер
  const [assigningAssigneeChatId, setAssigningAssigneeChatId] = useState<string | null>(null);

  // Считаем вложение аудио, если kind = voice|audio, либо MIME начинается с audio/,
  // либо расширение .ogg/.opus/.mp3/.m4a/.wav/.webm
  const isAudioLike = (m: TaskMedia) => {
    const k = String((m as any)?.kind || '').toLowerCase();
    if (k === 'voice' || k === 'audio') return true;

    const mime = String((m as any)?.mime || (m as any)?.contentType || '').toLowerCase();
    if (mime.startsWith('audio/')) return true;

    const name = String(m.fileName || '').toLowerCase();
    return /\.(ogg|opus|oga|mp3|m4a|wav|webm)$/.test(name);
  };

  // аудио и «прочие документы»
  const audioMedias = useMemo(() => media.filter(isAudioLike), [media]);
  const docMedias = useMemo(
    () => media.filter(m => m.kind !== 'photo' && !isAudioLike(m)),
    [media]
  );

  // для модалки с фото
  const photos = useMemo(() => media.filter(m => m.kind === 'photo'), [media]);
  const [isLightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const cardRef = useRef<HTMLDivElement | null>(null);

  // куда «тянуть» карточку (в пикселях) при закрытии
  const [pull] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); // не используется, но нужна для совместимости

  // участники текущей группы (для «Выбрать из группы»)
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reminders, setReminders] = useState<TReminder[]>([]);
  const [remBusy, setRemBusy] = useState(false);
  // панель наблюдателей: свёрнута/развёрнута
  const [watchersOpen, setWatchersOpen] = useState(false);
  const [watchersCount, setWatchersCount] = useState(0);
  const [meWatching, setMeWatching] = useState(false);
  const [watchersBusy, setWatchersBusy] = useState(false);

  // первичная загрузка статуса наблюдения и количества
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiListWatchers(taskId);
        if (!alive || !r?.ok) return;
        const arr = r.watchers || [];
        setWatchersCount(arr.length);
        setMeWatching(arr.some((w: any) => String(w.chatId) === String(meChatId)));
      } catch {}
    })();
    return () => { alive = false; };
  }, [taskId, meChatId]);

  async function toggleWatchSelf() {
    if (watchersBusy) return;
    setWatchersBusy(true);
    try {
      if (meWatching) {
        await apiWatchersUnsubscribe(taskId, String(meChatId), String(meChatId));
        setMeWatching(false);
        setWatchersCount((n) => Math.max(0, n - 1));
      } else {
        await apiWatchersSubscribe(taskId, String(meChatId));
        setMeWatching(true);
        setWatchersCount((n) => n + 1);
      }
      try { WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch {}
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие');
      else alert('Не удалось изменить подписку наблюдателя');
    } finally {
      setWatchersBusy(false);
    }
  }
  // прогресс в стадии "В работе"
  const [progress, setProgress] = useState<number>(0);
  const progressTimer = useRef<any>(null);
  // расходы перенесены в меню ⋮

  // Выплата исполнителю: фиксированная модалка до подтверждения
  const [payoutOpen, setPayoutOpen] = useState(false);
  const payoutOpenRef = useRef(false);
  useEffect(() => { payoutOpenRef.current = payoutOpen; }, [payoutOpen]);

  // Тема карточки по стадии
  function styleForPhase(ph: string): { background: string; border: string; boxShadow?: string; color?: string } {
    switch (ph) {
      case 'Inbox':
        return {
          background: 'linear-gradient(135deg, #f5f7fb, #eef2f7)',
          border: '1px solid #d8dee9',
          boxShadow: '0 6px 20px rgba(15,23,42,.06), inset 0 0 1px rgba(0,0,0,.04)',
          color: '#0f172a'
        };
      case 'Doing':
        return {
          background: 'linear-gradient(135deg, #d4e4f7, #a8c5e8)',
          border: '1px solid #8fadd4',
          boxShadow: '0 6px 20px rgba(91,126,169,.14), inset 0 0 12px rgba(255,255,255,.15)',
          color: '#0f172a'
        };
      case 'Done':
        return {
          background: 'linear-gradient(135deg, #d4f4dd, #a8e4b8)',
          border: '1px solid #8dcea0',
          boxShadow: '0 6px 20px rgba(16,185,129,.14), inset 0 0 12px rgba(255,255,255,.15)',
          color: '#0f172a'
        };
      case 'Cancel':
        return {
          background: 'linear-gradient(135deg, #fdd4d4, #f8a8a8)',
          border: '1px solid #f08d8d',
          boxShadow: '0 6px 20px rgba(244,63,94,.14), inset 0 0 12px rgba(255,255,255,.15)',
          color: '#0f172a'
        };
      case 'Approval':
        return {
          background: 'linear-gradient(135deg, #fef4d4, #fce8a8)',
          border: '1px solid #f5d88d',
          boxShadow: '0 6px 20px rgba(250,204,21,.14), inset 0 0 12px rgba(255,255,255,.15)',
          color: '#0f172a'
        };
      case 'Wait':
        return {
          background: 'linear-gradient(135deg, #d4f0fd, #a8dcf5)',
          border: '1px solid #8dc8e8',
          boxShadow: '0 6px 20px rgba(56,189,248,.14), inset 0 0 12px rgba(255,255,255,.15)',
          color: '#0f172a'
        };
      default:
        return { background: '#1b2030', border: '1px solid #2a3346' };
    }
  }

  // Следим за условиями показа модалки: Done + есть вознаграждение + не выплачено + я = ответственный
  useEffect(() => {
    try {
      const rub = Number((task as any)?.bountyStars || 0);
      const status = String((task as any)?.bountyStatus || 'NONE');
      const assignee = String((task as any)?.assigneeChatId || '');
      const should = rub > 0 && status !== 'PAID' && isDone && !!assignee && assignee === meChatId;
      setPayoutOpen(should);
    } catch {}
  }, [task?.bountyStars, task?.bountyStatus, task?.assigneeChatId, isDone, meChatId]);

  // когда узнали groupId — подтягиваем участников
  useEffect(() => {
    if (!groupId) return;
    getGroupMembers(groupId)
      .then((r) => {
        if (r.ok) setMembers(r.members || []);
      })
      .catch(() => {});
  }, [groupId]);

  // загрузка напоминаний
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await listTaskReminders(taskId);
        if (alive && r?.ok) setReminders((r as any).reminders || []);
      } catch {}
    })();
    return () => { alive = false; };
  }, [taskId, refreshTick]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cur = await getTaskLabels(taskId);
        if (alive) setTaskLabels(cur);
      } catch {}
    })();
    return () => { alive = false; };
  }, [taskId]);

  // подхватить прогресс из задачи при загрузке
  useEffect(() => {
    if (!task) return;
    try { setProgress(Math.max(0, Math.min(100, Number((task as any).progress ?? 0)))); } catch { setProgress(0); }
  }, [task]);

  // расходы теперь редактируются через меню ⋮

  useEffect(() => {
    if (!isLightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowRight') setLightboxIndex(i => (i + 1) % Math.max(photos.length, 1));
      if (e.key === 'ArrowLeft') setLightboxIndex(i => (i - 1 + Math.max(photos.length, 1)) % Math.max(photos.length, 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLightboxOpen, photos.length]);

  const [groupIsTg, setGroupIsTg] = useState<boolean>(false);
  const [groupIsPublic, setGroupIsPublic] = useState<boolean>(false);
  const groupLabel = () => {
    if (!groupTitle) return 'Моя группа';
    const icon = groupIsPublic ? '🌍 ' : (groupIsTg ? '➡️📁 ' : '📁 ');
    return icon + groupTitle;
  };

  /* --- системная кнопка "Назад" --- */
  useEffect(() => {
    const onceRef = { done: false, t: 0 as any };

    const handle = () => {
      // блокируем закрытие, если требуется подтверждение выплаты
      if (payoutOpenRef.current) return;
      if (onceRef.done) return;
      onceRef.done = true;
      clearTimeout(onceRef.t);
      onceRef.t = setTimeout(() => (onceRef.done = false), 300);
      onClose(groupIdRef.current);
    };

    try { WebApp?.BackButton?.show?.(); } catch {}
    WebApp?.onEvent?.('backButtonClicked', handle);
    WebApp?.BackButton?.onClick?.(handle);

    return () => {
      WebApp?.offEvent?.('backButtonClicked', handle);
      WebApp?.BackButton?.offClick?.(handle);
      try { WebApp?.BackButton?.hide?.(); } catch {}
    };
  }, [onClose]);

  /* --- загрузка задачи + группы/фазы --- */
  useEffect(() => {
    let ignore = false;
    setLoading(true);

    getTask(taskId)
      .then(async (tResp) => {
        if (ignore) return;
        setTask(tResp.task);
        setText(tResp.task.text);
        try {
          const gResp = await getTaskWithGroup(taskId);
          groupIdRef.current = gResp?.groupId ?? null;
          setGroupId(groupIdRef.current);
          setPhase(gResp?.phase);
          setMedia(Array.isArray(gResp?.media) ? gResp.media : []);
        } catch {
          const gid = new URLSearchParams(location.search).get('group');
          groupIdRef.current = gid || null;
          setGroupId(groupIdRef.current);
          setPhase(undefined);
        }
      })
      .catch(() => {
        const gid = new URLSearchParams(location.search).get('group');
        groupIdRef.current = gid || null;
        setGroupId(groupIdRef.current);
        setTask(null);
      })
      .finally(() => !ignore && setLoading(false));

    return () => { ignore = true; };
  }, [taskId]);

  /* --- подтянуть название группы по groupId --- */
  useEffect(() => {
    if (!groupId) {
      setGroupTitle(null);
      return;
    }
    if (!meChatId) return;

    listGroups(String(meChatId))
      .then((r) => {
        if (r.ok) {
          setAllGroups(r.groups || []);
          const g = r.groups.find((x: any) => x.id === groupId);
          setGroupTitle(g ? g.title : null);
          setGroupIsTg(Boolean((g as any)?.isTelegramGroup));
          setGroupIsPublic(Boolean((g as any)?.isPublic));
        }
      })
      .catch(() => {});
  }, [groupId]);

  /* --- мягкий поллинг (обновляем ответственного/фазу) --- */
  useEffect(() => {
    let t: any = null;
    let alive = true;

    const tick = async () => {
      try {
        const r = await getTask(taskId);
        if (!alive) return;
        setTask(r.task);
        if (typeof (r as any)?.phase === 'string') setPhase((r as any).phase);
      } catch {}
      t = setTimeout(tick, 4000);
    };

    t = setTimeout(tick, 4000);
    return () => { alive = false; clearTimeout(t); };
  }, [taskId, refreshTick]);

  // Как только имя ответственного появилось — убираем плейсхолдер
  useEffect(() => {
    if (!task) return;
    if (task.assigneeName) setAssigningAssigneeChatId(null);
    if (!task.assigneeChatId) setAssigningAssigneeChatId(null);
  }, [task?.assigneeName, task?.assigneeChatId]);

  // Показ 👍 без закрытия карточки
  const animateCloseWithThumb = (_finalGroupId?: string | null) => {
    // 0) снимаем остатки прошлого прогона
    setThumbStage(0);

    // 1) показать 👍 по центру (слегка «впрыгивает»)
    setThumbStage(1);

    // 2) 👍 делает «бум» — увеличивается и начинает исчезать
    setTimeout(() => {
      setThumbStage(2);
    }, 400);

    // 3) скрываем 👍 и остаёмся на карточке (не закрываем)
    setTimeout(() => {
      setThumbStage(0);
    }, 700);
  };

  // перенос в другую группу: находим Inbox целевой группы, двигаем через /tasks/:id/move
  const moveToGroup = async (targetGroupId: string | null) => {
    const by = meChatId;
    try {
      // 1) получаем борду целевой группы, чтобы взять колонку Inbox
      const board = await fetchBoard(by, targetGroupId ?? undefined);
      const columns = board?.columns || [];
      // ищем Inbox (на бэке дефолтные колонки формируются; имя 'Inbox')
      const inbox = columns.find(c => String(c.name).toLowerCase() === 'inbox') || columns[0];
      if (!inbox) throw new Error('no_inbox');

      // 2) двигаем задачу в начало Inbox целевой группы
      await moveTask(taskId, inbox.id, 0);

      // 3) локально обновим состояние и перерисуем
      groupIdRef.current = targetGroupId ?? null;
      setGroupId(groupIdRef.current);

      // подтянем название
      if (targetGroupId) {
        const g = allGroups.find(x => x.id === targetGroupId);
        setGroupTitle(g ? g.title : null);
      } else {
        setGroupTitle(null);
      }

      // чтобы UI гарантированно обновился
      setRefreshTick(t => t + 1);
      WebApp?.HapticFeedback?.impactOccurred?.('light');
    } catch (e) {
      console.error('[TaskView] moveToGroup error', e);
      alert('Не удалось перенести в выбранную группу');
    } finally {
      try {
        await Promise.all(taskLabels.map((l) => removeTaskLabel(taskId, l.id, meChatId)));
      } catch {}
      setTaskLabels([]);
      setGroupPickerOpen(false);
    }
  };

  /* --- действия с задачей --- */
  // save() удалён — используем автосохранение

  // Автосохранение текста при вводе (debounce ~600ms), только при реальном изменении
  useEffect(() => {
    if (!task) return;
    const next = text.trim();
    const initial = String(task.text || '').trim();
    if (next === initial) return; // ничего не меняли — не сохраняем и не мигаем статусом

    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await updateTask(taskId, next, meChatId);
        onChanged?.();
        setSaveStatus('saved');
        clearTimeout(saveDoneTimer.current);
        saveDoneTimer.current = setTimeout(() => setSaveStatus('idle'), 1200);
      } catch (e: any) {
        const msg = String(e?.message || '');
        const status = Number((e?.response && (e.response as any).status) || (/\b403\b/.test(msg) ? 403 : 0));
        if (status === 403 || /no_rights/.test(msg)) alert('У вас нет прав на это действие');
        // откат текста, чтобы не зациклить автосохранение
        setText(initial);
        setSaveStatus('error');
        clearTimeout(saveDoneTimer.current);
        saveDoneTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }
    }, 600);
    return () => clearTimeout(autosaveTimer.current);
  }, [text, taskId, task?.text]);

  // toggleDone удалён — используем StageScroller/onRequestComplete

  const handleDelete = async () => {
    if (!confirm('Удалить задачу? Действие необратимо.')) return;
    try {
      const resp = await deleteTask(taskId);
      const gid = (resp && 'groupId' in resp) ? (resp as any).groupId : groupIdRef.current;
      onChanged?.();
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onClose(gid ?? undefined);
    } catch (e) {
      console.error('[DELETE] error', e);
      alert('Не удалось удалить задачу');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    }
  };

  /* --- UI --- */
  if (loading) return <div style={{ padding: 16 }}>Загрузка…</div>;
  if (error) return <div style={{ padding: 16, color: 'crimson' }}>{error}</div>;

  // заголовок с «назад» и именем группы
  const Header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <button
        onClick={() => onClose(origin === 'feed' ? undefined : groupIdRef.current)}
        style={{ background: 'transparent', color: '#8aa0ff', border: 'none', cursor: 'pointer', fontSize: 13 }}
      >
        ← Назад
      </button>
      {groupTitle && <span style={{ fontSize: 13, opacity: 0.8 }}>{groupTitle}</span>}
    </div>
  );

  if (!task) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--app-bg, #0b1220)',
          color: '#e8eaed',
          padding: 16,
          transition: 'opacity 360ms ease, transform 360ms ease, filter 360ms ease',
          opacity: isClosing ? 0 : 1,
          transform: isClosing ? 'scale(0.92)' : 'scale(1)',
          filter: isClosing ? 'blur(2px)' : 'none',
        }}
      >
        {Header}

        <div style={{ background: '#1b2030', border: '1px solid #2a3346', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Задача уже удалена</div>
          <div style={{ opacity: 0.8, marginBottom: 16 }}>
            Этой задачи больше нет. Можешь вернуться в доску.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => onClose(null)}
              style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
            >
              Моя доска
            </button>
            {groupIdRef.current ? (
              <button
                onClick={() => onClose(groupIdRef.current)}
                style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #2a3346', background: '#1f2e4a', color: '#e8eaed' }}
              >
                Открыть группу
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg, #0b1220)', color: '#e8eaed', padding: 16 }}>
      {Header}

      <div
        ref={cardRef}
        style={{
          ...(function(){
            const ph = String(phase || (isDone ? 'Done' : '')) as any;
            const s = styleForPhase(ph);
            return {
              background: s.background,
              border: s.border,
              boxShadow: s.boxShadow,
              color: s.color,
            };
          })(),
          borderRadius: 16,
          padding: 16,

          // анимация «всасывания»
          transition:
            'transform 520ms cubic-bezier(.2,.9,.2,1), opacity 520ms ease, filter 520ms ease',
          transformOrigin: '50% 50%',
          transform: isClosing
            ? `translate(${pull.x}px, ${pull.y}px) scale(0.72)`
            : 'translate(0,0) scale(1)',
          opacity: isClosing ? 0 : 1,
          filter: isClosing ? 'blur(2px)' : 'none',
        }}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 14, opacity: 0.85 }}>
            {(() => {
              const creator = (task as any)?.creatorName;
              const creatorId = String((task as any)?.createdByChatId || (task as any)?.sourceChatId || (task as any)?.chatId || '');
              const nameWithIcon = creator
                ? (<RankName chatId={creatorId} name={creator} meChatId={meChatId} myRankIcon={myRankIcon} />)
                : null;
              if (task?.type === 'EVENT') {
                return creator
                  ? <>Событие от: <span style={{ color: '#374151', opacity: 1 }}>{nameWithIcon}</span></>
                  : 'Событие';
              }
              return creator
                ? <>Поручил: <span style={{ color: '#374151', opacity: 1 }}>{nameWithIcon}</span></>
                : 'Задача';
            })()}
          </div>

          {task?.id ? (
            <ShareNewTaskMenu
              taskId={task.id}
              isEvent={task?.type === 'EVENT'}
              onDelete={handleDelete}
              meChatId={meChatId}
              initialExpenses={Number((task as any)?.expenses ?? null) as any}
              onOpenAccept={() => setAcceptPickerOpen(true)}
              onOpenDeadline={() => setDeadlineOpen(true)}
              onOpenReminders={() => setRemindersOpen(true)}
              onOpenHistory={() => setHistoryOpen(true)}
            />
          ) : null}
        </div>

        {/* Группа */}
        <div style={{ margin: '6px 0 10px', fontSize: 13, opacity: .85, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setGroupPickerOpen(true)}
            title="Выбрать другую группу"
            style={{
              background: 'transparent',
             border: '1px solid #D1D5DB',
              borderRadius: 8,
              padding: '2px 8px',
              color: groupIsPublic ? '#86efac' : '#374151',
              cursor: 'pointer'
            }}
          >
            {groupLabel()}
          </button>

          {/* Ярлык рядом с группой */}
          <button
            onClick={() => setLabelDrawerOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 10px',
              borderRadius: 999,
              border: '1px solid #D1D5DB',
              background: 'transparent',
              color: '#374151',
              fontSize: 12,
              lineHeight: '16px',
              cursor: 'pointer'
            }}
            title="Выбрать ярлык"
          >
            <span>🏷️</span>
            <span style={{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {taskLabels.length > 0 ? taskLabels[0].title : 'ярлык'}
            </span>
          </button>
        </div>

        <div style={{ position: 'relative', width: '100%' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            style={{
              width: '95%',
              background: 'transparent',
              color: 'inherit',
              border: '1px solid #3a435a',
              borderRadius: 12,
              padding: 10,
              resize: 'vertical',
            }}
          />
          <div style={{ position:'absolute', right: 6, top: -20, fontSize: 12, opacity: 0.8 }}>
            {saveStatus === 'saving' ? 'Сохраняю…' : saveStatus === 'saved' ? '✓ Сохранено' : saveStatus === 'error' ? 'Ошибка' : ''}
          </div>

          {/* Убрано: точки и списки связей процесса в TaskView */}
        </div>

        {/* Бейдж просрочки: сразу под textarea, над дедлайном */}
        {task?.deadlineAt && new Date(String(task.deadlineAt)).getTime() < Date.now() && (
          <div style={{ marginTop: 8 }}>
            <span
              style={{
                fontSize: 12,
                background: '#7f1d1d',
                color: '#fee2e2',
                border: '1px solid #dc2626',
                borderRadius: 999,
                padding: '2px 8px',
              }}
            >
              ⚠️ Просрочен
            </span>
          </div>
        )}

        {/* ярлык под textarea убран — теперь наверху рядом с группой */}

        {/* Затраты перенесены в меню "⋮" */}

        {/* Условия приёма */}
        {(() => {
          const cond = String((task as any)?.acceptCondition || 'NONE');
          if (cond === 'NONE') return null;

          const conditionLabels: Record<string, string> = {
            PHOTO: 'Нужно фото 📸',
            APPROVAL: 'Нужно согласование 🤝',
            PHOTO_AND_APPROVAL: 'Фото + согласование 📸🤝',
            DOC_AND_APPROVAL: 'Документ + согласование 📎🤝',
          };

          const label = conditionLabels[cond] || '';
          if (!label) return null;

          return (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.9 }}>☝️ {label}</span>
              <button
                onClick={async () => {
                  try {
                    const mod = await import('./api');
                    const r = await mod.setAcceptCondition(taskId, meChatId, 'NONE');
                    if (r?.ok && r.task) setTask(prev => prev ? ({ ...prev, acceptCondition: 'NONE' } as any) : prev);
                    if (r && (r as any).ok === false && String((r as any).error || '') === 'no_rights') {
                      alert('У вас нет прав на это действие');
                    }
                  } catch (e: any) {
                    const msg = String(e?.message || '');
                    if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие');
                  }
                }}
                title="Убрать условие приёма"
                style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer', fontSize: 14 }}
              >
                (×)
              </button>
            </div>
          );
        })()}

        {/* Дедлайн */}
        {(() => {
          const deadline = task?.deadlineAt;
          if (!deadline) return null;

          const d = new Date(String(deadline));
          if (isNaN(d.getTime())) return null;

          const pad = (n: number) => String(n).padStart(2, '0');
          const when = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          const isPast = d.getTime() < Date.now();

          return (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.9, color: isPast ? '#fca5a5' : 'inherit' }}>
                🚩 Дедлайн: {when}
                {isPast && ' ⚠️'}
              </span>
              <button
                onClick={async () => {
                  try {
                    const r = await setTaskDeadline(taskId, meChatId, null);
                    if (r?.ok && r.task) {
                      setTask((prev) => (prev ? { ...prev, deadlineAt: null } : prev));
                      onChanged();
                    }
                    if (r && (r as any).ok === false && String((r as any).error || '') === 'no_rights') {
                      alert('У вас нет прав на это действие');
                    }
                  } catch (e: any) {
                    const msg = String(e?.message || '');
                    if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие');
                  }
                }}
                title="Убрать дедлайн"
                style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer', fontSize: 14 }}
              >
                (×)
              </button>
            </div>
          );
        })()}

        {/* Список напоминаний */}
        {reminders.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Напоминания</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {reminders
                .slice()
                .sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime())
                .map((r) => {
                  const label = r.target === 'ME' ? 'Себе' : r.target === 'RESPONSIBLE' ? 'Ответственному' : 'Всем';
                  const d = new Date(r.fireAt);
                  const pad = (n: number) => String(n).padStart(2, '0');
                  const when = `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} (${pad(d.getHours())}:${pad(d.getMinutes())})`;
                  const strike = r.sentAt ? 'line-through' as const : 'none';
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ textDecoration: strike }}>{label} {when}</div>
                      <button
                        disabled={remBusy}
                        onClick={async () => {
                          if (remBusy) return;
                          setRemBusy(true);
                          try {
                            await deleteTaskReminder(taskId, r.id, meChatId);
                            setReminders((prev) => prev.filter(x => x.id !== r.id));
                          } catch (e: any) {
                            const msg = String(e?.message || '');
                            if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие');
                          }
                          finally { setRemBusy(false); }
                        }}
                        title="Удалить"
                        style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer' }}
                      >
                        (x)
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8, display:'flex', alignItems:'center', gap:6 }}>
          {typeof (task as any).bountyStars === 'number' && (task as any).bountyStars > 0 ? (
            <span title={String((task as any).bountyStatus)==='PAID' ? 'Выплачено' : 'Ожидает выплаты'} style={{ display:'inline-block', border:`1px solid ${String((task as any).bountyStatus)==='PAID' ? '#374151':'#6a4a20'}`, background:String((task as any).bountyStatus)==='PAID' ? '#1f2937':'#3a2a10', color:String((task as any).bountyStatus)==='PAID' ? '#9ca3af':'#facc15', borderRadius:999, padding:'0 6px', lineHeight:'16px', fontSize:12 }}>
              {String((task as any).bountyStatus)==='PAID' ? '💫' : '💰'} ({(task as any).bountyStars})
            </span>
          ) : null}
        </div>

        {String(phase) !== 'Approval' && (
        <>
        {/* Текущий статус по центру под текстовым полем */}
        <div style={{ margin: '6px 0 4px', fontSize: 12, textAlign: 'center', opacity: 0.9 }}>
          {(() => {
            const ph = String(phase || '');
            if (ph === 'Inbox') return '🌱 Новое';
            if (ph === 'Doing') return '🔨 В работе';
            if (ph === 'Done') return '✔ Завершено';
            if (ph === 'Cancel') return '❌ Отмена';
            if (ph === 'Approval') return '👉👈 Согласов';
            if (ph === 'Wait') return '🥶 Ждёт';
            return ph || '—';
          })()}
        </div>

        <StageCarousel
          taskId={task.id}
          type={task.type ?? 'TASK'}
          currentPhase={(phase as StageKey) || 'Inbox'}
          groupId={groupId}
          meChatId={meChatId}
          onPhaseChanged={(next) => {
            setPhase(next);
            onChanged?.();
          }}
          onRequestComplete={() => {
            (async () => {
              try {
                const cond = String((task as any)?.acceptCondition || 'NONE');
                const needPhoto = cond === 'PHOTO' || cond === 'PHOTO_AND_APPROVAL';
                const needAnyAttach = cond === 'DOC_AND_APPROVAL';
                const needApproval = cond === 'APPROVAL' || cond === 'PHOTO_AND_APPROVAL' || cond === 'DOC_AND_APPROVAL';
                const hasPhoto = media.some(m => m.kind === 'photo');
                const hasAny = media.length > 0;
                if (needPhoto && !hasPhoto) { setCompleteNeedPhotoOpen(true); return; }
                if (needAnyAttach && !hasAny) { setCompleteNeedDocOpen(true); return; }
                if (needApproval) {
                  try {
                    const board = await fetchBoard(meChatId, groupId || undefined);
                    const col = (board?.columns || []).find((c) => String(c.name) === 'Approval');
                    if (col) {
                      await moveTask(taskId, col.id, 0, meChatId);
                      setPhase('Approval');
                      onChanged?.();
                      WebApp?.HapticFeedback?.impactOccurred?.('light');
                    } else {
                      alert('Нет колонки «Согласование» в текущей доске');
                    }
                  } catch {}
                  return;
                }
                await completeTask(taskId, { chatId: meChatId } as any);
                setPhase('Done');
                onChanged?.();
                WebApp?.HapticFeedback?.notificationOccurred?.('success');
                // Если есть невыплаченный bounty и я ответственный — показываем модалку и НЕ закрываем карточку
                try {
                  const rub = Number((task as any)?.bountyStars || 0);
                  const status = String((task as any)?.bountyStatus || 'NONE');
                  const assignee = String((task as any)?.assigneeChatId || '');
                  const shouldPayout = rub > 0 && status !== 'PAID' && !!assignee && assignee === meChatId;
                  if (shouldPayout) {
                    setPayoutOpen(true);
                  } else {
                    setTimeout(() => { animateCloseWithThumb(groupIdRef.current); }, 160);
                  }
                } catch {
                  setTimeout(() => { animateCloseWithThumb(groupIdRef.current); }, 160);
                }
              } catch (e) {
                setError((e as any)?.message || 'Ошибка операции');
              }
            })();
          }}
        />
        </>
        )}

        {/* Прогресс (только в стадии "В работе") */}
        {String(phase) === 'Doing' && (
          <div style={{ marginTop: 8, marginBottom: 8, padding: 10, border: '1px solid #2a3346', background: '#121722', color: '#e8eaed', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Прогресс</div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>{progress}%</div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={progress}
              onChange={async (e) => {
                const v = Math.max(0, Math.min(100, Number(e.target.value)));
                setProgress(v);
                try {
                  clearTimeout(progressTimer.current);
                } catch {}
                progressTimer.current = setTimeout(async () => {
                  try {
                    const api = await import('./api');
                    await (api as any).setTaskProgress(taskId, v);
                  } catch {}
                }, 200);

                if (v === 100) {
                  try {
                    const api = await import('./api');
                    const r = await (api as any).completeTask(taskId);
                    // подтянем актуальную фазу/группу
                    const full = await (api as any).getTaskWithGroup(taskId);
                    if ((full as any)?.ok) {
                      setPhase((full as any).phase || 'Done');
                      setTask((prev) => (prev ? ({ ...prev, ...(r?.task || {}), progress: 100 } as any) : prev));
                      onChanged?.();
                    } else {
                      setPhase('Done');
                    }
                    WebApp?.HapticFeedback?.notificationOccurred?.('success');
                  } catch {}
                }
              }}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {String(phase) === 'Approval' && task?.assigneeChatId && String(task.assigneeChatId) === String(meChatId) && (
          <div style={{ margin: '8px 0', padding: 10, border: '1px solid #6a4a20', background: '#3a2a10', color: '#ffe5bf', borderRadius: 12 }}>
            ⌛ Ждёт согласования
          </div>
        )}

        {String(phase) === 'Approval' && task && String(task.chatId) === String(meChatId) && (
          <div style={{ margin: '8px 0', padding: 10, border: '1px solid #6a4a20', background: '#3a2a10', color: '#ffe5bf', borderRadius: 12 }}>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button
                onClick={async () => {
                  if (approvalBusy) return;
                  setApprovalBusy(true);
                  try {
                    await completeTask(taskId);
                    setPhase('Done');
                    onChanged?.();
                    WebApp?.HapticFeedback?.notificationOccurred?.('success');
                  } catch {}
                  finally { setApprovalBusy(false); }
                }}
                style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#15251a', color:'#d7ffd7' }}
              >✅ Согласовать</button>

              <button
                onClick={() => { setApprovalAction(approvalAction==='RETURN'?null:'RETURN'); setApprovalReason(''); }}
                style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}
              >⟳ Вернуть в работу</button>

              <button
                onClick={() => { setApprovalAction(approvalAction==='CANCEL'?null:'CANCEL'); setApprovalReason(''); }}
                style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #5a2b2b', background:'#3a1f1f', color:'#ffd7d7' }}
              >⛔ Отмена</button>
            </div>

            {approvalAction && (
              <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, opacity: .9, marginBottom: 6 }}>
                  {approvalAction === 'RETURN' ? 'Причина возврата:' : 'Причина отмены:'}
                </div>
                <textarea
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  placeholder="Напишите причину..."
                  rows={3}
                  style={{ width:'100%', background:'#0b1220', color:'#e5e7eb', border:'1px solid #2a3346', borderRadius:10, padding:8 }}
                />
                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                  <button
                    disabled={approvalBusy}
                    onClick={async () => {
                      if (approvalBusy) return;
                      setApprovalBusy(true);
                      try {
                        const reason = approvalReason.trim();
                        if (reason) { try { await (await import('./api')).addComment(taskId, meChatId, reason); } catch {} }
                        const board = await fetchBoard(meChatId, groupId || undefined);
                        const columns = board?.columns || [];
                        const targetName = approvalAction === 'RETURN' ? 'Doing' : 'Cancel';
                        const col = columns.find(c => String(c.name) === targetName);
                        if (col) {
                          await moveTask(taskId, col.id, 0);
                          setPhase(targetName as StageKey);
                          onChanged?.();
                        }
                        WebApp?.HapticFeedback?.impactOccurred?.('light');
                        setApprovalAction(null);
                        setApprovalReason('');
                      } catch {}
                      finally { setApprovalBusy(false); }
                    }}
                    style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}
                  >Применить</button>
                  <button
                    onClick={() => { setApprovalAction(null); setApprovalReason(''); }}
                    style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#121722', color:'#e8eaed' }}
                  >Отмена</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Кнопки условий/дедлайна/напоминаний вынесены в меню ⋮ */}

        {/* Ответственный / действия назначения (для событий скрываем — там EventPanel) */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {task?.type !== 'EVENT' && (
            task.assigneeChatId ? (
              <div
                style={{
                  padding: 0,
                  borderRadius: 12,
                  border: '1px solid transparent',
                  background: 'transparent',
                  color: 'inherit',
                  display: 'inline-flex',
                  gap: 8,
                  alignItems: 'center',
                  fontSize: 12,
                }}
                  title="Ответственный по задаче"
                >
                  <span style={{ opacity: 0.8 }}>Делает:</span>
                  {(() => {
                    const base = task.assigneeName
                      || (assigningAssigneeChatId && String(task.assigneeChatId) === String(assigningAssigneeChatId)
                            ? '(назначаю …)'
                            : String(task.assigneeChatId));
                    const node = (
                      <RankName chatId={task.assigneeChatId as any} name={String(base || '')} meChatId={meChatId} myRankIcon={myRankIcon} />
                    );
                    const title = `${base}`;
                    return (
                      <span
                        title={title}
                        style={{
                          fontSize: 12,
                          lineHeight: '16px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'inline-block',
                          maxWidth: 200,
                        }}
                      >
                        {node}
                      </span>
                    );
                  })()}
                  <button
                    onClick={async () => {
                      if (!confirm('Убрать ответственного?')) return;
                      try {
                        const api = await import('./api/assign');
                        const r = await api.unassign(taskId, meChatId);
                    if ((r as any)?.ok) {
                      setTask((prev) => (prev ? { ...prev, assigneeChatId: null, assigneeName: null } : prev));
                      setAssigningAssigneeChatId(null);
                      setRefreshTick((t) => t + 1);
                    }
                  } catch {}
                }}
                title="Убрать ответственного"
                style={{ marginLeft: 6, padding: '4px 8px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: '#e8eaed', cursor: 'pointer', fontSize: 12 }}
              >
                ×
              </button>
            </div>
          ) : (
            <ResponsibleActions
              taskId={taskId}
              taskTitle={text}
              groupId={groupId || undefined}
              meChatId={meChatId}
              currentAssigneeChatId={task?.assigneeChatId ?? null}
              members={members.map((m) => ({
                chatId: String(m.chatId),
                firstName: m.name || undefined,
              }))}
              canAssign={true}
              onAssigned={(newAssigneeChatId) => {
                // Оптимистично обновляем локально, не ждём поллинга
                setTask((prev) => {
                  if (!prev) return prev;
                  const found = members.find((m) => String(m.chatId) === String(newAssigneeChatId));
                  const name = (found as any)?.name || prev.assigneeName || null;
                  return { ...prev, assigneeChatId: String(newAssigneeChatId), assigneeName: name } as any;
                });
                setAssigningAssigneeChatId(String(newAssigneeChatId));
                try { WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
                setRefreshTick((t) => t + 1);
              }}
            />
          )
        )}
        </div>

        {media.length > 0 && (
          <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 14, opacity: .85, marginBottom: 6 }}>Вложения</div>

            {/* Фото */}
            {photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {photos.map((m, idx) => (
                  <button
                    key={m.id}
                    onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                    title="Открыть фото"
                    style={{
                      display: 'inline-block',
                      border: '1px solid #2a3346',
                      borderRadius: 8,
                      overflow: 'hidden',
                      padding: 0,
                      background: 'transparent',
                      cursor: 'zoom-in'
                    }}
                  >
                    <img
                      src={`${API_BASE}${m.url}`}
                      alt={m.fileName || 'Фото'}
                      style={{ maxWidth: 160, maxHeight: 160, display: 'block' }}
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Аудио/голосовые */}
            {audioMedias.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                {audioMedias.map((m) => (
                  <div key={m.id} style={{ padding: 8, border: '1px solid #2a3346', borderRadius: 8 }}>
                    <audio
                      controls
                      preload="metadata"
                      src={`${API_BASE}${m.url}`}
                      style={{ width: '100%' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <div style={{ fontSize: 12, opacity: .75 }}>
                        {m.fileName || 'Голосовое сообщение'}
                      </div>
                      {!!(m as any).duration && (
                        <div style={{ fontSize: 12, opacity: .65 }}>
                          ~{(m as any).duration}s
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Прочие документы */}
            {docMedias.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                {docMedias.map((m) => (
                  <a
                    key={m.id}
                    href={`${API_BASE}${m.url}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: 8,
                      border: '1px solid #2a3346',
                      borderRadius: 8,
                      color: '#8aa0ff',
                      textDecoration: 'none'
                    }}
                  >
                    📎 {m.fileName || 'Документ'}
                    {m.fileSize ? ` · ${(m.fileSize/1024/1024).toFixed(2)} MB` : ''}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {task?.type === 'EVENT' && (
          <EventPanel
            eventId={task.id}
            startAt={String(task.startAt || '')}   // строка
            endAt={task.endAt ?? null}
            chatId={meChatId}
            isOrganizer={Boolean((task as any)?.meIsOrganizer)}
            eventTitle={text || 'Событие'}
          />
        )}

      {/* Наблюдатели: компактный заголовок справа + выпадающий список */}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-start', gap: 4, flexWrap: 'nowrap', alignItems: 'center' }}>
        {watchersCount > 0 && (
          <button
            onClick={() => setWatchersOpen((v) => !v)}
            title={watchersOpen ? 'Свернуть' : 'Развернуть'}
            style={{
              background: 'transparent',
              color: 'inherit',
              border: '1px solid transparent',
              borderRadius: 10,
              padding: '6px 10px 6px 0',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              lineHeight: '16px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>👀 ({watchersCount})</span>
            <span style={{ opacity: 0.85 }}>{watchersOpen ? '▲' : '▼'}</span>
          </button>
        )}

        <button
          onClick={toggleWatchSelf}
          disabled={watchersBusy}
          style={{
            padding: '6px 10px',
            borderRadius: 10,
            border: '1px solid #3a435a',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: 12,
            lineHeight: '16px',
            whiteSpace: 'nowrap',
          }}
        >
          {meWatching ? 'Не следить' : 'Cледить'}
        </button>
      </div>

      {watchersOpen && (
        <div style={{ marginTop: 8 }}>
          {(() => {
            const ph = String(phase || (isDone ? 'Done' : ''));
            const th = styleForPhase(ph);
            return (
              <WatchersBlock
                taskId={taskId}
                meChatId={meChatId}
                mode="listOnly"
                onCountChange={(n) => setWatchersCount(n)}
                onMeWatchingChange={(w) => setMeWatching(w)}
                bg={th.background}
                border={th.border}
                color={th.color}
              />
            );
          })()}
        </div>
      )}
      {/* Пикер условий приёма */}
      {acceptPickerOpen && (
        <div
          onClick={() => setAcceptPickerOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}
        >
          <div onClick={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(420px, 92vw)' }}>
            <div style={{ fontWeight:700, marginBottom:8 }}>☝️ Условия приёма</div>
            <div style={{ display:'grid', gap:8 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" checked={String((task as any)?.acceptCondition||'NONE')==='NONE'} onChange={async ()=>{
                  try { const mod = await import('./api'); const r = await mod.setAcceptCondition(taskId, meChatId, 'NONE'); if (r?.ok && r.task) setTask(prev => prev ? ({ ...prev, acceptCondition: 'NONE' } as any) : prev); if (r && (r as any).ok===false && String((r as any).error||'')==='no_rights') alert('У вас нет прав на это действие'); } catch (e:any) { const msg = String(e?.message||''); if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие'); }
                }} />
                <span>Без условий</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" checked={String((task as any)?.acceptCondition||'NONE')==='PHOTO'} onChange={async ()=>{
                  try { const mod = await import('./api'); const r = await mod.setAcceptCondition(taskId, meChatId, 'PHOTO'); if (r?.ok && r.task) setTask(prev => prev ? ({ ...prev, acceptCondition: 'PHOTO' } as any) : prev); if (r && (r as any).ok===false && String((r as any).error||'')==='no_rights') alert('У вас нет прав на это действие'); } catch (e:any) { const msg = String(e?.message||''); if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие'); }
                }} />
                <span>Нужно фото 📸</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" checked={String((task as any)?.acceptCondition||'NONE')==='APPROVAL'} onChange={async ()=>{
                  try { const mod = await import('./api'); const r = await mod.setAcceptCondition(taskId, meChatId, 'APPROVAL'); if (r?.ok && r.task) setTask(prev => prev ? ({ ...prev, acceptCondition: 'APPROVAL' } as any) : prev); if (r && (r as any).ok===false && String((r as any).error||'')==='no_rights') alert('У вас нет прав на это действие'); } catch (e:any) { const msg = String(e?.message||''); if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие'); }
                }} />
                <span>Нужно согласование 🤝</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" checked={String((task as any)?.acceptCondition||'NONE')==='PHOTO_AND_APPROVAL'} onChange={async ()=>{
                  try { const mod = await import('./api'); const r = await mod.setAcceptCondition(taskId, meChatId, 'PHOTO_AND_APPROVAL'); if (r?.ok && r.task) setTask(prev => prev ? ({ ...prev, acceptCondition: 'PHOTO_AND_APPROVAL' } as any) : prev); if (r && (r as any).ok===false && String((r as any).error||'')==='no_rights') alert('У вас нет прав на это действие'); } catch (e:any) { const msg = String(e?.message||''); if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие'); }
                }} />
                <span>Фото + согласование 📸🤝</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" checked={String((task as any)?.acceptCondition||'NONE')==='DOC_AND_APPROVAL'} onChange={async ()=>{
                  try { const mod = await import('./api'); const r = await mod.setAcceptCondition(taskId, meChatId, 'DOC_AND_APPROVAL'); if (r?.ok && r.task) setTask(prev => prev ? ({ ...prev, acceptCondition: 'DOC_AND_APPROVAL' } as any) : prev); if (r && (r as any).ok===false && String((r as any).error||'')==='no_rights') alert('У вас нет прав на это действие'); } catch (e:any) { const msg = String(e?.message||''); if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие'); }
                }} />
                <span>Документ + согласование 📎🤝</span>
              </label>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10 }}>
              <button onClick={()=> setAcceptPickerOpen(false)} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Готово</button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Фиксированная модалка выплаты исполнителю */}
      {payoutOpen && (
        <PayoutPromptModal
          open={true}
          taskId={taskId}
          amountRub={Number((task as any)?.bountyStars || 0)}
          chatId={meChatId}
          onPaid={() => {
            setTask((prev) => (prev ? ({ ...prev, bountyStatus: 'PAID' } as any) : prev));
            setPayoutOpen(false);
            // после подтверждения выплаты — эффект 👍 и сворачивание
            setTimeout(() => { animateCloseWithThumb(groupIdRef.current); }, 160);
          }}
        />
      )}

      {/* Диалог завершения: нужно фото */}
      {completeNeedPhotoOpen && (
        <div
          onClick={() => setCompleteNeedPhotoOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}
        >
          <div onClick={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(480px, 92vw)' }}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Чтобы завершить задачу, прикрепите фото</div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button disabled={uploadBusy} onClick={()=> photoInputRef.current?.click()} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: uploadBusy ? 0.6 : 1, cursor: uploadBusy ? 'default' : 'pointer' }}>🖼️ Выбрать</button>
              <button disabled={uploadBusy} onClick={()=> setCameraOpen(true)} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: uploadBusy ? 0.6 : 1, cursor: uploadBusy ? 'default' : 'pointer' }}>📸 Камера</button>
              <input ref={photoInputRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                  setUploadBusy(true);
                  const up = await (await import('./api')).uploadTaskMedia(taskId, meChatId, file);
                  if ((up as any)?.ok && (up as any)?.media?.url) {
                    await (await import('./api')).addComment(taskId, meChatId, (up as any).media.url);
                    // локально добавить media
                    try { const m = (up as any).media; setMedia((prev)=>[...prev, { id: m.id, kind: m.kind, url: m.url, fileName: m.fileName, mimeType: m.mimeType } as any]); } catch {}
                  }
                  // после загрузки сразу завершаем по логике условий
                  const condNow = String((task as any)?.acceptCondition || 'NONE');
                  const needApprovalNow = condNow === 'APPROVAL' || condNow === 'PHOTO_AND_APPROVAL' || condNow === 'DOC_AND_APPROVAL';
                  await completeTask(taskId);
                  setCompleteNeedPhotoOpen(false);
                  if (needApprovalNow) {
                    setPhase('Approval');
                    onChanged?.();
                    WebApp?.HapticFeedback?.impactOccurred?.('light');
                  } else {
                    setPhase('Done');
                    onChanged?.();
                    WebApp?.HapticFeedback?.notificationOccurred?.('success');
                    setTimeout(() => { animateCloseWithThumb(groupIdRef.current); }, 160);
                  }
                } catch (err) {
                  setError('Не удалось прикрепить фото');
                } finally {
                  setUploadBusy(false);
                }
              }} />
              <div style={{ fontSize: 12, opacity: 0.85 }}>{uploadBusy ? 'Загружаю фото…' : ''}</div>
              <button disabled={uploadBusy} onClick={()=> setCompleteNeedPhotoOpen(false)} style={{ marginLeft:'auto', padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: uploadBusy ? 0.6 : 1 }}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Диалог завершения: нужен файл (любой) */}
      {completeNeedDocOpen && (
        <div
          onClick={() => setCompleteNeedDocOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}
        >
          <div onClick={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(480px, 92vw)' }}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Чтобы завершить задачу, прикрепите файл</div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button disabled={uploadBusy} onClick={()=> docInputRef.current?.click()} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: uploadBusy ? 0.6 : 1, cursor: uploadBusy ? 'default' : 'pointer' }}>📎 Выбрать файл</button>
              <input ref={docInputRef} type="file" style={{ display:'none' }} onChange={async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                  setUploadBusy(true);
                  const up = await (await import('./api')).uploadTaskMedia(taskId, meChatId, file);
                  if ((up as any)?.ok && (up as any)?.media?.url) {
                    await (await import('./api')).addComment(taskId, meChatId, (up as any).media.url);
                    try { const m = (up as any).media; setMedia((prev)=>[...prev, { id: m.id, kind: m.kind, url: m.url, fileName: m.fileName, mimeType: m.mimeType } as any]); } catch {}
                  }
                  // завершение согласно условиям
                  const condNow = String((task as any)?.acceptCondition || 'NONE');
                  const needApprovalNow = condNow === 'APPROVAL' || condNow === 'PHOTO_AND_APPROVAL' || condNow === 'DOC_AND_APPROVAL';
                  await completeTask(taskId);
                  setCompleteNeedDocOpen(false);
                  if (needApprovalNow) {
                    setPhase('Approval');
                    onChanged?.();
                    WebApp?.HapticFeedback?.impactOccurred?.('light');
                  } else {
                    setPhase('Done');
                    onChanged?.();
                    WebApp?.HapticFeedback?.notificationOccurred?.('success');
                    setTimeout(() => { animateCloseWithThumb(groupIdRef.current); }, 160);
                  }
                } catch {}
                finally { setUploadBusy(false); }
              }} />
            </div>
          </div>
        </div>
      )}

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={async (file) => {
          try {
            setUploadBusy(true);
            const up = await (await import('./api')).uploadTaskMedia(taskId, meChatId, file);
            if ((up as any)?.ok && (up as any)?.media?.url) {
              await (await import('./api')).addComment(taskId, meChatId, (up as any).media.url);
            }
            await completeTask(taskId);
            setPhase('Done');
            onChanged?.();
            setCameraOpen(false);
            setCompleteNeedPhotoOpen(false);
            WebApp?.HapticFeedback?.notificationOccurred?.('success');
            setTimeout(() => { animateCloseWithThumb(groupIdRef.current); }, 160);
          } catch (err) {
            setError('Не удалось прикрепить фото');
          } finally {
            setUploadBusy(false);
          }
        }}
      />

      {/* Портал с анимацией завершения: 👍 либо 🥮→💫 при наличии вознаграждения */}
      <DeadlinePicker
        open={deadlineOpen}
        value={task?.deadlineAt || null}
        onClose={() => setDeadlineOpen(false)}
        onChange={async (iso) => {
          try {
            const r = await setTaskDeadline(taskId, meChatId, iso);
            if (r?.ok && r.task) {
              setTask((prev) => (prev ? { ...prev, deadlineAt: r.task!.deadlineAt || null } : prev));
              onChanged();
            }
          if (r && (r as any).ok === false && String((r as any).error||'') === 'no_rights') {
            alert('У вас нет прав на это действие');
          }
          } catch (e: any) {
            const msg = String(e?.message || '');
            if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие');
          }
        }}
      />

      <RemindersModal
        open={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        onPick={async ({ target, fireAtIso }) => {
          try {
            const r = await createTaskReminder(taskId, { createdBy: meChatId, target, fireAt: fireAtIso });
            if ((r as any)?.ok && (r as any).reminder) setReminders((prev) => [...prev, (r as any).reminder]);
          } catch (e: any) {
            const msg = String(e?.message || '');
            if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие');
          }
          finally { setRemindersOpen(false); }
        }}
      />

      {/* История задачи */}
      {historyOpen && (
        <TaskHistoryModal taskId={taskId} onClose={() => setHistoryOpen(false)} />
      )}

      {/* Плавающая круглая кнопка "назад" как в оверлеях комментариев */}
      <button
        onClick={() => onClose(origin === 'feed' ? undefined : groupIdRef.current)}
        aria-label="Назад"
        title="Назад"
        style={{
          position: 'fixed',
          right: 16,
          bottom: `calc(92px + env(safe-area-inset-bottom, 0px))`,
          width: 56,
          height: 56,
          borderRadius: 28,
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          boxShadow: '0 10px 24px rgba(0,0,0,.35)',
          fontSize: 24,
          lineHeight: '56px',
          textAlign: 'center',
          cursor: 'pointer',
          zIndex: 2100,
        }}
      >
        ←
      </button>
      {(isClosing || thumbStage !== 0) &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 99999,
            }}
          >
            {(() => {
              const bounty = Number((task as any)?.bountyStars || 0);
              const hasBounty = bounty > 0;
              const scale = (thumbStage === 1) ? 'scale(1.0)' : (thumbStage === 2) ? 'scale(1.22)' : 'scale(0.8)';
              const rot = hasBounty ? ((thumbStage === 1) ? 'rotate(360deg)' : (thumbStage === 2) ? 'rotate(720deg)' : 'rotate(0deg)') : 'rotate(0deg)';
              const icon = hasBounty ? ((String((task as any)?.bountyStatus || 'PLEDGED') === 'PAID' || thumbStage === 2) ? '💫' : '🥮') : '👍';
              return (
            <div
              style={{
                fontSize: 96,
                transform: `${scale} ${rot}`,
                opacity: thumbStage === 1 ? 1 : 0,
                transition: 'transform 300ms cubic-bezier(.2,.9,.2,1), opacity 300ms ease',
                filter: 'drop-shadow(0 10px 32px rgba(0,0,0,.45))',
                willChange: 'transform, opacity',
              }}
            >
              {icon}
            </div>
              );
            })()}
          </div>,
          document.body
        )
      }

      {groupPickerOpen && (
        <div
          onClick={() => setGroupPickerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.45)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
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
              width: 'min(460px, 92vw)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Перенести в группу</div>
              <button
                onClick={() => setGroupPickerOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* табы */}
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

            {/* список */}
            <div style={{ display: 'grid', gap: 8, maxHeight: '50vh', overflow: 'auto' }}>
              {groupTab === 'own' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="mv_group"
                    checked={!groupId}
                    onChange={() => moveToGroup(null)}
                  />
                  <span>Моя группа (личная доска)</span>
                </label>
              )}

              {groupTab === 'own'
                ? ownGroups.map((g) => (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="mv_group"
                        checked={groupId === g.id}
                        onChange={() => moveToGroup(g.id)}
                      />
                      <span>{g.title}</span>
                    </label>
                  ))
                : memberGroups.map((g) => (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="mv_group"
                        checked={groupId === g.id}
                        onChange={() => moveToGroup(g.id)}
                      />
                      <span>
                        {g.title}
                        {g.ownerName && (
                          <span style={{ opacity: 0.7, marginLeft: 6 }}>
                            👑 {g.ownerName}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
            </div>
          </div>
        </div>
      )}




{isLightboxOpen && photos.length > 0 && (
  <div
    onClick={() => setLightboxOpen(false)}
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
    >
      <img
        src={`${API_BASE}${photos[lightboxIndex].url}`}
        alt={photos[lightboxIndex].fileName || 'Фото'}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'block',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
        }}
      />
      <button
        onClick={() => setLightboxOpen(false)}
        aria-label="Закрыть"
        style={{
          position: 'absolute',
          top: 8, right: 8,
          background: 'rgba(0,0,0,0.5)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '6px 10px',
          cursor: 'pointer',
          fontSize: 14
        }}
      >
        ✕
      </button>
      {photos.length > 1 && (
        <>
          <button
            onClick={() => setLightboxIndex(i => (i - 1 + photos.length) % photos.length)}
            aria-label="Предыдущее"
            style={{
              position: 'absolute',
              top: '50%', left: -8,
              transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,0.5)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 10px',
              cursor: 'pointer'
            }}
          >
            ‹
          </button>
          <button
            onClick={() => setLightboxIndex(i => (i + 1) % photos.length)}
            aria-label="Следующее"
            style={{
              position: 'absolute',
              top: '50%', right: -8,
              transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,0.5)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 10px',
              cursor: 'pointer'
            }}
          >
            ›
          </button>
        </>
      )}
    </div>
  </div>
)}







      {/* Комментарии — вынесены ниже карточки как отдельный блок */}
      <div style={{ marginTop: 12 }}>
        {(() => {
          const ph = String(phase || (isDone ? 'Done' : ''));
          const th = styleForPhase(ph);
          return (
            <CommentsThread
              taskId={taskId}
              meChatId={meChatId}
              bg={th.background}
              border={th.border}
              color={th.color}
            />
          );
        })()}
      </div>

      {labelDrawerOpen && (
        <TaskLabelDrawer
          open={labelDrawerOpen}
          onClose={() => setLabelDrawerOpen(false)}
          taskId={taskId}
          groupId={groupId}
          chatId={meChatId}
          onSelectionChange={(ls) => setTaskLabels(ls)}
        />
      )}
    </div>
  );
}
