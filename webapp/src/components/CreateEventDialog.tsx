// src/components/CreateEventDialog.tsx
import { useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import {
  listGroups,
  type Group,
  getGroupMembers,
  type GroupMember,
  createEvent,
  addEventParticipant,
  setMyEventReminders,
  primeEventReminders,
} from '../api';

function toInputLocal(dt: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = dt.getFullYear();
  const m = pad(dt.getMonth() + 1);
  const d = pad(dt.getDate());
  const h = pad(dt.getHours());
  const i = pad(dt.getMinutes());
  return `${y}-${m}-${d}T${h}:${i}`;
}

export default function CreateEventDialog({
  open,
  chatId,
  defaultGroupId,
  initialStart,
  initialEnd,
  onClose,
  onCreated,
}: {
  open: boolean;
  chatId: string;
  defaultGroupId?: string | null;
  initialStart: Date;
  initialEnd: Date;
  onClose: () => void;
  onCreated: (eventId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | ''>(defaultGroupId || '');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [start, setStart] = useState(toInputLocal(initialStart));
  const [end, setEnd] = useState(toInputLocal(initialEnd));
  const [rem60, setRem60] = useState(false);
  const [rem10, setRem10] = useState(true);
  const [rem5, setRem5] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    listGroups(chatId).then(r => {
      if (r.ok) {
        setGroups(r.groups);
        // если дефолт не пришёл — возьмём «Моя группа», если есть
        if (!defaultGroupId) {
          const mine = r.groups.find(g => g.title === 'Моя группа');
          if (mine) setGroupId(mine.id);
        }
      }
    }).catch(() => {});
  }, [open, chatId, defaultGroupId]);

  useEffect(() => {
    if (!groupId) { setMembers([]); setSelected({}); return; }
    getGroupMembers(groupId).then(r => {
      if (r.ok) {
        setMembers(r.members || []);
        // по умолчанию никого не отмечаем (организатор — всегда ты)
        setSelected({});
      }
    }).catch(() => {});
  }, [groupId]);

  const offsets = useMemo(() => {
    const out: number[] = [];
    if (rem60) out.push(60);
    if (rem10) out.push(10);
    if (rem5) out.push(5);
    return out;
  }, [rem60, rem10, rem5]);

  const toggle = (cid: string) => setSelected(prev => ({ ...prev, [cid]: !prev[cid] }));

  const submit = async () => {
    const name = title.trim();
    if (!name) {
      alert('Укажи название события');
      return;
    }
    setBusy(true);
    try {
      const r = await createEvent({
        chatId,
        groupId: groupId || undefined,
        text: name,
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
      });
      if (!r.ok) throw new Error('API createEvent failed');
      const eventId = r.event.id;

      // участники (кроме организатора)
      const chosen = Object.entries(selected)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .filter(cid => cid !== chatId);

      // добавим участников
      for (const cid of chosen) {
        try { await addEventParticipant(eventId, chatId, cid, 'PARTICIPANT'); } catch {}
      }

      // напоминания — организатор + выбранные участники
      if (offsets.length) {
        const setFor = async (cid: string) => {
          try { await setMyEventReminders(eventId, cid, offsets); } catch {}
        };
        await setFor(chatId);
        for (const cid of chosen) await setFor(cid);
        try { await primeEventReminders(eventId, chatId); } catch {}
      }

      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onCreated(eventId);
      onClose();
    } catch (e) {
      console.error('[CreateEvent] error', e);
      alert('Не удалось создать событие');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50
    }}>
      <div style={{
        width: '100%', maxWidth: 640, background: '#1b2030',
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        border: '1px solid #2a3346', padding: 16
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Создать событие</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer' }}>✕</button>
        </div>

        <label style={{ fontSize: 13, opacity: .8 }}>Название</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Что будет?"
          style={{ width: '100%', marginTop: 6, marginBottom: 12, padding: '10px 12px',
            borderRadius: 12, background: '#121722', color: '#e8eaed', border: '1px solid #2a3346' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, opacity: .8 }}>Начало</label>
            <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)}
              style={{ width: '100%', marginTop: 6, padding: '10px 12px',
                borderRadius: 12, background: '#121722', color: '#e8eaed', border: '1px solid #2a3346' }}/>
          </div>
          <div>
            <label style={{ fontSize: 13, opacity: .8 }}>Конец</label>
            <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}
              style={{ width: '100%', marginTop: 6, padding: '10px 12px',
                borderRadius: 12, background: '#121722', color: '#e8eaed', border: '1px solid #2a3346' }}/>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 13, opacity: .8 }}>Группа</label>
          <select value={groupId} onChange={e => setGroupId(e.target.value)}
            style={{ width: '100%', marginTop: 6, padding: '10px 12px',
              borderRadius: 12, background: '#121722', color: '#e8eaed', border: '1px solid #2a3346' }}>
            <option value="">Моя группа</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 13, opacity: .8 }}>Напоминания</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setRem60(v => !v)} style={pill(rem60)}>За 60 мин</button>
            <button onClick={() => setRem10(v => !v)} style={pill(rem10)}>За 10 мин</button>
            <button onClick={() => setRem5(v => !v)} style={pill(rem5)}>За 5 мин</button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 13, opacity: .8 }}>Участники (из группы)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {members.length === 0 && <div style={{ opacity: .6, fontSize: 13 }}>Нет участников</div>}
            {members.map(m => {
              const cid = String(m.chatId);
              const checked = !!selected[cid];
              return (
                <button key={cid} onClick={() => toggle(cid)} title={m.name || cid}
                  style={pill(checked, '#1a2030')}>
                  {checked ? '✅ ' : ''}{m.name || cid}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose}
            style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #2a3346', background: '#121722', color: '#e8eaed' }}>
            Отмена
          </button>
          <button onClick={submit} disabled={busy || !title.trim()}
            style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>
            Создать событие
          </button>
        </div>
      </div>
    </div>
  );
}

function pill(active: boolean, bg = '#202840'): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid #2a3346',
    background: active ? '#234324' : bg,
    color: active ? '#d7ffd7' : '#e8eaed',
    cursor: 'pointer',
  };
}
