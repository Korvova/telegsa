import { useEffect, useMemo, useState } from 'react';

type Props = {
  open: boolean;
  value: string | null; // ISO string or null
  onChange: (next: string | null) => void;
  onClose: () => void;
  minNow?: boolean; // default true
  title?: string;
};

function toLocalInputValue(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return '';
  }
}

function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function DeadlinePicker({ open, value, onChange, onClose, minNow = true, title = 'Дедлайн' }: Props) {
  const [local, setLocal] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLocal(value ? toLocalInputValue(value) : '');
  }, [open, value]);

  const minAttr = useMemo(() => {
    if (!minNow) return undefined;
    const d = new Date();
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [minNow]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#1b2030', color: '#e8eaed', border: '1px solid #2a3346', borderRadius: 12, padding: 12, width: 'min(460px, 92vw)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>🚩 {title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <input
            type="datetime-local"
            value={local}
            min={minAttr}
            onChange={(e) => setLocal(e.target.value)}
            style={{ background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 10, padding: '8px 10px' }}
          />
          {error ? <div style={{ color: 'salmon', fontSize: 12 }}>{error}</div> : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
          <button
            onClick={() => { onChange(null); onClose(); }}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
          >
            Без дедлайна
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>Отмена</button>
            <button
              onClick={() => {
                const iso = fromLocalInputValue(local);
                if (!iso) { setError('Неверная дата/время'); return; }
                const now = Date.now();
                const dt = new Date(iso).getTime();
                if (dt <= now) { setError('Нельзя в прошлое'); return; }
                onChange(iso);
                onClose();
              }}
              style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid transparent', background: '#2563eb', color: '#fff' }}
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

