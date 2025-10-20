import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import {
  listEventParticipants,
  getMyEventReminders,
  setMyEventReminders,     // возможно раньше было с chatId
  primeEventReminders,
  createEventInvite,
  updateEvent,
} from '../api';
import RankName from './RankName';
import { useMyRankIcon } from '../hooks/useMyRankIcon';


export default function EventPanel({
  eventId,
  startAt,
  endAt,
  chatId,
  isOrganizer,
  eventTitle,
}: {
  eventId: string;
  startAt: string;
  endAt?: string | null;
  chatId: string;
  isOrganizer: boolean;
  eventTitle?: string;
}) {
  const [participants, setParticipants] = useState<{ chatId: string; name?: string | null; role: string }[]>([]);
  const [myOffsets, setMyOffsets] = useState<number[]>([]);
  const presets = [5, 15, 60, 24 * 60]; // мин
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const myRankIcon = useMyRankIcon(chatId);








useEffect(() => {
  let ignore = false;
  (async () => {
    try {
      const r = await listEventParticipants(eventId);
      if (!ignore && r?.ok) setParticipants(r.participants || []);
    } catch {}
  })();
  return () => { ignore = true; };
}, [eventId]);




useEffect(() => {
  let ignore = false;
  (async () => {
    try {
      const r = await getMyEventReminders(eventId, chatId);
      if (ignore || !r?.ok) return;
      const offs = Array.isArray(r.offsets) && r.offsets.length
        ? r.offsets
        : (r.reminders || []).map((x: any) => x.offsetMinutes);
      setMyOffsets([...new Set(offs)].sort((a, b) => a - b));
    } catch {}
  })();
  return () => { ignore = true; };
}, [eventId, chatId]);






  const togglePreset = async (m: number) => {
    const next = myOffsets.includes(m)
      ? myOffsets.filter(x => x !== m)
      : [...myOffsets, m].sort((a,b)=>a-b);
    setMyOffsets(next);
    await setMyEventReminders(eventId, chatId, next);
    WebApp?.HapticFeedback?.impactOccurred?.('light');
  };

  const openInviteSheet = () => setInviteSheetOpen(true);
  const closeInviteSheet = () => setInviteSheetOpen(false);

  async function makeInviteLink() {
    const r = await createEventInvite(eventId, chatId);
    if (!r.ok) throw new Error('invite_create_failed');
    return {
      link: r.link as string,
      shareText: r.shareText || `Приглашаю на событие "${eventTitle || 'событие'}"`,
    };
  }

  async function shareToOtherMessenger() {
    if (busy) return;
    setBusy(true);
    try {
      const { link, shareText } = await makeInviteLink();
      const full = `${shareText}\n\n📲 Открыть:\n${link}`;

      const payload: ShareData = { title: eventTitle || 'Событие', text: full, url: link };
      const canNative =
        typeof navigator !== 'undefined' &&
        'share' in navigator &&
        (!('canShare' in navigator) || (navigator as any).canShare?.(payload));

      if (canNative) {
        try {
          await (navigator as any).share(payload);
          WebApp?.HapticFeedback?.notificationOccurred?.('success');
          closeInviteSheet();
          return;
        } catch {}
      }

      const enc = (s: string) => encodeURIComponent(s);
      const waHref = `https://wa.me/?text=${enc(full)}`;

      try {
        if (WebApp?.openLink) WebApp.openLink(waHref);
        else window.open?.(waHref, '_blank');
      } catch {
        try { await navigator.clipboard.writeText(full); } catch {}
      }

      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      closeInviteSheet();
    } catch (e) {
      console.error('[EventPanel] share other error', e);
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось подготовить ссылку для шаринга.');
    } finally {
      setBusy(false);
    }
  }

  async function shareToTelegram() {
    if (busy) return;
    setBusy(true);
    try {
      const { link, shareText } = await makeInviteLink();
      const tgShare = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;

      if (WebApp?.openTelegramLink) {
        WebApp.openTelegramLink(tgShare);
      } else {
        window.open?.(tgShare, '_blank');
      }

      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      closeInviteSheet();
    } catch (e) {
      console.error('[EventPanel] share tg error', e);
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось открыть окно Telegram для шаринга.');
    } finally {
      setBusy(false);
    }
  }

  const prime = async () => {
    if (!confirm('Разослать базовые сообщения участникам?')) return;
    const r = await primeEventReminders(eventId, chatId);
    if (r.ok) {
      alert(`Отправлено: ${r.primed}. Пропущено (нет writeAccess): ${r.skipped.length}`);
    }
  };

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString() : '—';

  return (
    <div style={{ marginTop: 12, padding: 12, border: '1px solid #2a3346', borderRadius: 12 }}>
  <div style={{ marginBottom: 8, opacity: .8 }}>
  🗓 {fmt(startAt)}{endAt ? ` — ${fmt(endAt)}` : ''}{' '}
  {isOrganizer && (
    <button
      onClick={async () => {
        const s0 = startAt ? new Date(startAt) : new Date();
        const e0 = endAt ? new Date(endAt) : s0;
        const s = prompt('Новая дата/время начала (ISO)', s0.toISOString());
        if (!s) return;
        const e = prompt('Новая дата/время конца (ISO)', e0.toISOString());
        if (!e) return;
        const r = await updateEvent(eventId, chatId, { startAt: s, endAt: e });
        if (r.ok) {
          alert('Даты обновлены');
          // примитивно перерисуемся
          location.reload();
        } else {
          alert('Не удалось обновить даты');
        }
      }}
      style={{ marginLeft: 8, background: 'transparent', border: '1px solid #2a3346', borderRadius: 8, color: '#8aa0ff', padding: '2px 6px' }}
      title="Изменить даты события"
    >
      Изменить
    </button>
  )}
</div>


      <div style={{ margin: '8px 0' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Участники</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {participants.map(p => (
            <div key={p.chatId} style={{ padding: '6px 10px', border: '1px solid #2a3346', borderRadius: 999, fontSize: 14 }}>
              <RankName
                chatId={p.chatId}
                name={p.name || p.chatId}
                meChatId={chatId}
                myRankIcon={myRankIcon || null}
              />
              {p.role === 'ORGANIZER' ? ' • организатор' : ''}
            </div>
          ))}
        </div>
      </div>

      <div style={{ margin: '8px 0' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Мои напоминания</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {presets.map(m => (
            <button key={m}
              onClick={() => togglePreset(m)}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: myOffsets.includes(m) ? '1px solid #8ab4ff' : '1px solid #2a3346',
                background: myOffsets.includes(m) ? '#172036' : 'transparent',
                color: 'inherit',
              }}>
              {m >= 60 ? `${m/60} ч` : `${m} мин`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        <button
          onClick={openInviteSheet}
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
          Пригласить участника
        </button>

        {isOrganizer && (
          <button onClick={prime} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #2a3346' }}>
            Прайм напоминаний
          </button>
        )}
      </div>

      {inviteSheetOpen && (
        <div style={overlay} onClick={closeInviteSheet}>
          <div style={sheet} onClick={(e) => e.stopPropagation()}>
            <div style={titleStyle}>Кому отправить приглашение?</div>

            <button disabled={busy} style={btn} onClick={shareToOtherMessenger}>
              Отправить в другой мессенджер
            </button>

            <button disabled={busy} style={btn} onClick={shareToTelegram}>
              Отправить в Telegram
            </button>

            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8, textAlign: 'center' }}>
              Участник появится в списке после перехода по ссылке.
            </div>

            <button style={closeBtn} onClick={closeInviteSheet}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
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

const titleStyle: React.CSSProperties = {
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

const closeBtn: React.CSSProperties = {
  ...btn,
  background: '#1f222b',
  marginTop: 4,
};
