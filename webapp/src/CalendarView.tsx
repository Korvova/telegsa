// src/CalendarView.tsx
import { useState } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import type { SlotInfo } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/ru'; // локаль (TS знает о модуле через декларацию)
import 'react-big-calendar/lib/css/react-big-calendar.css';

moment.locale('ru');
const localizer = momentLocalizer(moment);

type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: any;
};

export default function CalendarView() {
  const [events, setEvents] = useState<CalEvent[]>([
    {
      id: crypto.randomUUID(),
      title: 'Пример события',
      start: new Date(),
      end: new Date(Date.now() + 60 * 60 * 1000),
    },
  ]);

  const handleSelect = ({ start, end }: SlotInfo) => {
    const title = window.prompt('Название события?');
    if (!title) return;
    setEvents((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title, start: start as Date, end: end as Date },
    ]);
  };

  const messages = {
    date: 'Дата',
    time: 'Время',
    event: 'Событие',
    allDay: 'Весь день',
    week: 'Неделя',
    work_week: 'Рабочая неделя',
    day: 'День',
    month: 'Месяц',
    previous: 'Назад',
    next: 'Вперёд',
    today: 'Сегодня',
    agenda: 'Повестка',
    noEventsInRange: 'Нет событий в этот период',
    showMore: (total: number) => `+ ещё ${total}`,
  } as const;

  // 24-часовой формат + русские заголовки
  const formats = {
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
  } as const;

  return (
    <div style={{ background: '#1b2030', borderRadius: 12, padding: 12 }}>
      <Calendar<CalEvent>
        localizer={localizer}
        culture="ru"
        messages={messages}
        formats={formats}
        events={events}
        startAccessor="start"
        endAccessor="end"
        selectable
        onSelectSlot={handleSelect}
        style={{ height: '70vh', color: '#000', background: '#fff', borderRadius: 12 }}
      />
    </div>
  );
}
