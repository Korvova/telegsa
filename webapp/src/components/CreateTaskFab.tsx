// webapp/src/components/CreateTaskFab.tsx
import { useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import {
  createTask,
  listGroups,
  type Group,
  getGroupMembers,
  type GroupMember,
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
  const [assignee, setAssignee] = useState<string | null>(null);

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
  };

  // PATCH ассignee сразу после создания
  async function patchAssignee(taskId: string, assigneeChatId: string | null) {
    const API = (import.meta as any).env.VITE_API_BASE || '';
    try {
      await fetch(`${API}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeChatId }),
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
      // создаём задачу
      const r = await createTask(chatId, val, groupId ?? undefined);
      if (!r?.ok || !r?.task?.id) throw new Error('create_failed');

      // если выбран ответственный — ставим сразу
      if (assignee) {
        await patchAssignee(r.task.id, assignee);
      }

      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onCreated?.();
      closeModal();
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
              <div style={{ fontWeight: 700 }}>
                {isSimpleMode
                  ? 'Новая задача'
                  : step === 0
                  ? 'Текст задачи'
                  : step === 1
                  ? 'Выбор группы'
                  : 'Ответственный'}
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
                  <textarea
                    autoFocus
                    rows={4}
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

                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
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
                      border: '1px solid transparent',
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
                      border: '1px solid transparent',
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
    </>
  );
}
