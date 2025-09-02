// src/TaskView.tsx

import { useEffect, useMemo, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { Task, TaskMedia } from './api';
import { listGroups, API_BASE, fetchBoard, moveTask, type Group } from './api';

import ResponsibleActions from './components/ResponsibleActions';
import CommentsThread from './components/CommentsThread';
import EventPanel from './components/EventPanel';
import ShareNewTaskMenu from './components/ShareNewTaskMenu';

import { createPortal } from 'react-dom';






import {
  getTask,
  getTaskWithGroup,
  updateTask,
  completeTask,
  reopenTask,
  deleteTask,
  // участники группы
  type GroupMember,
  getGroupMembers,
} from './api';

type Props = {
  taskId: string;
  onClose: (groupId?: string | null) => void;
  onChanged: () => void;
};

export default function TaskView({ taskId, onClose, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<Task | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<string | undefined>(undefined);
  const isDone = phase === 'Done';



// список всех групп для селектора
const [allGroups, setAllGroups] = useState<Group[]>([]);

// табы селектора
const [groupPickerOpen, setGroupPickerOpen] = useState(false);
const [groupTab, setGroupTab] = useState<'own' | 'member'>('own');

const ownGroups = useMemo(() => allGroups.filter(g => g.kind === 'own'), [allGroups]);
const memberGroups = useMemo(() => allGroups.filter(g => g.kind === 'member'), [allGroups]);



const [isClosing, setIsClosing] = useState(false);
const [thumbStage, setThumbStage] = useState<0 | 1 | 2>(0); // 0=скрыт, 1=появление, 2=затухание



  // заголовок группы
  const [groupTitle, setGroupTitle] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  // куда возвращаться при закрытии
  const groupIdRef = useRef<string | null | undefined>(undefined);

  // мягкий «тик» для обновления карточки после назначений
  const [refreshTick, setRefreshTick] = useState(0);

  // кто я (для «Сделать ответственным себя»)
  const meChatId = String(
    WebApp?.initDataUnsafe?.user?.id ||
      new URLSearchParams(window.location.search).get('from') ||
      ''
  );



const [media, setMedia] = useState<TaskMedia[]>([]);




// NEW: для модалки с фото
const photos = useMemo(() => media.filter(m => m.kind === 'photo'), [media]);
const [isLightboxOpen, setLightboxOpen] = useState(false);
const [lightboxIndex, setLightboxIndex] = useState(0);






const cardRef = useRef<HTMLDivElement | null>(null);

// куда «тянуть» карточку (в пикселях) при закрытии
const [pull, setPull] = useState<{ x: number; y: number }>({ x: 0, y: 0 });






  // участники текущей группы (для «Выбрать из группы»)
  const [members, setMembers] = useState<GroupMember[]>([]);

  // когда узнали groupId — подтягиваем участников
  useEffect(() => {
    if (!groupId) return;
    getGroupMembers(groupId)
      .then((r) => {
        if (r.ok) setMembers(r.members || []);
      })
      .catch(() => {});
  }, [groupId]);






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



const groupLabel = () => groupTitle || 'Моя группа';



  /* --- системная кнопка "Назад" --- */
  useEffect(() => {
    const onceRef = { done: false, t: 0 as any };

    const handle = () => {
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
    const me =
      WebApp?.initDataUnsafe?.user?.id ||
      new URLSearchParams(location.search).get('from');
    if (!me) return;

listGroups(String(me))
  .then((r) => {
    if (r.ok) {
      setAllGroups(r.groups || []);
      const g = r.groups.find((x: any) => x.id === groupId);
      setGroupTitle(g ? g.title : null);
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





// Плавное сворачивание карточки в 👍 и возврат на канбан

const animateCloseWithThumb = (finalGroupId?: string | null) => {
  // 0) снимаем остатки прошлого прогона
  setIsClosing(false);
  setPull({ x: 0, y: 0 });
  setThumbStage(0);

  // 1) показать 👍 по центру (слегка «впрыгивает»)
  setThumbStage(1);

  // 2) через небольшой лаг начинаем стягивать карточку в 👍
  setTimeout(() => {
    const el = cardRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const centerX = vw / 2;
      const centerY = vh / 2;

      setPull({
        x: centerX - cx,
        y: centerY - cy,
      });
    }
    setIsClosing(true);
  }, 120); // карточка «зеленеет», затем старт «всасывания»

  // 3) 👍 делает «бум» — увеличивается и начинает исчезать
  setTimeout(() => {
    setThumbStage(2);
  }, 620);

  // 4) завершение
  setTimeout(() => {
    setThumbStage(0);
    setIsClosing(false);
    setPull({ x: 0, y: 0 });
    onClose(finalGroupId ?? groupIdRef.current);
  }, 920);
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
    setGroupPickerOpen(false);
  }
};
















  /* --- действия с задачей --- */
  const save = async () => {
    const val = text.trim();
    if (!val) return;
    setSaving(true);
    try {
      await updateTask(taskId, val);
      onChanged?.();
      WebApp?.HapticFeedback?.impactOccurred?.('light');
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

const toggleDone = async () => {
  setSaving(true);
  try {
    if (isDone) {
      await reopenTask(taskId);
      setPhase('Doing');
      onChanged?.();
      WebApp?.HapticFeedback?.impactOccurred?.('medium');
    } else {
await completeTask(taskId);
setPhase('Done');
onChanged?.();
WebApp?.HapticFeedback?.notificationOccurred?.('success');

// даём карточке "позеленеть" 140–180мс и запускаем эффект
setTimeout(() => {
  animateCloseWithThumb(groupIdRef.current);
}, 160);

return; // не сбрасываем saving до завершения анимации
    }
  } catch (e: any) {
    setError(e?.message || 'Ошибка операции');
  } finally {
    setSaving(false);
  }
};






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

  // === Поделиться → открываем системный шэр с prepared message ===


  /* --- UI --- */
  if (loading) return <div style={{ padding: 16 }}>Загрузка…</div>;
  if (error) return <div style={{ padding: 16, color: 'crimson' }}>{error}</div>;

  // заголовок с «назад» и именем группы
  const Header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <button
        onClick={() => onClose(groupIdRef.current)}
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
    background: '#0f1216',
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
    <div style={{ minHeight: '100vh', background: '#0f1216', color: '#e8eaed', padding: 16 }}>
      {Header}

<div
  ref={cardRef}
  style={{
    background: isDone ? '#15251a' : '#1b2030',
    border: `1px solid ${isDone ? '#2c4a34' : '#2a3346'}`,
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
      if (task?.type === 'EVENT') {
        return creator
          ? <>Событие от: <span style={{ color: '#8aa0ff', opacity: 1 }}>{creator}</span></>
          : 'Событие';
      }
      return creator
        ? <>Задача от: <span style={{ color: '#8aa0ff', opacity: 1 }}>{creator}</span></>
        : 'Задача';
    })()}
  </div>

  {task?.id ? (
    <ShareNewTaskMenu
      taskId={task.id}
      isEvent={task?.type === 'EVENT'}
      onDelete={handleDelete}
    />
  ) : null}
</div>




{/* Группа */}
<div style={{ margin: '6px 0 10px', fontSize: 13, opacity: .85 }}>
  Группа:{' '}
  <button
    onClick={() => setGroupPickerOpen(true)}
    title="Выбрать другую группу"
    style={{
      background: 'transparent',
      border: '1px solid #2a3346',
      borderRadius: 8,
      padding: '2px 8px',
      color: '#8aa0ff',
      cursor: 'pointer'
    }}
  >
    {groupLabel()}
  </button>
</div>






        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          style={{
            width: '95%',
            background: '#121722',
            color: '#e8eaed',
            border: '1px solid #2a3346',
            borderRadius: 12,
            padding: 10,
            resize: 'vertical',
          }}
        />

         <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>ID: {task.id}</div> 

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            onClick={save}
            disabled={saving || !text.trim()}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #2a3346',
              background: '#202840',
              color: '#e8eaed',
              cursor: 'pointer',
            }}
          >
            Сохранить
          </button>

          <button
            onClick={toggleDone}
            disabled={saving}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #2a3346',
              background: isDone ? '#3a2b1f' : '#234324',
              color: isDone ? '#ffe7c7' : '#d7ffd7',
              cursor: 'pointer',
            }}
          >
            {isDone ? 'Возобновить → Doing' : 'Завершить'}
          </button>



          {/* Постановщик */}
     {/* Организатор / Постановщик */}



          {/* Ответственный / действия назначения */}
    {/* Для событий — ответственного не показываем (есть участники в EventPanel) */}

{task?.type !== 'EVENT' && (
  task.assigneeChatId ? (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        border: '1px solid #2a3346',
        background: '#15251a',
        color: '#d7ffd7',
        display: 'inline-flex',
        gap: 8,
        alignItems: 'center',
      }}
      title="Ответственный по задаче"
    >
      <span style={{ opacity: 0.8 }}>Ответственный:</span>
      <strong>{task.assigneeName || task.assigneeChatId}</strong>
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
      onAssigned={() => setRefreshTick((t) => t + 1)}
    />
  )
)}



        </div>





{media.length > 0 && (
  <div style={{ marginTop: 12 }}>
    <div style={{ fontSize: 14, opacity: .85, marginBottom: 6 }}>Вложения</div>

    {/* Фото */}
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

    {/* Голосовые */}
    {media.some(m => m.kind === 'voice') && (
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        {media.filter(m => m.kind === 'voice').map(m => (
          <div key={m.id} style={{ padding: 8, border: '1px solid #2a3346', borderRadius: 8 }}>
            <audio controls src={`${API_BASE}${m.url}`} style={{ width: '100%' }} />
            <div style={{ fontSize: 12, opacity: .7 }}>
              {m.duration ? `Длительность ~${m.duration}s` : 'Голосовое'}
            </div>
          </div>
        ))}
      </div>
    )}

    {/* Документы */}
    {media.some(m => m.kind === 'document') && (
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        {media.filter(m => m.kind === 'document').map(m => (
          <a key={m.id}
             href={`${API_BASE}${m.url}`}
             target="_blank"
             rel="noreferrer"
             style={{ padding: 8, border: '1px solid #2a3346', borderRadius: 8, color: '#8aa0ff' }}>
            📎 {m.fileName || 'Документ'}{m.fileSize ? ` · ${(m.fileSize/1024/1024).toFixed(2)} MB` : ''}
          </a>
        ))}
      </div>
    )}
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
    {/* контейнер картинки: клики по фону закрывают, по содержимому — нет */}
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
    >
      {/* изображение */}
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











      {/* Крестик */}
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

      {/* Навигация (если несколько фото) */}
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




{task?.type === 'EVENT' && (
  <EventPanel
    eventId={task.id}
    startAt={String(task.startAt || '')}   // строка
    endAt={task.endAt ?? null}
    chatId={meChatId}
    isOrganizer={Boolean((task as any)?.meIsOrganizer)}
  />
)}

      

<CommentsThread taskId={taskId} meChatId={meChatId} />



      </div>













{/* Портал с 👍, вне любых трансформов */}
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
      <div
        style={{
          fontSize: 96,
          transform:
            thumbStage === 1 ? 'scale(1.0)' : thumbStage === 2 ? 'scale(1.22)' : 'scale(0.8)',
          opacity: thumbStage === 1 ? 1 : 0,
          transition: 'transform 300ms cubic-bezier(.2,.9,.2,1), opacity 300ms ease',
          filter: 'drop-shadow(0 10px 32px rgba(0,0,0,.45))',
          willChange: 'transform, opacity',
        }}
      >
        👍
      </div>
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





    </div>
  );
}
