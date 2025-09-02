// webapp/src/components/CreateTaskFab.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import CameraCaptureModal from './CameraCaptureModal'; // ⬅️ NEW

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

  // мастер-режим: 0 — текст, 1 — группа, 2 — ответственный
  const [step, setStep] = useState<0 | 1 | 2>(0);

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const [groups, setGroups] = useState<Group[]>(groupsProp || []);
  const [groupId, setGroupId] = useState<string | null>(defaultGroupId ?? null);

  const [members, setMembers] = useState<MemberOption[]>([]);













// ПОСЛЕ:
const [assignee, setAssignee] = useState<string | null>(null);

// NEW: открытие/закрытие оверлея выбора группы
const [pickerOpen, setPickerOpen] = useState(false);

// NEW: читаемое имя текущей группы
const groupLabel = () => {
  if (!groupId) return 'Моя группа';
  const g = groups.find(g => g.id === groupId);
  return g ? g.title : 'Группа';
};









// ⬇️ NEW: локальный список выбранных файлов до отправки
const [pendingFiles, setPendingFiles] = useState<File[]>([]);
const fileAnyRef = useRef<HTMLInputElement | null>(null);
const filePhotoRef = useRef<HTMLInputElement | null>(null);

const [cameraOpen, setCameraOpen] = useState(false); // ⬅️ NEW




// NEW: табы "мои / со мной" и разбиение
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
  // если есть getUserMedia — используем нашу камеру; иначе — фоллбэк на input
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
      setAssignee(null);

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

    // загружаем участников сразу и при смене groupId
    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [groupId, chatId]);

  const openModal = () => {
    setOpen(true);
    setStep(0);
  };

 const closeModal = () => {
  setOpen(false);
  setBusy(false);
  setText('');
  setAssignee(null);
  setGroupId(defaultGroupId ?? null);
  setPendingFiles([]); // ⬅️ NEW
};


  // PATCH ассignee сразу после создания

