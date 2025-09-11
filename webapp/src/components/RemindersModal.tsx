import { useEffect, useMemo, useState } from 'react';

export type ReminderTarget = 'ME' | 'RESPONSIBLE' | 'ALL';

export default function RemindersModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (p: { target: ReminderTarget; fireAtIso: string }) => void;
}) {
  const [target, setTarget] = useState<ReminderTarget>('ME');
  const [local, setLocal] = useState<string>(''); // yyyy-MM-ddTHH:mm
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget('ME');
    setLocal('');
    setError(null);
  }, [open]);

  const minAttr = useMemo(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#1b2030', color: '#e8eaed', border: '1px solid #2a3346', borderRadius: 12, padding: 12, width: 'min(460px, 92vw)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>⏰ Напоминание</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="radio" name="r_target" checked={target==='ME'} onChange={() => setTarget('ME')} /> Себе
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="radio" name="r_target" checked={target==='RESPONSIBLE'} onChange={() => setTarget('RESPONSIBLE')} /> Ответственному
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="radio" name="r_target" checked={target==='ALL'} onChange={() => setTarget('ALL')} /> Всем
            </label>
          </div>

          <div>
            <input
              type="datetime-local"
              value={local}
              min={minAttr}
              onChange={(e) => setLocal(e.target.value)}
              style={{ background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 10, padding: '8px 10px', width: '100%' }}
            />
            {error ? <div style={{ color: 'salmon', fontSize: 12, marginTop: 6 }}>{error}</div> : null}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>Отмена</button>
            <button
              onClick={() => {
                setError(null);
                if (!local) { setError('Выберите дату и время'); return; }
                const d = new Date(local);
                if (Number.isNaN(d.getTime())) { setError('Неверная дата/время'); return; }
                if (d.getTime() <= Date.now()) { setError('Нельзя в прошлое'); return; }
                onPick({ target, fireAtIso: d.toISOString() });
              }}
              style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid transparent', background: '#2563eb', color: '#fff' }}
            >
              Создать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

