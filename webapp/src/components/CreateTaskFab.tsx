// webapp/src/components/CreateTaskFab.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
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
                        🪙
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

                                // Привязать вознаграждение (и симулировать депозит)
                                if (bountyAmount > 0) {
                                  try {
                                    const api = await import('../api');
                                    await api.setTaskBounty(newTaskId, chatId, bountyAmount);
                                    await api.fakeDeposit(newTaskId, chatId, bountyAmount);
                                  } catch {}
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

                                return { taskId: newTaskId, taskTitle: title };
                              }}
                            />
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

                    {bountyAmount > 0 ? (() => {
                      const fee = Math.round((bountyAmount * 100)) / 10000; // 1%
                      const total = bountyAmount + fee;
                      return (
                        <div style={{ fontSize: 12, opacity: 0.95, display:'grid', gap:6 }}>
                          <div>🪙 Вознаграждение: <b>{bountyAmount}</b> TON</div>
                          <div>Комиссия (1%): {fee.toFixed(4)} USDT • Плательщик: заказчик</div>
                          <div>Итого к оплате: <b>{total.toFixed(4)} USDT</b></div>
                          <div style={{ marginTop: 4 }}>
                            <TonWalletConnect chatId={chatId} />
                          </div>
                          <div>
                            <button
                              onClick={async ()=>{
                                try {
                                  const qr = await fetch('/telegsar-api/bounty/quote', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount: bountyAmount }) });
                                  const qj = await qr.json();
                                  if (!qj?.ok) { alert(qj?.error || 'quote_failed'); return; }
                                  // узнаем адрес кошелька из статуса
                                  const st = await fetch(`/telegsar-api/wallet/ton/status?chatId=${encodeURIComponent(chatId)}`);
                                  const sj = await st.json();
                                  if (sj?.network && sj.network !== 'mainnet') {
                                    alert('Кошелёк подключен к '+sj.network+'. Переключите в Tonkeeper сеть на Mainnet и переподключите.');
                                    return;
                                  }
                                  const ownerAddress = sj?.address || '';
                                  const fr = await fetch('/telegsar-api/bounty/fund-request', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId, ownerAddress, amount: bountyAmount }) });
                                  const fj = await fr.json().catch(()=>({ ok:false, error:'internal' }));
                                  if (!fr.ok || !fj?.ok) {
                                    const code = fr.status;
                                    const err = fj?.error || `http_${code}`;
                                    if (String(err).startsWith('tonapi_failed_400')) alert('TonAPI: неверный адрес или jetton. Проверьте кошелёк и повторите.');
                                    else if (err === 'jetton_wallet_not_found') alert('Не найден USDT-кошелёк для этого адреса. Попробуйте получить первый USDT-токен, чтобы кошелёк развернулся.');
                                    else if (String(err).startsWith('wallet_network_mismatch')) alert('Кошелёк в другой сети. Переключите на Mainnet и переподключите.');
                                    else alert(err || 'USDT не настроен. Сообщите администратору.');
                                    return;
                                  }
                                  // @ts-ignore
                                  const ton = (window as any).ton;
                                  if (!ton?.sendTransaction) { alert('TonConnect не инициализирован'); return; }
                                  await ton.sendTransaction(fj.transaction);
                                } catch (e:any) { alert(e?.message || 'payment_failed'); }
                              }}
                              style={{ padding:'8px 12px', borderRadius: 10, border:'1px solid transparent', background:'#16a34a', color:'#fff' }}
                            >Оплатить TON</button>
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
                        🪙
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
                        🪙
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
                onClick={() => { setPickerOpen(false); focusText(); }}
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
        onApply={(n) => setBountyAmount(n)}
        onClose={() => { setBountyOpen(false); focusText(); }}
      />
    </>
  );
}
