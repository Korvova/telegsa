// webapp/src/components/PostCreateActionsSheet.tsx
import React, { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { createAssignInvite, assignSelf, pingMemberDM } from '../api/assign';
import { prepareShareMessage } from '../api';

export type MemberOption = { chatId: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;

  taskId: string;
  taskTitle: string;

  /** для "Выбрать из группы" */
  members: MemberOption[];
  /** кто я (chatId) — нужен для assign self и prepared TG */
  meChatId: string;
};

export default function PostCreateActionsSheet({
  open, onClose, taskId, taskTitle, members, meChatId,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'root' | 'members'>('root');

  if (!open) return null;

  async function makeInviteLink() {
    const r = await createAssignInvite(taskId);
    if (!r.ok || !r.tmeStartApp) throw new Error(r.error || 'invite_create_failed');
    return {
      startAppLink: r.tmeStartApp as string,
      shareText: `Нужен ответственный для задачи «${taskTitle}». Открой мини-приложение и нажми «Принять».`,
    };
  }

  async function doAssignSelf() {
    setBusy(true);
    try {
      const r = await assignSelf(taskId, meChatId);
      if (!r.ok) throw new Error(r.error || 'assign_self_failed');
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onClose();
    } catch {
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось назначить себя ответственным.');
    } finally { setBusy(false); }
  }

  async function shareOther() {
    setBusy(true);
    try {
      const { startAppLink } = await makeInviteLink();
      const full = `🗒️ ${taskTitle}\n\n📲 Открыть:\n${startAppLink}`;
      const payload: ShareData = { title: taskTitle, text: full, url: startAppLink };

      const canNative = typeof navigator !== 'undefined'
        && 'share' in navigator
        && (!('canShare' in navigator) || (navigator as any).canShare?.(payload));

      if (canNative) {
        try { await (navigator as any).share(payload); WebApp?.HapticFeedback?.notificationOccurred?.('success'); onClose(); return; }
        catch {}
      }
      const waHref = `https://wa.me/?text=${encodeURIComponent(full)}`;
      try { WebApp?.openLink?.(waHref) ?? window.open?.(waHref, '_blank'); } catch {}
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onClose();
    } catch {
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось подготовить ссылку для шаринга.');
    } finally { setBusy(false); }
  }

  async function shareTelegram() {
    setBusy(true);
    try {
      const TG: any = (window as any).Telegram?.WebApp || WebApp;
      const meId = TG?.initDataUnsafe?.user?.id || (meChatId ? Number(meChatId) : null);

      if (meId) {
        const { ok, preparedMessageId } = await prepareShareMessage(taskId, {
          userId: meId, allowGroups: true, withButton: true,
        });
        if (ok && preparedMessageId && typeof TG?.shareMessage === 'function') {
          TG.shareMessage(preparedMessageId, (success: boolean) => {
            WebApp?.HapticFeedback?.notificationOccurred?.(success ? 'success' : 'warning');
            if (success) onClose();
          });
          return;
        }
      }

      const { startAppLink, shareText } = await makeInviteLink();
      const tgShare = `https://t.me/share/url?url=${encodeURIComponent(startAppLink)}&text=${encodeURIComponent(shareText)}`;
      if (WebApp?.openTelegramLink) WebApp.openTelegramLink(tgShare);
      else window.open?.(tgShare, '_blank');

      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onClose();
    } catch {
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось открыть Telegram для шаринга.');
    } finally { setBusy(false); }
  }

  async function pingMember(to: MemberOption) {
    setBusy(true);
    try {
      const r = await pingMemberDM(taskId, to.chatId);
      if (r.ok) {
        WebApp?.HapticFeedback?.notificationOccurred?.('success');
        alert('Приглашение отправлено в личку выбранному участнику.');
        onClose();
        return;
      }
      if (r.error === 'need_manual') {
        const { startAppLink, shareText } = await makeInviteLink();
        try { await navigator.clipboard.writeText(`${shareText}\n${startAppLink}`); } catch {}
        alert('Пользователь ещё не открыл чат с ботом. Ссылка скопирована — отправьте вручную.');
        onClose();
        return;
      }
      throw new Error(r.error || 'ping_failed');
    } catch {
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось отправить приглашение.');
    } finally { setBusy(false); }
  }

  const btn: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 12,
    border: '1px solid #2a3346', background: '#202840',
    color: '#e8eaed', cursor: 'pointer', marginBottom: 8, textAlign: 'center',
  };
  const closeBtn: React.CSSProperties = { ...btn, background: '#1f222b' };
  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, padding: 8, borderRadius: 10, border: '1px solid #2a3346',
  };
  const smallBtn: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 10, border: '1px solid #2a3346',
    background: '#202840', color: '#e8eaed', cursor: 'pointer',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: '#131a26', border: '1px solid #2a3346',
          borderRadius: 16, padding: 12, color: '#fff',
          boxShadow: '0 16px 50px rgba(0,0,0,.45)',
        }}
      >
        {view === 'root' ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Кому отправить задачу?</div>

            <button disabled={busy} style={btn} onClick={doAssignSelf}>
              Сделать ответственным себя
            </button>

            <button disabled={busy} style={btn} onClick={shareOther}>
              Отправить в другой мессенджер
            </button>

            <button disabled={busy} style={btn} onClick={shareTelegram}>
              Отправить в Telegram
            </button>

            <button
              disabled={busy || members.length === 0}
              style={btn}
              onClick={() => setView('members')}
              title={members.length ? '' : 'В группе пока нет участников'}
            >
              Выбрать из группы
            </button>

            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8, textAlign: 'center' }}>
              Ответственный появится в карточке задачи после «Принять».
            </div>

            <button style={closeBtn} onClick={onClose}>Закрыть</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Выберите участника группы</div>
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map((m) => (
                <div key={m.chatId} style={row}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 15 }}>{m.name || m.chatId}</div>
                  </div>
                  <button disabled={busy} style={smallBtn} onClick={() => pingMember(m)}>
                    Отправить
                  </button>
                </div>
              ))}
              {!members.length && (
                <div style={{ opacity: 0.7, textAlign: 'center', padding: 8 }}>
                  В группе пока нет участников.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={btn} onClick={() => setView('root')}>Назад</button>
              <button style={closeBtn} onClick={onClose}>Закрыть</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
