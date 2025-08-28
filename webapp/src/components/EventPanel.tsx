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


export default function EventPanel({
  eventId,
  startAt,
  endAt,
  chatId,
  isOrganizer,
}: {
  eventId: string;
  startAt: string;
  endAt?: string | null;
  chatId: string;
  isOrganizer: boolean;
}) {
  const [participants, setParticipants] = useState<{ chatId: string; name?: string | null; role: string }[]>([]);
  const [myOffsets, setMyOffsets] = useState<number[]>([]);
  const presets = [5, 15, 60, 24 * 60]; // мин








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

  const invite = async () => {
    const r = await createEventInvite(eventId, chatId);
    if (!r.ok) return;
    const text = r.shareText || 'Приглашаю тебя на событие';
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent(text)}`;
    WebApp?.openTelegramLink?.(shareUrl);
  };

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
            <div key={p.chatId} style={{ padding: '6px 10px', border: '1px solid #2a3346', borderRadius: 999 }}>
              {p.name || p.chatId}{p.role === 'ORGANIZER' ? ' • организатор' : ''}
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

      {isOrganizer && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={invite} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #2a3346' }}>
            Пригласить
          </button>
          <button onClick={prime} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #2a3346' }}>
            Прайм напоминаний
          </button>
        </div>
      )}
    </div>
  );
}
