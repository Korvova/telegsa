// webapp/src/components/PostCreateActionsLauncher.tsx
import React, { useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { prepareShareMessage } from '../api';
import { createAssignInvite, assignSelf, pingMemberDM } from '../api/assign';
import { createPortal } from 'react-dom';

export type MemberOption = { chatId: string; name: string };

type MakeResult = { taskId: string; taskTitle: string };

type Props = {
  label?: string;
  disabled?: boolean;
  style?: React.CSSProperties;

  meChatId: string;
  members?: MemberOption[];

  // Должен СОЗДАТЬ задачу и вернуть { taskId, taskTitle }
  onMake: () => Promise<MakeResult>;
};

export default function PostCreateActionsLauncher({
  label = 'Создать',
  disabled,
  style,
  meChatId,
  members = [],
  onMake,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subView, setSubView] = useState<'root' | 'members'>('root');

  const canAssignSelf = useMemo(() => !!meChatId, [meChatId]);

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

  async function runSafely<T>(fn: () => Promise<T>) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await fn();
      try { WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
      closeSheet();
      return result;
    } catch (e) {
      console.error('[PostCreateActionsLauncher] action error', e);
      try { WebApp?.HapticFeedback?.notificationOccurred?.('error'); } catch {}
      alert('Не удалось выполнить действие.');
    } finally {
      setBusy(false);
    }
  }

  // ==== ДЕЙСТВИЯ ====

  const doAssignSelf = () =>
    runSafely(async () => {
      const { taskId } = await onMake();            // 1) создаём
      const r = await assignSelf(taskId, meChatId); // 2) назначаем себя
      if (!r?.ok) throw new Error('assign_self_failed');
    });

  const doShareOther = () =>
    runSafely(async () => {
      const { taskId, taskTitle } = await onMake(); // 1) создаём
      const inv = await createAssignInvite(taskId); // 2) инвайт
      if (!inv?.ok || !inv.tmeStartApp) throw new Error(inv?.error || 'invite_failed');

      const link = String(inv.tmeStartApp);
      const text = `🗒️ ${taskTitle}\n\n📲 Открыть:\n${link}`;

      const payload: ShareData = { title: taskTitle, text, url: link };
      const canNative =
        typeof navigator !== 'undefined' &&
        'share' in navigator &&
        // @ts-ignore
        (!('canShare' in navigator) || navigator.canShare?.(payload));

      if (canNative) {
        // @ts-ignore
        await navigator.share(payload);
        return;
      }

      const waHref = `https://wa.me/?text=${encodeURIComponent(text)}`;
      try {
        if (WebApp?.openLink) WebApp.openLink(waHref);
        else window.open?.(waHref, '_blank');
      } catch {
        try { await navigator.clipboard.writeText(text); } catch {}
      }
    });

  const doShareTelegram = () =>
    runSafely(async () => {
      const { taskId, taskTitle } = await onMake(); // 1) создаём
      const TG: any = (window as any).Telegram?.WebApp || WebApp;
      const meId = TG?.initDataUnsafe?.user?.id || (meChatId ? Number(meChatId) : null);

      if (meId) {
        const { ok, preparedMessageId } = await prepareShareMessage(taskId, {
          userId: meId,
          allowGroups: true,
          withButton: true,
        });
        if (ok && preparedMessageId && typeof TG?.shareMessage === 'function') {
          await new Promise<void>((resolve, reject) => {
            TG.shareMessage(preparedMessageId, (success: boolean) => {
              if (success) resolve();
              else reject(new Error('shareMessage_failed'));
            });
          });
          return;
        }
      }

      // фолбэк: инвайт + t.me/share
      const inv = await createAssignInvite(taskId);
      if (!inv?.ok || !inv.tmeStartApp) throw new Error(inv?.error || 'invite_failed');

      const tgShare = `https://t.me/share/url?url=${encodeURIComponent(inv.tmeStartApp)}&text=${encodeURIComponent(
        `Нужен ответственный для задачи «${taskTitle}». Открой мини-приложение и нажми «Принять».`
      )}`;

      if (WebApp?.openTelegramLink) WebApp.openTelegramLink(tgShare);
      else window.open?.(tgShare, '_blank');
    });

  const doPingMember = (to: MemberOption) =>
    runSafely(async () => {
      const { taskId, taskTitle } = await onMake(); // 1) создаём
      const r = await pingMemberDM(taskId, to.chatId);
      if (r?.ok) return;

      if (r?.error === 'need_manual') {
        const inv = await createAssignInvite(taskId);
        if (inv?.ok && inv.tmeStartApp) {
          const text = `Задача: «${taskTitle}»\nОткрой и нажми «Принять»: ${inv.tmeStartApp}`;
          try { await navigator.clipboard.writeText(text); } catch {}
          alert('Пользователь ещё не открыл чат с ботом. Ссылка скопирована — отправьте вручную.');
          return;
        }
      }
      throw new Error('ping_failed');
    });

  // ==== UI ====

  // 1) собираем JSX оверлея
  const sheet = !open ? null : (
    <div
      onClick={closeSheet}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000010,
        background: 'rgba(0,0,0,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 92vw)',
          background: '#1b2030',
          border: '1px solid #2a3346',
          borderRadius: 12,
          padding: 12,
          color: '#e8eaed',
        }}
      >
        {subView === 'root' ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              Кому отправить задачу?
            </div>

            {canAssignSelf && (
              <button disabled={busy} style={btn} onClick={doAssignSelf}>
                Сделать ответственным себя
              </button>
            )}

            <button disabled={busy} style={btn} onClick={doShareOther}>
              Отправить в <span style={{ color: '#25D366' }}>WhatsApp</span>
            </button>

            <button disabled={busy} style={btn} onClick={doShareTelegram}>
              Отправить <span style={{ color: '#1e8ac9' }}>в Telegram</span>
            </button>

            <button
              disabled={busy || members.length === 0}
              style={btn}
              onClick={() => setSubView('members')}
              title={members.length ? '' : 'В группе пока нет участников'}
            >
              Выбрать из группы
            </button>

            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8, textAlign: 'center' }}>
              Ответственный появится в карточке задачи после «Принять».
            </div>

            <button style={closeBtn} onClick={closeSheet}>Закрыть</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              Выберите участника группы
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map((m) => (
                <div key={m.chatId} style={row}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 15 }}>{m.name || m.chatId}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{m.chatId}</div>
                  </div>
                  <button disabled={busy} style={smallBtn} onClick={() => doPingMember(m)}>
                    Отправить
                  </button>
                </div>
              ))}
              {members.length === 0 && (
                <div style={{ opacity: 0.7, textAlign: 'center', padding: 8 }}>
                  В группе пока нет участников.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={btn} onClick={() => setSubView('root')}>Назад</button>
              <button style={closeBtn} onClick={closeSheet}>Закрыть</button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // 2) возвращаем кнопочку + ПОРТАЛ оверлея
  return (
    <>
      <button
        disabled={disabled}
        onClick={openSheet}
        style={{
          width: '100%',
          padding: '10px 14px',
          borderRadius: 12,
          border: '1px solid transparent',
          background: disabled ? '#2a3350' : '#2563eb',
          color: '#fff',
          cursor: disabled ? 'default' : 'pointer',
          ...style,
        }}
      >
        {label}
      </button>

      {sheet ? createPortal(sheet, document.body) : null}
    </>
  );
}

const btn: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid #2a3346',
  background: '#202840',
  color: '#e8eaed',
  cursor: 'pointer',
  marginBottom: 8,
  textAlign: 'center',
};

const smallBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 10,
  border: '1px solid #2a3346',
  background: '#202840',
  color: '#e8eaed',
  cursor: 'pointer',
};

const closeBtn: React.CSSProperties = {
  ...btn,
  background: '#1f222b',
};

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: 8,
  borderRadius: 10,
  border: '1px solid #2a3346',
};
