// webapp/src/components/ResponsibleActions.tsx
import React, { useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { createAssignInvite, assignSelf, pingMemberDM } from '../api/assign';
import { prepareShareMessage } from '../api';




export type Member = {
  chatId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
};

type Props = {
  taskId: string;
  taskTitle: string;
  groupId?: string | null;
  meChatId: string;
  currentAssigneeChatId?: string | null;
  members?: Member[];
  canAssign?: boolean;
  onAssigned?: (newAssigneeChatId: string) => void;
};

export default function ResponsibleActions({
  taskId,
  taskTitle,
  meChatId,
  currentAssigneeChatId,
  members = [],
  canAssign = true,
  onAssigned,
}: Props) {
  const [open, setOpen] = useState(false);
  const [subView, setSubView] = useState<'root' | 'members'>('root');
  const [busy, setBusy] = useState(false);

  const alreadyMe = useMemo(
    () => currentAssigneeChatId && String(currentAssigneeChatId) === String(meChatId),
    [currentAssigneeChatId, meChatId]
  );
  const canAssignSelf = useMemo(() => !alreadyMe, [alreadyMe]);

  const openSheet = () => setOpen(true);
  const closeSheet = () => {
    setOpen(false);
    setSubView('root');
  };

  async function doAssignSelf() {
    if (!canAssignSelf) return;
    setBusy(true);
    try {
      const r = await assignSelf(taskId, meChatId);
      if (!r.ok) throw new Error(r.error || 'assign_self_failed');
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onAssigned?.(String(meChatId));
      closeSheet();
    } catch (e) {
      console.error('[ResponsibleActions] assignSelf error', e);
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось назначить себя ответственным.');
    } finally {
      setBusy(false);
    }
  }

  // общий помощник: пригласить через инвайт (вернёт ссылку для шаринга)
  async function makeInviteLink() {
    const r = await createAssignInvite(taskId);
    if (!r.ok) throw new Error(r.error || 'invite_create_failed');
    return {
      startAppLink: r.tmeStartApp as string,
      shareText: `Нужен ответственный для задачи «${taskTitle}». Открой мини-приложение в Telegram и нажми «Принять».`,
    };
  }

  // НОВОЕ: стабильный «другой мессенджер» — текст задачи + deep-link мини-аппа на задачу
// Заменить существующую shareToOtherMessenger на эту версию
async function shareToOtherMessenger() {
  if (busy) return;
  setBusy(true);
  try {
    // 1) Получаем инвайт с токеном (даёт авто-назначение при открытии)
    const r = await createAssignInvite(taskId);
    if (!r.ok || !r.tmeStartApp) throw new Error(r.error || 'invite_create_failed');

    // deep-link вида: https://t.me/<bot>?startapp=assign__<taskId>__<token>
    // При открытии Mini App твой App.tsx примет инвайт и назначит пользователя.
    const link = String(r.tmeStartApp);

    // Текст для отправки
    const full = `🗒️ ${taskTitle}\n\n📲 Открыть:\n${link}`;

    // 2) В браузерах/PWA — пробуем системный Web Share
    const payload: ShareData = { title: taskTitle, text: full, url: link };
    const canNative =
      typeof navigator !== 'undefined' &&
      'share' in navigator &&
      (!('canShare' in navigator) || (navigator as any).canShare?.(payload));

    if (canNative) {
      try {
        await (navigator as any).share(payload);
        WebApp?.HapticFeedback?.notificationOccurred?.('success');
        closeSheet();
        return;
      } catch {
        // пойдём в ссылочный фолбэк
      }
    }

    // 3) Ссылочный фолбэк: откроем WhatsApp с готовым текстом (можно заменить цель)
    const enc = (s: string) => encodeURIComponent(s);
    const waHref = `https://wa.me/?text=${enc(full)}`;

    try {
      if (WebApp?.openLink) WebApp.openLink(waHref);
      else window.open?.(waHref, '_blank');
    } catch {
      // 4) Крайний случай: тихо положим текст в буфер (без попапа)
      try { await navigator.clipboard.writeText(full); } catch {}
    }

    WebApp?.HapticFeedback?.notificationOccurred?.('success');
    closeSheet();
  } catch (e) {
    console.error('[ResponsibleActions] share other error', e);
    WebApp?.HapticFeedback?.notificationOccurred?.('error');
    alert('Не удалось подготовить ссылку для шаринга.');
  } finally {
    setBusy(false);
  }
}








  

  async function shareToTelegram() {
    setBusy(true);
    try {
      const TG: any = (window as any).Telegram?.WebApp || WebApp;
      const meId = TG?.initDataUnsafe?.user?.id || (meChatId ? Number(meChatId) : null);

      // 1) prepared message (официальный способ)
      if (meId) {
        const { ok, preparedMessageId } = await prepareShareMessage(taskId, {
          userId: meId,
          allowGroups: true,
          withButton: true,
        });

        if (ok && preparedMessageId && typeof TG?.shareMessage === 'function') {
          TG.shareMessage(preparedMessageId, (success: boolean) => {
            WebApp?.HapticFeedback?.notificationOccurred?.(success ? 'success' : 'warning');
            if (success) closeSheet();
          });
          return;
        }
      }

      // 2) Фолбэк: обычный t.me/share/url c инвайтом
      const { startAppLink, shareText } = await makeInviteLink();
      const tgShare = `https://t.me/share/url?url=${encodeURIComponent(startAppLink)}&text=${encodeURIComponent(shareText)}`;

      if (WebApp?.openTelegramLink) {
        WebApp.openTelegramLink(tgShare);
      } else {
        window.open?.(tgShare, '_blank');
      }

      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      closeSheet();
    } catch (e) {
      console.error('[ResponsibleActions] share tg error', e);
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось открыть окно Telegram для шаринга.');
    } finally {
      setBusy(false);
    }
  }

  async function pingMember(to: Member) {
    setBusy(true);
    try {
      const r = await pingMemberDM(taskId, to.chatId);
      if (r.ok) {
        WebApp?.HapticFeedback?.notificationOccurred?.('success');
        alert('Приглашение отправлено в личку выбранному участнику.');
        closeSheet();
      } else if (r.error === 'need_manual') {
        const { startAppLink, shareText } = await makeInviteLink();
        await navigator.clipboard.writeText(`${shareText}\n${startAppLink}`);
        alert('Пользователь ещё не открыл чат с ботом. Ссылка скопирована — отправьте вручную.');
        closeSheet();
      } else {
        throw new Error(r.error || 'ping_failed');
      }
    } catch (e) {
      console.error('[ResponsibleActions] pingMember error', e);
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось отправить приглашение.');
    } finally {
      setBusy(false);
    }
  }

  const FooterHint = () => (
    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8, textAlign: 'center' }}>
      Ответственный появится в карточке задачи после «Принять».
    </div>
  );

  return (
    <>
      <button
        onClick={openSheet}
        style={{
          width: '100%',
          padding: '10px 14px',
          borderRadius: 12,
          border: '1px solid #2a3346',
          background: '#202840',
          color: '#e8eaed',
          cursor: 'pointer',
        }}
      >
        Отправить ответственному
      </button>

      {!open ? null : (
        <div style={overlay}>
          <div style={sheet}>
            {subView === 'root' ? (
              <>
                <div style={title}>Кому отправить задачу?</div>

                {canAssignSelf && (
                  <button disabled={busy} style={btn} onClick={doAssignSelf}>
                    Сделать ответственным себя
                  </button>
                )}

                {canAssign && (
                  <>
                    <button disabled={busy} style={btn} onClick={shareToOtherMessenger}>
                      Отправить в другой мессенджер
                    </button>

                    <button disabled={busy} style={btn} onClick={shareToTelegram}>
                      Отправить в Telegram
                    </button>

                    <button
                      disabled={busy || members.length === 0}
                      style={btn}
                      onClick={() => setSubView('members')}
                      title={members.length ? '' : 'В группе пока нет участников'}
                    >
                      Выбрать из группы
                    </button>
                  </>
                )}

                <FooterHint />
                <button style={closeBtn} onClick={closeSheet}>Закрыть</button>
              </>
            ) : (
              <>
                <div style={title}>Выберите участника группы</div>
                <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {members.map((m) => {
                    const name = m.firstName || m.username || m.chatId;
                    const sub = [m.lastName, m.username ? `@${m.username}` : ''].filter(Boolean).join(' ');
                    return (
                      <div key={m.chatId} style={row}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ fontSize: 15 }}>{name}</div>
                          {sub ? <div style={{ fontSize: 12, opacity: 0.7 }}>{sub}</div> : null}
                        </div>
                        <button
                          disabled={busy}
                          style={smallBtn}
                          onClick={() => pingMember(m)}
                        >
                          Отправить
                        </button>
                      </div>
                    );
                  })}
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
      )}
    </>
  );
}

// styles
const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'rgba(0,0,0,.5)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 12,
};

const sheet: React.CSSProperties = {
  width: '100%',
  maxWidth: 520,
  background: '#131a26',
  border: '1px solid #2a3346',
  borderRadius: 16,
  padding: 12,
  color: '#fff',
  boxShadow: '0 16px 50px rgba(0,0,0,.45)',
};

const title: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 10,
};

const btn: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid #2a3346',
  background: '#202840',
  color: '#e8eaed',
  cursor: 'pointer',
  marginBottom: 8,
  textAlign: 'center' as const,
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
