import { useEffect, useMemo, useState } from 'react';

export type RecurringConfig = {
  pattern: 'daily' | 'monthly';
  time: string; // "13:00"
  excludeDays?: number[]; // [0,6] для воскресенья и субботы
  excludeDates?: string[]; // ['2025-01-01', '2025-05-09']
  monthDay?: number; // число месяца (1-31)
  weekOfMonth?: number; // номер недели в месяце (1-5)
  dayOfWeek?: number; // день недели (0=вс, 1=пн, ..., 6=сб)
  count?: number | null; // количество повторений (null = всегда)
};

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export default function RecurringScheduleModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (cfg: RecurringConfig) => void;
}) {
  const [pattern, setPattern] = useState<'daily' | 'monthly'>('daily');
  const [time, setTime] = useState('13:00');
  const [excludeDays, setExcludeDays] = useState<number[]>([]);
  const [excludeDatesInput, setExcludeDatesInput] = useState('');
  const [monthDay, setMonthDay] = useState<number>(1);
  const [weekOfMonth, setWeekOfMonth] = useState<number>(1);
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [monthMode, setMonthMode] = useState<'day' | 'week'>('day');
  const [count, setCount] = useState<string>(''); // пусто = всегда
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPattern('daily');
    setTime('13:00');
    setExcludeDays([]);
    setExcludeDatesInput('');
    setMonthDay(1);
    setWeekOfMonth(1);
    setDayOfWeek(1);
    setMonthMode('day');
    setCount('');
    setErr(null);
  }, [open]);

  const canSave = useMemo(() => {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) return false;
    if (pattern === 'monthly') {
      if (monthMode === 'day' && (monthDay < 1 || monthDay > 31)) return false;
      if (monthMode === 'week' && (weekOfMonth < 1 || weekOfMonth > 5)) return false;
    }
    return true;
  }, [time, pattern, monthMode, monthDay, weekOfMonth]);

  const save = () => {
    setErr(null);
    if (!canSave) {
      setErr('Заполните все поля корректно');
      return;
    }

    const excludeDatesArray = excludeDatesInput
      .split(',')
      .map(d => d.trim())
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

    const cfg: RecurringConfig = {
      pattern,
      time,
      excludeDays: excludeDays.length > 0 ? excludeDays : undefined,
      excludeDates: excludeDatesArray.length > 0 ? excludeDatesArray : undefined,
      count: count.trim() === '' ? null : Math.max(1, parseInt(count, 10)),
    };

    if (pattern === 'monthly') {
      if (monthMode === 'day') {
        cfg.monthDay = monthDay;
      } else {
        cfg.weekOfMonth = weekOfMonth;
        cfg.dayOfWeek = dayOfWeek;
      }
    }

    onApply(cfg);
  };

  const toggleExcludeDay = (day: number) => {
    setExcludeDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        zIndex: 2250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0b1220',
          color: '#e5e7eb',
          border: '1px solid #1f2937',
          borderRadius: 12,
          padding: 16,
          width: 'min(520px, 92vw)',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 16 }}>
          🔂 Повторяющиеся задачи
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {/* Паттерн: каждый день / каждый месяц */}
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Период</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPattern('daily')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #1f2937',
                  background: pattern === 'daily' ? '#2563eb' : '#0f172a',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                }}
              >
                Каждый день
              </button>
              <button
                onClick={() => setPattern('monthly')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #1f2937',
                  background: pattern === 'monthly' ? '#2563eb' : '#0f172a',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                }}
              >
                Каждый месяц
              </button>
            </div>
          </div>

          {/* Время */}
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
              Время (ЧЧ:ММ)
            </div>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              style={{
                width: '100%',
                background: '#0b1220',
                color: '#e5e7eb',
                border: '1px solid #1f2937',
                borderRadius: 8,
                padding: '8px 10px',
              }}
            />
          </div>

          {/* Исключения по дням недели (только для daily) */}
          {pattern === 'daily' && (
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                Кроме дней недели
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {WEEKDAYS.map((name, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleExcludeDay(idx)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid #1f2937',
                      background: excludeDays.includes(idx) ? '#dc2626' : '#0f172a',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Исключения по конкретным датам */}
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
              Кроме дат (ГГГГ-ММ-ДД, через запятую)
            </div>
            <input
              type="text"
              value={excludeDatesInput}
              onChange={e => setExcludeDatesInput(e.target.value)}
              placeholder="2025-01-01, 2025-05-09"
              style={{
                width: '100%',
                background: '#0b1220',
                color: '#e5e7eb',
                border: '1px solid #1f2937',
                borderRadius: 8,
                padding: '8px 10px',
              }}
            />
          </div>

          {/* Для monthly: выбор числа или недели+день */}
          {pattern === 'monthly' && (
            <>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                  Режим
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setMonthMode('day')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #1f2937',
                      background: monthMode === 'day' ? '#2563eb' : '#0f172a',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                    }}
                  >
                    По числу месяца
                  </button>
                  <button
                    onClick={() => setMonthMode('week')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #1f2937',
                      background: monthMode === 'week' ? '#2563eb' : '#0f172a',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                    }}
                  >
                    По неделе месяца
                  </button>
                </div>
              </div>

              {monthMode === 'day' && (
                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                    Число месяца (1-31)
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={monthDay}
                    onChange={e =>
                      setMonthDay(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))
                    }
                    style={{
                      width: '100%',
                      background: '#0b1220',
                      color: '#e5e7eb',
                      border: '1px solid #1f2937',
                      borderRadius: 8,
                      padding: '8px 10px',
                    }}
                  />
                </div>
              )}

              {monthMode === 'week' && (
                <>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                      Номер недели в месяце (1-5)
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={weekOfMonth}
                      onChange={e =>
                        setWeekOfMonth(
                          Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 1))
                        )
                      }
                      style={{
                        width: '100%',
                        background: '#0b1220',
                        color: '#e5e7eb',
                        border: '1px solid #1f2937',
                        borderRadius: 8,
                        padding: '8px 10px',
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                      День недели
                    </div>
                    <select
                      value={dayOfWeek}
                      onChange={e => setDayOfWeek(parseInt(e.target.value, 10))}
                      style={{
                        width: '100%',
                        background: '#0b1220',
                        color: '#e5e7eb',
                        border: '1px solid #1f2937',
                        borderRadius: 8,
                        padding: '8px 10px',
                      }}
                    >
                      {WEEKDAYS.map((name, idx) => (
                        <option key={idx} value={idx}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </>
          )}

          {/* Число повторений */}
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
              Число повторений (пусто = всегда)
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={count}
              onChange={e =>
                setCount(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))
              }
              placeholder="Всегда"
              style={{
                width: '100%',
                background: '#0b1220',
                color: '#e5e7eb',
                border: '1px solid #1f2937',
                borderRadius: 8,
                padding: '8px 10px',
              }}
            />
          </div>

          {err && <div style={{ color: '#fca5a5', fontSize: 12 }}>{err}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #2a3346',
              background: '#202840',
              color: '#e8eaed',
            }}
          >
            Отмена
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid transparent',
              background: canSave ? '#2563eb' : '#2a3350',
              color: '#fff',
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
