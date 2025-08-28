import { useEffect,  useState } from 'react';

import WebApp from '@twa-dev/sdk';
import { createEvent, listGroups, setMyEventReminders, createEventInvite, type Group } from '../api';


export default function EventCreateModal({
  open,
  chatId,
  initialStart,
  initialEnd,
  defaultGroupId,
  onClose,
  onCreated,
}: {
  open: boolean;
  chatId: string;
  initialStart: Date;
  initialEnd: Date;
  defaultGroupId?: string;
  onClose: () => void;
  onCreated: (eventId: string) => void;
}) {
  const [title, setTitle] = useState('');


const [openInviteAfterCreate, setOpenInviteAfterCreate] = useState(true);
  
  const [startAt, setStartAt] = useState<string>(initialStart.toISOString());
  const [endAt, setEndAt] = useState<string>(initialEnd.toISOString());
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | undefined>(defaultGroupId);
  const [reminders, setReminders] = useState<number[]>([]); // минуты: 60, 10, 5
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const me =
        WebApp?.initDataUnsafe?.user?.id ||
        new URLSearchParams(location.search).get('from');
      if (!me) return;
      const r = await listGroups(String(me));
      if (r.ok) setGroups(r.groups || []);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setStartAt(initialStart.toISOString());
    setEndAt(initialEnd.toISOString());
    setGroupId(defaultGroupId);
    setReminders([]);
  }, [open, initialStart, initialEnd, defaultGroupId]);

  const toggle = (m: number) =>
    setReminders((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const allowSave = title.trim() && new Date(startAt) <= new Date(endAt);


const onSave = async () => {
  if (!allowSave || busy) return;
  setBusy(true);
  try {
    const r = await createEvent({
      chatId,
      groupId,
      title: title.trim(),
      startAt,
      endAt,
    });
    if (!r.ok) throw new Error('create_event_failed');

    // напоминания (персональные; организатор = создатель)
    const byChatId = String(
      WebApp?.initDataUnsafe?.user?.id ||
      new URLSearchParams(location.search).get('from') ||
      chatId
    );
    if (reminders.length) {
      await setMyEventReminders(r.event.id, byChatId, reminders.slice().sort((a,b)=>a-b));
    }

    // ✅ сразу открыть приглашение (t.me/share) после создания
    if (openInviteAfterCreate) {
      try {
        const inv = await createEventInvite(r.event.id, byChatId);
        if (inv?.ok && (inv.link || inv.shareText)) {
          const url = `https://t.me/share/url?url=${encodeURIComponent(inv.link || '')}&text=${encodeURIComponent(inv.shareText || 'Присоединяйся к событию')}`;
          // в миниапп лучше открывать телеграмный диалог
          if ((WebApp as any)?.openTelegramLink) {
            (WebApp as any).openTelegramLink(url);
          } else {
            WebApp.openLink?.(url, { try_instant_view: false });
          }
        }
      } catch (e) {
        console.warn('[EventCreateModal] invite open failed', e);
      }
    }

    WebApp?.HapticFeedback?.notificationOccurred?.('success');
    onCreated(r.event.id);  // откроется карточка события
    onClose();
  } catch (e) {
    console.error('[EventCreateModal] create error', e);
    alert('Не удалось создать событие');
    WebApp?.HapticFeedback?.notificationOccurred?.('error');
  } finally {
    setBusy(false);
  }
};





  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
    }}>
      <div style={{
        width: 360, maxWidth: '90vw', background: '#1b2030', color: '#e8eaed',
        border: '1px solid #2a3346', borderRadius: 16, padding: 16
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Новое событие</div>

        <label style={{ fontSize: 13, opacity: .8 }}>Название</label>
        <input
          value={title} onChange={e=>setTitle(e.target.value)}
          style={{ width: '100%', background: '#121722', color: '#e8eaed', border: '1px solid #2a3346', borderRadius: 10, padding: 10, marginBottom: 10 }}
          placeholder="Например: Встреча в Zoom"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 13, opacity: .8 }}>Дата/время с</label>
            <input type="datetime-local"
              value={toLocalInput(startAt)}
              onChange={e => setStartAt(fromLocalInput(e.target.value))}
              style={{ width: '100%', background: '#121722', color: '#e8eaed', border: '1px solid #2a3346', borderRadius: 10, padding: 10 }}/>
          </div>
          <div>
            <label style={{ fontSize: 13, opacity: .8 }}>по</label>
            <input type="datetime-local"
              value={toLocalInput(endAt)}
              onChange={e => setEndAt(fromLocalInput(e.target.value))}
              style={{ width: '100%', background: '#121722', color: '#e8eaed', border: '1px solid #2a3346', borderRadius: 10, padding: 10 }}/>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 13, opacity: .8 }}>Группа</label>
          <select
            value={groupId || ''}
            onChange={e => setGroupId(e.target.value || undefined)}
            style={{ width: '100%', background: '#121722', color: '#e8eaed', border: '1px solid #2a3346', borderRadius: 10, padding: 10 }}
          >
            <option value="">Личная доска</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 13, opacity: .8, display: 'block', marginBottom: 8 }}>🔔 Напоминания</label>
          {[60, 10, 5].map(m => (
            <button key={m} onClick={() => toggle(m)}
              style={{
                marginRight: 8, marginBottom: 8,
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #2a3346',
                background: reminders.includes(m) ? '#203428' : '#121722',
                color: reminders.includes(m) ? '#d7ffd7' : '#e8eaed',
                cursor: 'pointer'
              }}>
              за {m} мин
            </button>
          ))}
        </div>




<div style={{ marginTop: 10 }}>
  <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, opacity: .9 }}>
    <input
      type="checkbox"
      checked={openInviteAfterCreate}
      onChange={e => setOpenInviteAfterCreate(e.target.checked)}
    />
    Открыть приглашение после создания
  </label>
</div>






        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #2a3346', background: '#121722', color: '#e8eaed' }}>
            Отмена
          </button>
          <button onClick={onSave} disabled={!allowSave || busy}
            style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>
            Создать
          </button>






        </div>
      </div>
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2,'0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth()+1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function fromLocalInput(v: string) {
  // treat as local time; convert to ISO
  const d = new Date(v);
  return new Date(
    d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()
  ).toISOString();
}
