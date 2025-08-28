// src/CalendarView.tsx
import { useEffect, useMemo, useState } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import type { SlotInfo, Event as RBCEvent } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/ru';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { listEvents, type EventItem } from './api';
import EventCreateModal from './components/EventCreateModal';

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
  const [modalOpen, setModalOpen] = useState(false);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);

  const messages = useMemo(() => ({
    date: 'Дата', time: 'Время', event: 'Событие', allDay: 'Весь день',
    week: 'Неделя', work_week: 'Рабочая неделя', day: 'День', month: 'Месяц',
    previous: 'Назад', next: 'Вперёд', today: 'Сегодня', agenda: 'Повестка',
    noEventsInRange: 'Нет событий в этот период',
    showMore: (t: number) => `+ ещё ${t}`,
  }), []);

  const formats = useMemo(() => ({
    timeGutterFormat: 'HH:mm',
    eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }, _c: unknown, l: any) =>
      `${l.format(start, 'HH:mm')} – ${l.format(end, 'HH:mm')}`,
    agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }, _c: unknown, l: any) =>
      `${l.format(start, 'HH:mm')} – ${l.format(end, 'HH:mm')}`,
    dayHeaderFormat: 'dddd, D MMMM YYYY',
    dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }, _c: unknown, l: any) =>
      `${l.format(start, 'D MMM')} – ${l.format(end, 'D MMM YYYY')}`,
    agendaHeaderFormat: ({ start, end }: { start: Date; end: Date }, _c: unknown, l: any) =>
      `${l.format(start, 'D MMM YYYY')} – ${l.format(end, 'D MMM YYYY')}`,
  }), []);

  const reload = async () => {
    const r = await listEvents(chatId, groupId || undefined);
    if (!r.ok) return;
    setEvents(r.events);
  };

  useEffect(() => { reload(); }, [chatId, groupId]);

  const handleSelect = ({ start, end }: SlotInfo) => {
    setRange({ start: start as Date, end: end as Date });
    setModalOpen(true);
  };

  const onSelectEvent = (e: any) => onOpenTask(String(e.id));

  const mapped: CalEvent[] = events.map((e) => ({
    id: e.id,
    title: e.text || 'Событие',
    start: new Date(e.startAt),
    end: new Date(e.endAt || e.startAt),
    allDay: false,
  }));

  return (
    <div style={{ height: 600 }}>
      <Calendar
        localizer={localizer}
        selectable
        events={mapped}
        messages={messages}
        formats={formats as any}
        onSelectSlot={handleSelect}
        onSelectEvent={onSelectEvent}
      />

      <EventCreateModal
        open={modalOpen}
        chatId={chatId}
        initialStart={range?.start || new Date()}
        initialEnd={range?.end || new Date(Date.now() + 60 * 60 * 1000)}
        defaultGroupId={groupId || undefined}
        onClose={() => setModalOpen(false)}
        onCreated={async (eventId) => {
          await reload();
          onOpenTask(eventId);
        }}
      />
    </div>
  );
}
