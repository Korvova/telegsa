// webapp/src/components/CreateTaskFab.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import CameraCaptureModal from './CameraCaptureModal';
import PostCreateActionsLauncher from './PostCreateActionsLauncher';
import VoiceRecorder from './VoiceRecorder';

import WebApp from '@twa-dev/sdk';
import {
  createTask,
  listGroups,
  type Group,
  getGroupMembers,
  type GroupMember,
  uploadTaskMedia,
} from '../api';

type Props = {
  /** Группа по умолчанию; если проп передан (даже null) — считаем, что мы внутри канбана */
  defaultGroupId?: string | null;
  /** Кто создаёт (chatId текущего пользователя) */
  chatId: string;
  /** Уже загруженные группы (если переданы — не будем дергать API) */
  groups?: Group[];
  /** Колбэк после успешного создания */
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

  // если проп defaultGroupId передан (в т.ч. null) — мы на странице канбана и знаем текущую группу
  const isSimpleMode = useMemo(
    () => typeof defaultGroupId !== 'undefined',
    [defaultGroupId],
  );

  // мастер-режим: 0 — текст, 1 — группа (шаг 2 убран)
  const [step, setStep] = useState<0 | 1>(0);

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const [groups, setGroups] = useState<Group[]>(groupsProp || []);
  const [groupId, setGroupId] = useState<string | null>(defaultGroupId ?? null);

  const [members, setMembers] = useState<MemberOption[]>([]);
  const membersAsOptions: MemberOption[] = members.map(m => ({ chatId: m.chatId, name: m.name }));






  // всплывашка выбора группы (в простом режиме)
  const [pickerOpen, setPickerOpen] = useState(false);

  // ref для клика по стрелке (Ctrl/Cmd+Enter)
  const sendRef = useRef<HTMLDivElement | null>(null);

  // читаемое имя текущей группы
  const groupLabel = () => {
    if (!groupId) return 'Моя группа';
    const g = groups.find(g => g.id === groupId);
    return g ? g.title : 'Группа';
  };

  // локальные вложения до отправки
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);




// текущее аудио-вложение (берём первый аудиофайл)
const audioFile = useMemo(
  () => pendingFiles.find((f) => f.type?.startsWith('audio/')) || null,
  [pendingFiles]
);

// URL для <audio>
const [audioUrl, setAudioUrl] = useState<string | null>(null);
useEffect(() => {
  if (audioFile) {
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setAudioUrl(null);
    };
  } else {
    setAudioUrl(null);
  }
}, [audioFile]);