async function patchAssignee(taskId: string, assigneeChatId: string | null) {
  const API = (import.meta as any).env.VITE_API_BASE || '';
  const me = String(WebApp?.initDataUnsafe?.user?.id || chatId);

  try {
    await fetch(`${API}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assigneeChatId,
        actorChatId: me, // 👈 кто назначает
      }),
    });
  } catch (e) {
    console.warn('[CreateTaskFab] patchAssignee failed', e);
  }
}


const submit = async () => {
  const val = text.trim();
  if (!val || busy) return;
  setBusy(true);
  try {
    const r = await createTask(chatId, val, groupId ?? undefined);
    if (!r?.ok || !r?.task?.id) throw new Error('create_failed');
    const taskId = r.task.id;

    if (assignee) {
      await patchAssignee(taskId, assignee);
    }

    // ⬇️ NEW: если пользователь прикрепил файлы — отправим их в Telegram через бэкенд
    if (pendingFiles.length) {
      for (const f of pendingFiles) {
        try {
          await uploadTaskMedia(taskId, chatId, f);
        } catch (e) {
          console.warn('[CreateTaskFab] uploadTaskMedia error', e);
        }
      }
    }

    WebApp?.HapticFeedback?.notificationOccurred?.('success');
    onCreated?.();       // перезагрузка доски
    closeModal();        // очистит состояние
  } catch (e) {
    console.error('[CreateTaskFab] createTask error', e);
    WebApp?.HapticFeedback?.notificationOccurred?.('error');
    setBusy(false);
  }
};


  // мастер-режим: навигация по шагам
  const next = () => {
    if (step === 0) {
      if (!text.trim()) return;
      setStep(isSimpleMode ? 0 : 1); // в простом режиме нет шагов — сразу создаём
      if (isSimpleMode) submit();
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      submit();
    }
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
    setStep((s) => (s === 2 ? 1 : 0));
  };

  // ---------- UI ----------
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
              borderTop: '1px solid #1f2937', // ✅ фикс кавычек
            }}
          >
            {/* Заголовок */}


            
     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{ fontWeight: 700 }}>
      {isSimpleMode ? 'Новая задача' : step === 0 ? 'Текст задачи' : step === 1 ? 'Выбор группы' : 'Ответственный'}
    </div>

    {/* NEW: чип выбора группы в простом режиме */}
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
  <span style={{ opacity: 0.8 }}> </span>
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
            {isSimpleMode ? (
              // ПРОСТОЙ РЕЖИМ (в канбане): один экран — текст + ответственный
              <>
                <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
  {/* NEW: текущая группа над полем ввода */}

                  <textarea
                    autoFocus
                    rows={4}
                    placeholder="Опиши задачу…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    style={{
                      width: '95%',
                      background: '#0b1220',
                      color: '#e5e7eb',
                      border: '1px solid #1f2937',
                      borderRadius: 12,
                      padding: 10,
                      resize: 'vertical',
                    }}
                  />




                  <div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Ответственный (необязательно)</div>
                    <select
                      value={assignee ?? ''}
                      onChange={(e) => setAssignee(e.target.value || null)}
                      style={{
                        width: '100%',
                        background: '#0b1220',
                        color: '#e5e7eb',
                        border: '1px solid #1f2937',
                        borderRadius: 10,
                        padding: '8px 10px',
                      }}
                    >
                      <option value="">Не назначать</option>
                      {members.map((m) => (
                        <option key={m.chatId} value={m.chatId}>
                          {m.name || m.chatId}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* NEW: панель вложений (простой режим) */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => fileAnyRef.current?.click()}
                    title="Прикрепить файл"
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                  >
                    @
                  </button>

                  {/* 📸 — системная галерея / выбор фото */}
                  <button
                    type="button"
                    onClick={() => filePhotoRef.current?.click()}
                    title="Выбрать фото"
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                  >
                    📸
                  </button>

                  {/* 🎥 — НАША камера (getUserMedia) */}
                  <button
                    type="button"
                    onClick={openCamera}
                    title="Открыть камеру"
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                  >
                    🎥
                  </button>

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

                {/* NEW: мини-список выбранных файлов */}
                {pendingFiles.length ? (
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                    Прикреплено: {pendingFiles.map((f) => f.name || 'файл').join(', ')}
                  </div>
                ) : null}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 10 }}>
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
                    Отмена
                  </button>
                  <button
                    onClick={submit}
                    disabled={busy || !text.trim()}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: '#2563eb',
                      color: '#fff',
                      border: '1px solid transparent', // ✅ фикс кавычек
                      cursor: 'pointer',
                      minWidth: 120,
                    }}
                  >
                    {busy ? 'Создаю…' : 'Создать'}
                  </button>
                </div>
              </>
            ) : (
              // МАСТЕР (вне канбана)
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

                    {/* NEW: панель вложений (мастер, шаг 0) */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => fileAnyRef.current?.click()}
                        title="Прикрепить файл"
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                      >
                        @
                      </button>
                      <button
                        type="button"
                        onClick={() => filePhotoRef.current?.click()}
                        title="Выбрать фото"
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                      >
                        📸
                      </button>
                      <button
                        type="button"
                        onClick={openCamera}
                        title="Открыть камеру"
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                      >
                        🎥
                      </button>

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

                    {/* NEW: мини-список выбранных файлов */}
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
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {step === 2 && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Ответственный (необязательно)</div>
                    <select
                      value={assignee ?? ''}
                      onChange={(e) => setAssignee(e.target.value || null)}
                      style={{
                        background: '#0b1220',
                        color: '#e5e7eb',
                        border: '1px solid #1f2937',
                        borderRadius: 10,
                        padding: '8px 10px',
                      }}
                    >
                      <option value="">Не назначать</option>
                      {members.map((m) => (
                        <option key={m.chatId} value={m.chatId}>
                          {m.name || m.chatId}
                        </option>
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
                  <button
                    onClick={next}
                    disabled={busy || (step === 0 && !text.trim())}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: '#2563eb',
                      color: '#fff',
                      border: '1px solid transparent', // ✅ фикс кавычек
                      cursor: 'pointer',
                      minWidth: 120,
                    }}
                  >
                    {step < 2 ? '→ Далее' : busy ? 'Создаю…' : 'Создать'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}








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

      {/* NEW: табы */}
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

      {/* Список по активному табу */}
      <div style={{ display: 'grid', gap: 8, maxHeight: '50vh', overflow: 'auto' }}>
        {/* Личная доска — всегда сверху и относится к «Мои проекты» */}
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







      {/* NEW: модалка камеры (для любого режима) */}
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => setPendingFiles((prev) => [...prev, file])}
      />
    </>
  );
}
