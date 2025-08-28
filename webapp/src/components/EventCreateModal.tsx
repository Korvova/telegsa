// src/components/EventCreateModal.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  listGroups,
  getGroupMembers,
  type Group,
  type GroupMember,
  // --- Events API (см. патч ниже в api.ts) ---
  createEvent,
  addEventParticipant,
  setMyEventReminders,
  primeEventReminders,
} from '../api';

type Props = {
  open: boolean;
  chatId: string;                  // организатор (кто создаёт)
  initialStart: Date;
  initialEnd: Date;
  defaultGroupId?: string | null;  // выбранная вкладка «Группа» в App
  onClose: () => void;
  onCreated: (eventId: string) => void; // чтобы открыть TaskView
};

const REMINDER_PRESETS = [
  { label: 'за 1 час',  minutes: 60 },
  { label: 'за 10 мин', minutes: 10 },
  { label: 'за 5 мин',  minutes: 5  },
];

export default function EventCreateModal({
  open,
  chatId,
  initialStart,
  initialEnd,
  defaultGroupId,
  onClose,
  onCreated,
}: Props) {
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState<string>(initialStart.toISOString().slice(0, 16)); // YYYY-MM-DDTHH:mm (для <input type="datetime-local">)
  const [endAt, setEndAt]     = useState<string>(initialEnd.toISOString().slice(0, 16));
  const [groups, setGroups]   = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | 'default'>('default');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [picked, setPicked]   = useState<Record<string, boolean>>({});
  const [offsets, setOffsets] = useState<number[]>([60, 10, 5]);
  const [busy, setBusy]       = useState(false);

  // подгрузим группы
  useEffect(() => {
    if (!open) return;
    listGroups(chatId).then((r) => {
      if (!r.ok) return;
      setGroups(r.groups);
      // подобрать дефолт из пропа
      const d = (defaultGroupId && r.groups.find(g => g.id === defaultGroupId))
        ? defaultGroupId
        : (r.groups.find(g => g.title === 'Моя группа')?.id ?? 'default');
      setGroupId(d === 'default' ? 'default' : d);
    }).catch(() => {});
  }, [open, chatId, defaultGroupId]);

  // подгрузим участников выбранной группы (кроме «Моя группа» = default)
  useEffect(() => {
    const actual = (groupId && groupId !== 'default') ? groupId : null;
    if (!actual) {
      setMembers([]);
      setPicked({});
      return;
    }
    getGroupMembers(actual).then((r) => {
      const arr = r.ok ? r.members || [] : [];
      // отметим всех по умолчанию
      const map: Record<string, boolean> = {};
      for (const m of arr) if (m.chatId) map[String(m.chatId)] = true;
      // организатора тоже будем иметь в виду отдельно (он добавится по умолчанию бэком/или доб. ниже)
      setMembers(arr);
      setPicked(map);
    }).catch(() => {});
  }, [groupId]);

  const participants = useMemo(
    () => Object.keys(picked).filter(id => picked[id]),
    [picked]
  );

  const togglePick = (id: string) => {
    setPicked(p => ({ ...p, [id]: !p[id] }));
  };

  const toggleOffset = (m: number) => {
    setOffsets(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m].sort((a,b)=>a-b));
  };

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      alert('Укажи название события');
      return;
    }
    // минимальная валидация времени
    const s = new Date(startAt);
    const e = new Date(endAt);
    if (!(s.getTime()) || !(e.getTime()) || e <= s) {
      alert('Проверь дату/время начала и конца');
      return;
    }

    setBusy(true);
    try {
      // 1) создать событие
const resp = await createEvent({
  chatId,
  groupId: groupId === 'default' ? undefined : groupId,
  text: t,                  // ✅ Бэку нужен text
  startAt: s.toISOString(),
  endAt: e.toISOString(),
});




      if (!resp.ok) throw new Error('Не удалось создать событие');
      const eventId = resp.event.id;

      // 2) добавить участников (мульти) — организатор добавится отдельно, но можно и явно
      for (const pid of participants) {
        if (String(pid) === String(chatId)) continue; // организатор уже есть
        await addEventParticipant(eventId, chatId, String(pid), 'PARTICIPANT').catch(() => {});
      }

      // 3) проставить напоминашки всем (участники + организатор)
      const allForReminders = Array.from(new Set([...participants, String(chatId)]));
      for (const uid of allForReminders) {
        await setMyEventReminders(eventId, String(uid), offsets).catch(() => {});
      }

      // 4) праймим (разошлём базовые сообщения и сохраним reply_to)
      await primeEventReminders(eventId, chatId).catch(() => {});

      onCreated(eventId);
      onClose();
    } catch (e: any) {
      alert(e?.message || 'Ошибка создания события');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5000
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 92vw)',
          background: '#1b2030',
          border: '1px solid #2a3346',
          borderRadius: 16,
          padding: 16,
          color: '#e8eaed',
        }}
      >
        <div style={{ fontSize: 18, marginBottom: 12 }}>Новое событие</div>

        <div style={{ display: 'grid', gap: 10 }}>
          {/* Название */}
          <label style={{ fontSize: 13, opacity: .9 }}>Название</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Встреча с командой"
            style={{
              padding: '10px 12px', borderRadius: 12, background: '#121722',
              color: '#e8eaed', border: '1px solid #2a3346',
            }}
          />

          {/* Даты */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 13, opacity: .9 }}>Начало</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 12, background: '#121722',
                  color: '#e8eaed', border: '1px solid #2a3346',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, opacity: .9 }}>Конец</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 12, background: '#121722',
                  color: '#e8eaed', border: '1px solid #2a3346',
                }}
              />
            </div>
          </div>

          {/* Группа */}
          <label style={{ fontSize: 13, opacity: .9, marginTop: 4 }}>Группа</label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            style={{
              padding: '10px 12px', borderRadius: 12, background: '#121722',
              color: '#e8eaed', border: '1px solid #2a3346',
            }}
          >
            {/* "Моя группа" = без groupId → 'default' */}
            <option value="default">Моя группа</option>
            {groups.filter(g => g.title !== 'Моя группа').map(g => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>

          {/* Участники */}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 13, opacity: .9, marginBottom: 8 }}>Участники (из группы)</div>
            {members.length === 0 ? (
              <div style={{ opacity: .7, fontSize: 13 }}>В «Моей группе» участников нет. Можно добавить позже в карточке.</div>
            ) : (
              <div style={{ display: 'grid', gap: 6, maxHeight: 160, overflowY: 'auto', paddingRight: 4 }}>
                {members.map(m => (
                  <label key={m.chatId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={!!picked[String(m.chatId)]}
                      onChange={() => togglePick(String(m.chatId))}
                    />
                    <span>{m.name || m.chatId}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Напоминания */}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 13, opacity: .9, marginBottom: 8 }}>Напоминания</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {REMINDER_PRESETS.map(p => (
                <label key={p.minutes} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={offsets.includes(p.minutes)}
                    onChange={() => toggleOffset(p.minutes)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
            <div style={{ opacity: .7, fontSize: 12, marginTop: 6 }}>
              Напоминания придут всем участникам события в личные сообщения бота.
            </div>
          </div>
        </div>

        {/* Кнопки */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ padding: '10px 12px', borderRadius: 12, background: '#203040', color: '#e8eaed', border: '1px solid #2a3346' }}
          >
            Отмена
          </button>
          <button
            onClick={submit}
            disabled={busy || !title.trim()}
            style={{ padding: '10px 12px', borderRadius: 12, background: '#202840', color: '#e8eaed', border: '1px solid #2a3346' }}
          >
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}