// ВАЖНО: canSend считаем ПОСЛЕ pendingFiles!
const canSend = text.trim().length > 0 || pendingFiles.length > 0;









  const fileAnyRef = useRef<HTMLInputElement | null>(null);
  const filePhotoRef = useRef<HTMLInputElement | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);





  // табы в пикере групп
  const [groupTab, setGroupTab] = useState<'own' | 'member'>('own');

  const ownGroups = useMemo(
    () => groups.filter((g) => g.kind === 'own'),
    [groups]
  );
  const memberGroups = useMemo(
    () => groups.filter((g) => g.kind === 'member'),
    [groups]
  );

  const onPickFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files).slice(0, 10);
    setPendingFiles((prev) => [...prev, ...arr]);
  };

  const openCamera = () => {
    const hasGUM = typeof (navigator as any)?.mediaDevices?.getUserMedia === 'function';
    if (hasGUM) {
      setCameraOpen(true);
    } else {
      filePhotoRef.current?.click();
    }
  };

  // подгружаем группы при необходимости
  useEffect(() => {
    if (groupsProp && groupsProp.length) {
      setGroups(groupsProp);
      return;
    }
    if (!chatId) return;
    listGroups(chatId)
      .then((r) => {
        if (r.ok) setGroups(r.groups);
      })
      .catch(() => {});
  }, [chatId, groupsProp]);

  // подгружаем участников выбранной группы (или сам себя для “Моей группы”)
  useEffect(() => {
    let cancelled = false;

    async function loadMembers() {
      // Моя группа — единственный допустимый “участник” это сам пользователь
      if (!groupId) {
        const meName =
          WebApp?.initDataUnsafe?.user
            ? [WebApp.initDataUnsafe.user.first_name, WebApp.initDataUnsafe.user.last_name]
                .filter(Boolean)
                .join(' ')
            : String(chatId);
        if (!cancelled) {
          setMembers([{ chatId, name: meName || String(chatId) }]);
        }
        return;
      }

      try {
        const r = await getGroupMembers(groupId);
        if (!r.ok) throw new Error('members_load_failed');

        const owner = r.owner ? [r.owner] : [];
        const raw: GroupMember[] = [...owner, ...(r.members || [])];

        // уберём дубли по chatId, преобразуем в удобный вид
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
  };

  const closeModal = () => {
    setOpen(false);
    setBusy(false);
    setText('');
    setGroupId(defaultGroupId ?? null);
    setPendingFiles([]);
  };

  const back = () => {
    if (isSimpleMode) {
      closeModal();
      return;
    }
    if (step === 0) {
      closeModal();
      return;
    }
    setStep(0);
  };

  return (
    <>
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
            zIndex: 1000,
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
                <div style={{ fontWeight: 700 }}>
                  {isSimpleMode ? 'Новая задача' : step === 0 ? 'Текст задачи' : 'Выбор группы'}
                </div>

                {/* Чип выбора группы в простом режиме */}
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
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      Группа: <b>{groupLabel()}</b>
                    </div>
                  </button>
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


{/* Контент */}
{isSimpleMode ? (
  <>
    <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
      {/* Весь бар: textarea сверху, вложения снизу */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>






{/* Текст/плеер + кнопка справа */}
<div
  style={{
    position: 'relative',
    flex: 1,
    minWidth: 0,
    paddingRight: 52, // место под кнопку
  }}
>
  {/* если есть записанное аудио и текст пуст — показываем плеер вместо textarea */}
  {audioFile && !text.trim() ? (
    <div style={{ display: 'grid', gap: 6 }}>
      <audio
        controls
        src={audioUrl ?? undefined}
        style={{ width: '100%', outline: 'none' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            // удалить только текущее аудио
            setPendingFiles((prev) => prev.filter((f) => f !== audioFile));
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
          onClick={() => {
            // заглушка — подключим Whisper на следующем шаге
            alert('Транскрибацию (~A) подключим на следующем шаге (Whisper).');
          }}
          title="Транскрибировать (~A)"
          style={{
            padding: '6px 10px',
            borderRadius: 10,
            border: '1px solid #2a3346',
            background: '#202840',
            color: '#e8eaed',
            cursor: 'pointer',
          }}
        >
          ~A
        </button>
      </div>
    </div>
  ) : (
    <textarea
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
        resize: 'none',
        minHeight: 38,
        maxHeight: 80,
        lineHeight: '20px',
        overflowY: 'auto',
      }}
    />
  )}

  {/* Стрелка/микрофон — кнопка в круге, меню якорится на внутреннюю обёртку */}
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
    <div
      ref={sendRef}
      style={{ width: '100%,', height: '100%', pointerEvents: 'auto' }}
    >
      {canSend ? (
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
  const title = val || 'Голосовая заметка'; // 🔧 запасной заголовок
  const r = await createTask(chatId, title, groupId ?? undefined);
  if (!r?.ok || !r?.task?.id) throw new Error('create_failed');
  const newTaskId = r.task.id;

  if (pendingFiles.length) {
    for (const f of pendingFiles) {
      try { await uploadTaskMedia(newTaskId, chatId, f); } catch {}
    }
  }

  WebApp?.HapticFeedback?.notificationOccurred?.('success');
  onCreated?.();
  closeModal();

  return { taskId: newTaskId, taskTitle: title };
}}




        />
      ) : (
        <VoiceRecorder
          maxSeconds={30}
          buttonStyle={{ width: '100%', height: '100%' }}
          onRecorded={(file) => {
            // положим запись во вложения — появится плеер и кнопка ➤
            setPendingFiles((prev) => [...prev, file]);
          }}
        />
      )}
    </div>
  </div>
</div>





        

        {/* Панель вложений под полем */}
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
          >@</button>

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
      </div>{/* ← ЗАКРЫВАЕМ колонку */}

      {/* скрытые инпуты для вложений */}
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
        <textarea
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
            resize: 'vertical',
          }}
        />
        {/* Панель вложений (мастер, шаг 0) */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => fileAnyRef.current?.click()} title="Прикрепить файл"
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>@</button>
          <button type="button" onClick={() => filePhotoRef.current?.click()} title="Выбрать фото"
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>🖼️</button>
          <button type="button" onClick={openCamera} title="Открыть камеру"
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>📸</button>

          {/* скрытые инпуты */}
          <input ref={fileAnyRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />
          <input ref={filePhotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />
        </div>

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

      {/* В мастере тоже создаём через лончер */}
      <PostCreateActionsLauncher
        label={step === 0 ? '→ Далее' : 'Создать'}
        disabled={!text.trim()}
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

          if (pendingFiles.length) {
            for (const f of pendingFiles) {
              try { await uploadTaskMedia(newTaskId, chatId, f); } catch {}
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

      {/* Пикер группы (простой режим) */}
      {pickerOpen && isSimpleMode && (
        <div
          onClick={() => setPickerOpen(false)}
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
                onClick={() => setPickerOpen(false)}
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
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="radio"
                    name="group"
                    checked={!groupId}
                    onChange={() => setGroupId(null)}
                  />
                  <span>Моя группа (личная доска)</span>
                </label>
              )}

              {groupTab === 'own'
                ? ownGroups.map((g) => (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="group"
                        checked={groupId === g.id}
                        onChange={() => setGroupId(g.id)}
                      />
                      <span>{g.title}</span>
                    </label>
                  ))
                : memberGroups.map((g) => (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="group"
                        checked={groupId === g.id}
                        onChange={() => setGroupId(g.id)}
                      />
                      <span>
                        {g.title}
                        {g.ownerName && (
                          <span style={{ opacity: 0.7, marginLeft: 6 }}>
                            (👑 {g.ownerName})
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => setPickerOpen(false)}
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

      {/* модалка камеры */}
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => setPendingFiles((prev) => [...prev, file])}
      />
    </>
  );
}
