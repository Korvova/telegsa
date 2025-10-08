// src/CalendarView.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import type { SlotInfo, Event as RBCEvent, View } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/ru';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { listEvents, type EventItem, getTaskWithGroup, listGroups } from './api';
import { RankBadgeButton } from './components/Achievements';
import EventCreateModal from './components/EventCreateModal';
import GroupFilterModal from './components/GroupFilterModal';





moment.locale('ru');
const localizer = momentLocalizer(moment);

type CalEvent = RBCEvent & { id: string };

export default function CalendarView({
  chatId,
  groupId,
  onOpenTask,
}: {
  chatId: string;
  groupId?: string | null;
  onOpenTask: (id: string) => void;
}) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [phases, setPhases] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [localGroupId, setLocalGroupId] = useState<string | undefined>(groupId || undefined);
  const [currentGroupTitle, setCurrentGroupTitle] = useState<string | null>(null);

  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState<Date>(new Date());
  const rootRef = useRef<HTMLDivElement | null>(null);

  const messages = useMemo(() => ({
    date: 'Дата', time: 'Время', event: 'Событие', allDay: 'Весь день',
    week: 'Неделя', work_week: 'Рабочая неделя', day: 'День', month: 'Месяц',
    previous: 'Назад', next: 'Вперёд', today: 'Сегодня', agenda: 'Повестка',
    noEventsInRange: 'Нет событий в этот период',
    showMore: (t: number) => `+ ещё ${t}`,
  }), []);

  const formats = useMemo(() => ({
    timeGutterFormat: 'HH:mm',


    dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }, _c: unknown, l: any) =>
      `${l.format(start, 'D MMM')} – ${l.format(end, 'D MMM YYYY')}`,



        agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }, _c: unknown, l: any) =>
      `${l.format(start, 'HH:mm')} – ${l.format(end, 'HH:mm')}`,
    dayHeaderFormat: 'dddd, D MMMM YYYY',



    eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }, _c: unknown, l: any) =>
      `${l.format(start, 'HH:mm')} – ${l.format(end, 'HH:mm')}`,









    agendaHeaderFormat: ({ start, end }: { start: Date; end: Date }, _c: unknown, l: any) =>
      `${l.format(start, 'D MMM YYYY')} – ${l.format(end, 'D MMM YYYY')}`,
  }), 
  
  
  []);

  const reload = async () => {
    const effective = localGroupId !== undefined ? localGroupId : (groupId || undefined);
    const r = await listEvents(chatId, effective);
    if (!r.ok) return;
    setEvents(r.events);
  };

  useEffect(() => { reload(); }, [chatId, groupId, localGroupId]);

  // Load current group title for header pill
  useEffect(() => {
    const gid = localGroupId ?? groupId ?? undefined;
    if (!gid) { setCurrentGroupTitle(null); return; }
    let alive = true;
    (async () => {
      try {
        const r = await listGroups(String(chatId));
        if (!alive) return;
        if ((r as any)?.ok) {
          const g = (r as any).groups?.find((x: any) => String(x.id) === String(gid));
          setCurrentGroupTitle(g ? String(g.title || '') : null);
        }
      } catch { setCurrentGroupTitle(null); }
    })();
    return () => { alive = false; };
  }, [chatId, groupId, localGroupId]);

  // Fetch phases for visible event tasks to color by task status
  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set(events.map((e) => String(e.id))));
    const missing = ids.filter((id) => !(id in phases));
    if (missing.length === 0) return;
    (async () => {
      try {
        const batch = await Promise.all(
          missing.map(async (id) => {
            try {
              const r = await getTaskWithGroup(id);
              const phase = String((r as any)?.phase || '').trim();
              return { id, phase } as { id: string; phase: string };
            } catch { return { id, phase: '' }; }
          })
        );
        if (cancelled) return;
        setPhases((prev) => {
          const next = { ...prev } as Record<string, string>;
          for (const it of batch) next[it.id] = it.phase || next[it.id] || '';
          return next;
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [events, phases]);

  const handleSelect = ({ start, end }: SlotInfo) => {
    setRange({ start: start as Date, end: end as Date });
    setModalOpen(true);
  };

  const onSelectEvent = (e: any) => onOpenTask(String(e.id));

const mapped: CalEvent[] = events.map((e) => ({
  id: e.id,
  title: (e as any).title || (e as any).text || 'Событие',
  start: new Date(e.startAt),
  end: new Date(e.endAt || e.startAt),
  allDay: false,
}));

  // Цвета событий по аналогии со статусами задач
  function phaseFromTime(ev: CalEvent): 'Inbox' | 'Doing' | 'Done' | 'Wait' {
    const now = Date.now();
    const s = (ev.start as Date).getTime();
    const e = (ev.end as Date).getTime();
    if (now < s) return 'Wait';
    if (now >= s && now <= e) return 'Doing';
    return 'Done';
  }

  function styleForPhase(ph: 'Inbox' | 'Doing' | 'Done' | 'Wait' | 'Cancel' | 'Approval') {
    switch (ph) {
      case 'Inbox':
        return { bg: 'linear-gradient(135deg, #f5f7fb, #eef2f7)', brd: '#d8dee9', fg: '#0f172a' };
      case 'Doing':
        return { bg: 'linear-gradient(135deg, #d4e4f7, #a8c5e8)', brd: '#8fadd4', fg: '#0f172a' };
      case 'Done':
        return { bg: 'linear-gradient(135deg, #d4f4dd, #a8e4b8)', brd: '#8dcea0', fg: '#0f172a' };
      case 'Cancel':
        return { bg: 'linear-gradient(135deg, #fdd4d4, #f8a8a8)', brd: '#f08d8d', fg: '#0f172a' };
      case 'Approval':
        return { bg: 'linear-gradient(135deg, #fef4d4, #fce8a8)', brd: '#f5d88d', fg: '#0f172a' };
      case 'Wait':
      default:
        return { bg: 'linear-gradient(135deg, #d4f0fd, #a8dcf5)', brd: '#8dc8e8', fg: '#0f172a' };
    }
  }

  const eventPropGetter = (event: CalEvent) => {
    const raw = String(phases[String(event.id)] || '').toLowerCase();
    const ph = (raw === 'inbox' ? 'Inbox'
      : raw === 'doing' ? 'Doing'
      : raw === 'done' ? 'Done'
      : raw === 'cancel' || raw === 'canceled' || raw === 'cancelled' ? 'Cancel'
      : raw === 'approval' ? 'Approval'
      : raw === 'wait' ? 'Wait'
      : phaseFromTime(event)) as any;
    const { bg, brd, fg } = styleForPhase(ph);
    return {
      style: {
        background: bg,
        color: fg,
        border: `1px solid ${brd}`,
        borderRadius: 8,
        boxShadow: 'inset 0 0 0 9999px rgba(255,255,255,0.06)',
      },
    } as any;
  };

  // Центрирование линии текущего времени (или середины дня) в Day/Week
  const centerSelectedLine = () => {
    try {
      if (view !== 'day' && view !== 'week') return;
      const root = rootRef.current as HTMLElement | null;
      if (!root) return;
      const container = root.querySelector('.rbc-time-content') as HTMLElement | null;
      if (!container) return;
      // Найти текущий индикатор времени, если показывается (только для сегодняшнего дня)
      const indicator = container.querySelector('.rbc-current-time-indicator') as HTMLElement | null;
      const targetTop = (() => {
        if (indicator) {
          const cRect = container.getBoundingClientRect();
          const iRect = indicator.getBoundingClientRect();
          return (iRect.top - cRect.top) + container.scrollTop;
        }
        // иначе центрируем середину скролла (около 12:00)
        return (container.scrollHeight - container.clientHeight) / 2;
      })();
      const next = Math.max(0, targetTop - container.clientHeight / 2);
      container.scrollTo({ top: next, behavior: 'smooth' });
    } catch {}
  };

  // Центрировать при изменении вида/даты/событий
  useEffect(() => {
    const t = setTimeout(centerSelectedLine, 50);
    return () => clearTimeout(t);
  }, [view, date, events.length]);

  
  
  return (
    <div ref={rootRef} style={{ height: 600 }}>
      {/* Хедер: Все | <группа>  🔎 — как в ленте */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
          paddingTop: 2,
          paddingBottom: 4,
          background: 'linear-gradient(180deg, rgba(11,14,22,0.98) 0%, rgba(11,14,22,0.85) 70%, rgba(11,14,22,0.0) 100%)',
          backdropFilter: 'blur(2px)'
        }}
      >
        <button
          onClick={() => { setLocalGroupId(undefined); }}
          style={{ background: 'transparent', border: 'none', color: '#c7d2fe', cursor: 'pointer', fontSize: 14 }}
          title="Показать все события"
        >
          Все
        </button>
        <span style={{ opacity: 0.35 }}>|</span>
        <button
          onClick={() => setGroupPickerOpen(true)}
          style={{ background: 'transparent', border: 'none', color: '#c7d2fe', cursor: 'pointer', fontSize: 14 }}
          title="Текущая группа / выбрать группу"
        >
          {currentGroupTitle || 'Выбрать группу'}
        </button>
        <div style={{ marginLeft: 'auto' }} />
        {/* Ранг рядом с 🔎 */}
        <RankBadgeButton items={[]} meChatId={String(chatId)} />
        <button
          onClick={() => { /* no-op search in calendar for now */ }}
          style={{ background: 'transparent', border: 'none', color: '#c7d2fe', cursor: 'pointer', fontSize: 18 }}
          title="Поиск"
        >
          🔎
        </button>
      </div>
<Calendar
  localizer={localizer}
  selectable
  events={mapped}
  messages={messages}
  formats={formats as any}
  onSelectSlot={handleSelect}
  onSelectEvent={onSelectEvent}
  eventPropGetter={eventPropGetter}

  // ✅ порядок кнопок и доступные виды
  views={['day', 'week', 'month', 'agenda']}
  // ✅ управляемый вид + по умолчанию "day"
  view={view}
  onView={(v) => setView(v)}
  defaultView="day"
  date={date}
  onNavigate={(d) => setDate(d)}
/>

      {/* 📁 фильтр по группе */}
      <button
        onClick={() => setGroupPickerOpen(true)}
        aria-label="Фильтр по группе"
        style={{
          position: 'fixed',
          right: 16,
          bottom: `calc(152px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 1200,
          width: 56,
          height: 56,
          borderRadius: 28,
          border: 'none',
          background: '#ffffff',
          boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
          fontSize: 28,
          lineHeight: '56px',
          textAlign: 'center',
          cursor: 'pointer',
        }}
      >
        📁
      </button>

      <GroupFilterModal
        isOpen={groupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        chatId={chatId}
        initialGroupId={localGroupId}
        onApply={(gid) => {
          setGroupPickerOpen(false);
          setLocalGroupId(gid || undefined);
        }}
      />

      <EventCreateModal
        open={modalOpen}
        chatId={chatId}
        initialStart={range?.start || new Date()}
        initialEnd={range?.end || new Date(Date.now() + 60 * 60 * 1000)}
        defaultGroupId={(localGroupId !== undefined ? localGroupId : (groupId || undefined))}
        onClose={() => setModalOpen(false)}
        onCreated={async (eventId) => {
          await reload();
          onOpenTask(eventId);
        }}
      />
    </div>
  );
}
