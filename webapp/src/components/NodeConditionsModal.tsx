// src/components/NodeConditionsModal.tsx
import { useEffect, useState } from 'react';

export type StartCondition =
  | 'AFTER_ANY'
  | { mode: 'AFTER_SELECTED'; selectedEdges: string[] }
  | { mode: 'ON_DATE'; date: string }
  | { mode: 'ON_DATE_AND_AFTER_SELECTED'; date: string; selectedEdges: string[] }
  | { mode: 'AFTER_MINUTES_AND_AFTER_SELECTED'; minutes: number; selectedEdges: string[] }
  | { mode: 'AFTER_SELECTED_CANCELLED'; selectedEdges: string[] }; // 🆕 старт, если одна из выбранных — ОТМЕНА

export type CancelCondition =
  | 'NONE'
  | { mode: 'CANCEL_IF_ANY_SELECTED_CANCELLED'; selectedEdges: string[] };

type EdgeOption = { id: string; label: string };

type Props = {
  open: boolean;
  initialStart?: StartCondition;
  initialCancel?: CancelCondition;
  /** входящие рёбра текущего узла (id ребра + подпись = имя исходной ноды) */
  prevEdges: EdgeOption[];
  onSave: (payload: { start: StartCondition; cancel: CancelCondition }) => void;
  onClose: () => void;
  onDelete: () => void;
};

function ensureDateLocalValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function NodeConditionsModal({
  open,
  initialStart,
  initialCancel,
  prevEdges,
  onSave,
  onClose,
  onDelete,
}: Props) {
  const [startMode, setStartMode] = useState<
    'AFTER_ANY' | 'AFTER_SELECTED' | 'ON_DATE' | 'ON_DATE_AND_AFTER_SELECTED' | 'AFTER_MINUTES_AND_AFTER_SELECTED' | 'AFTER_SELECTED_CANCELLED'
  >('AFTER_ANY');

  const [startSelected, setStartSelected] = useState<string[]>([]);
  const [startDateLocal, setStartDateLocal] = useState<string>(''); // datetime-local
  const [startMinutes, setStartMinutes] = useState<number>(10);

  const [cancelMode, setCancelMode] = useState<'NONE' | 'CANCEL_IF_ANY_SELECTED_CANCELLED'>('NONE');
  const [cancelSelected, setCancelSelected] = useState<string[]>([]);

  // инициализация из initial*
  useEffect(() => {
    // start
    if (initialStart === 'AFTER_ANY' || !initialStart) {
      setStartMode('AFTER_ANY');
      setStartSelected([]);
      setStartDateLocal('');
      setStartMinutes(10);
    } else if (typeof initialStart === 'object') {
      switch (initialStart.mode) {
        case 'AFTER_SELECTED':
          setStartMode('AFTER_SELECTED');
          setStartSelected([...new Set(initialStart.selectedEdges || [])]);
          setStartDateLocal('');
          setStartMinutes(10);
          break;
        case 'ON_DATE':
          setStartMode('ON_DATE');
          setStartSelected([]);
          setStartDateLocal(ensureDateLocalValue(initialStart.date));
          setStartMinutes(10);
          break;
        case 'ON_DATE_AND_AFTER_SELECTED':
          setStartMode('ON_DATE_AND_AFTER_SELECTED');
          setStartSelected([...new Set(initialStart.selectedEdges || [])]);
          setStartDateLocal(ensureDateLocalValue(initialStart.date));
          setStartMinutes(10);
          break;
        case 'AFTER_MINUTES_AND_AFTER_SELECTED':
          setStartMode('AFTER_MINUTES_AND_AFTER_SELECTED');
          setStartSelected([...new Set(initialStart.selectedEdges || [])]);
          setStartDateLocal('');
          setStartMinutes(
            Number.isFinite(initialStart.minutes) && initialStart.minutes! > 0 ? Number(initialStart.minutes) : 10
          );
          break;
        case 'AFTER_SELECTED_CANCELLED':
          setStartMode('AFTER_SELECTED_CANCELLED');
          setStartSelected([...new Set(initialStart.selectedEdges || [])]);
          setStartDateLocal('');
          setStartMinutes(10);
          break;
      }
    }

    // cancel
    if (initialCancel === 'NONE' || !initialCancel) {
      setCancelMode('NONE');
      setCancelSelected([]);
    } else if (typeof initialCancel === 'object' && initialCancel.mode === 'CANCEL_IF_ANY_SELECTED_CANCELLED') {
      setCancelMode('CANCEL_IF_ANY_SELECTED_CANCELLED');
      setCancelSelected([...new Set(initialCancel.selectedEdges || [])]);
    }
  }, [initialStart, initialCancel, open]);

  const toggleArr = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  if (!open) return null;

  return (
    <div style={scrimStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚙️</span>
            <b style={{ fontSize: 16 }}>Условия узла</b>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={iconBtn} onClick={onDelete} title="Удалить узел">🗑️</button>
            <button style={iconBtn} onClick={onClose} title="Закрыть">✖️</button>
          </div>
        </div>

        {/* content */}
        <div style={contentStyle}>
          {/* START */}
          <section style={sectionStyle}>
            <div style={titleRow}>
              <span style={titleDot('start')}></span>
              <div style={titleText}>Старт</div>
            </div>

            <div style={optionGrid}>
              <label style={pill(startMode === 'AFTER_ANY')} title="После завершения любой связанной">
                <input
                  type="radio"
                  name="start-mode"
                  value="AFTER_ANY"
                  checked={startMode === 'AFTER_ANY'}
                  onChange={() => setStartMode('AFTER_ANY')}
                  style={radioHidden}
                />
                <span>➡️ После любой связанной</span>
              </label>

              <label style={pill(startMode === 'AFTER_SELECTED')} title="Старт после выбранных связей">
                <input
                  type="radio"
                  name="start-mode"
                  value="AFTER_SELECTED"
                  checked={startMode === 'AFTER_SELECTED'}
                  onChange={() => setStartMode('AFTER_SELECTED')}
                  style={radioHidden}
                />
                <span>➡️ После выбранных</span>
              </label>

              <label style={pill(startMode === 'ON_DATE')} title="Запуск в дату/время">
                <input
                  type="radio"
                  name="start-mode"
                  value="ON_DATE"
                  checked={startMode === 'ON_DATE'}
                  onChange={() => setStartMode('ON_DATE')}
                  style={radioHidden}
                />
                <span>📅 В дату</span>
              </label>

              <label style={pill(startMode === 'ON_DATE_AND_AFTER_SELECTED')} title="Дата + выбранные связи">
                <input
                  type="radio"
                  name="start-mode"
                  value="ON_DATE_AND_AFTER_SELECTED"
                  checked={startMode === 'ON_DATE_AND_AFTER_SELECTED'}
                  onChange={() => setStartMode('ON_DATE_AND_AFTER_SELECTED')}
                  style={radioHidden}
                />
                <span>📅 + выбранные</span>
              </label>

              <label style={pill(startMode === 'AFTER_MINUTES_AND_AFTER_SELECTED')} title="Через X минут + выбранные">
                <input
                  type="radio"
                  name="start-mode"
                  value="AFTER_MINUTES_AND_AFTER_SELECTED"
                  checked={startMode === 'AFTER_MINUTES_AND_AFTER_SELECTED'}
                  onChange={() => setStartMode('AFTER_MINUTES_AND_AFTER_SELECTED')}
                  style={radioHidden}
                />
                <span>⏰ Через X минут + выбранные</span>
              </label>

              <label style={pill(startMode === 'AFTER_SELECTED_CANCELLED')} title="Старт если одна из выбранных отменена">
                <input
                  type="radio"
                  name="start-mode"
                  value="AFTER_SELECTED_CANCELLED"
                  checked={startMode === 'AFTER_SELECTED_CANCELLED'}
                  onChange={() => setStartMode('AFTER_SELECTED_CANCELLED')}
                  style={radioHidden}
                />
                <span>🚫➡️ После выбранных (если одна отменена)</span>
              </label>
            </div>

            {/* параметры по выбранному режиму */}
            {startMode === 'AFTER_SELECTED' && (
              <div style={card}>
                <div style={cardTitle}>Выберите связи</div>
                {prevEdges.length === 0 && <div style={muted}>Нет входящих связей</div>}
                {prevEdges.map((e) => (
                  <label key={e.id} style={checkItem}>
                    <input
                      type="checkbox"
                      checked={startSelected.includes(e.id)}
                      onChange={() => setStartSelected((a) => toggleArr(a, e.id))}
                    />
                    <span style={checkLabel}>{e.label}</span>
                  </label>
                ))}
              </div>
            )}

            {startMode === 'ON_DATE' && (
              <div style={card}>
                <div style={cardTitle}>Дата/время</div>
                <input
                  type="datetime-local"
                  value={startDateLocal}
                  onChange={(e) => setStartDateLocal(e.target.value)}
                  style={input}
                />
              </div>
            )}

            {startMode === 'ON_DATE_AND_AFTER_SELECTED' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={card}>
                  <div style={cardTitle}>Дата/время</div>
                  <input
                    type="datetime-local"
                    value={startDateLocal}
                    onChange={(e) => setStartDateLocal(e.target.value)}
                    style={input}
                  />
                </div>
                <div style={card}>
                  <div style={cardTitle}>Выберите связи</div>
                  {prevEdges.length === 0 && <div style={muted}>Нет входящих связей</div>}
                  {prevEdges.map((e) => (
                    <label key={e.id} style={checkItem}>
                      <input
                        type="checkbox"
                        checked={startSelected.includes(e.id)}
                        onChange={() => setStartSelected((a) => toggleArr(a, e.id))}
                      />
                      <span style={checkLabel}>{e.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {startMode === 'AFTER_MINUTES_AND_AFTER_SELECTED' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={card}>
                  <div style={cardTitle}>Минуты</div>
                  <input
                    type="number"
                    min={1}
                    value={startMinutes}
                    onChange={(e) => setStartMinutes(Math.max(1, Number(e.target.value || 1)))}
                    style={{ ...input, width: 120 }}
                  />
                </div>
                <div style={card}>
                  <div style={cardTitle}>Выберите связи</div>
                  {prevEdges.length === 0 && <div style={muted}>Нет входящих связей</div>}
                  {prevEdges.map((e) => (
                    <label key={e.id} style={checkItem}>
                      <input
                        type="checkbox"
                        checked={startSelected.includes(e.id)}
                        onChange={() => setStartSelected((a) => toggleArr(a, e.id))}
                      />
                      <span style={checkLabel}>{e.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {startMode === 'AFTER_SELECTED_CANCELLED' && (
              <div style={card}>
                <div style={cardTitle}>Выберите связи (старт, если одна из них будет отменена)</div>
                {prevEdges.length === 0 && <div style={muted}>Нет входящих связей</div>}
                {prevEdges.map((e) => (
                  <label key={e.id} style={checkItem}>
                    <input
                      type="checkbox"
                      checked={startSelected.includes(e.id)}
                      onChange={() => setStartSelected((a) => toggleArr(a, e.id))}
                    />
                    <span style={checkLabel}>{e.label}</span>
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* CANCEL */}
          <section style={sectionStyle}>
            <div style={titleRow}>
              <span style={titleDot('cancel')}></span>
              <div style={titleText}>Отмена</div>
            </div>

            <div style={optionGrid}>
              <label style={pill(cancelMode === 'NONE')}>
                <input
                  type="radio"
                  name="cancel-mode"
                  value="NONE"
                  checked={cancelMode === 'NONE'}
                  onChange={() => setCancelMode('NONE')}
                  style={radioHidden}
                />
                <span>— Не отменять</span>
              </label>

              <label style={pill(cancelMode === 'CANCEL_IF_ANY_SELECTED_CANCELLED')}>
                <input
                  type="radio"
                  name="cancel-mode"
                  value="CANCEL_IF_ANY_SELECTED_CANCELLED"
                  checked={cancelMode === 'CANCEL_IF_ANY_SELECTED_CANCELLED'}
                  onChange={() => setCancelMode('CANCEL_IF_ANY_SELECTED_CANCELLED')}
                  style={radioHidden}
                />
                <span>🚫 Отменить, если одна из выбранных отменена</span>
              </label>
            </div>

            {cancelMode === 'CANCEL_IF_ANY_SELECTED_CANCELLED' && (
              <div style={card}>
                <div style={cardTitle}>Выберите связи</div>
                {prevEdges.length === 0 && <div style={muted}>Нет входящих связей</div>}
                {prevEdges.map((e) => (
                  <label key={e.id} style={checkItem}>
                    <input
                      type="checkbox"
                      checked={cancelSelected.includes(e.id)}
                      onChange={() => setCancelSelected((a) => toggleArr(a, e.id))}
                    />
                    <span style={checkLabel}>{e.label}</span>
                  </label>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* actions */}
        <div style={actionsStyle}>
          <button
            style={primaryBtn}
            onClick={() => {
              const toIso = (local: string) => (local ? new Date(local).toISOString() : '');
              // START
              let startOut: StartCondition = 'AFTER_ANY';
              if (startMode === 'AFTER_ANY') {
                startOut = 'AFTER_ANY';
              } else if (startMode === 'AFTER_SELECTED') {
                startOut = { mode: 'AFTER_SELECTED', selectedEdges: startSelected };
              } else if (startMode === 'ON_DATE') {
                startOut = { mode: 'ON_DATE', date: toIso(startDateLocal) };
              } else if (startMode === 'ON_DATE_AND_AFTER_SELECTED') {
                startOut = {
                  mode: 'ON_DATE_AND_AFTER_SELECTED',
                  date: toIso(startDateLocal),
                  selectedEdges: startSelected,
                };
              } else if (startMode === 'AFTER_MINUTES_AND_AFTER_SELECTED') {
                startOut = { mode: 'AFTER_MINUTES_AND_AFTER_SELECTED', minutes: startMinutes, selectedEdges: startSelected };
              } else if (startMode === 'AFTER_SELECTED_CANCELLED') {
                startOut = { mode: 'AFTER_SELECTED_CANCELLED', selectedEdges: startSelected };
              }

              // CANCEL
              let cancelOut: CancelCondition = 'NONE';
              if (cancelMode === 'CANCEL_IF_ANY_SELECTED_CANCELLED') {
                cancelOut = { mode: 'CANCEL_IF_ANY_SELECTED_CANCELLED', selectedEdges: cancelSelected };
              }

              onSave({ start: startOut, cancel: cancelOut });
            }}
          >
            Сохранить
          </button>
          <button style={ghostBtn} onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

/* ===== Styles (inline) ===== */

const scrimStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.42)',
  backdropFilter: 'blur(2px)',
  display: 'grid',
  placeItems: 'center',
  padding: 16,
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: 'min(720px, 100%)',
  maxHeight: 'min(90vh, 100%)',
  background: '#fff',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 24px 60px rgba(0,0,0,.22)',
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
};

const headerStyle: React.CSSProperties = {
  background:
    'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(16,185,129,0.12) 100%)',
  padding: '12px 14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid #e5e7eb',
};

const iconBtn: React.CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#fff',
  borderRadius: 10,
  padding: '6px 8px',
  cursor: 'pointer',
};

const contentStyle: React.CSSProperties = {
  padding: 14,
  overflow: 'auto',
  display: 'grid',
  gap: 14,
};

const sectionStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 12,
};

const titleRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const titleDot = (kind: 'start' | 'cancel'): React.CSSProperties => ({
  width: 10,
  height: 10,
  borderRadius: 999,
  background: kind === 'start' ? '#22c55e' : '#ef4444',
});

const titleText: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 13,
  color: '#0f172a',
  letterSpacing: 0.2,
};

const optionGrid: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
};

const pill = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 999,
  border: `1px solid ${active ? '#22c55e' : '#e5e7eb'}`,
  background: active ? 'rgba(34,197,94,0.08)' : '#fff',
  cursor: 'pointer',
  userSelect: 'none',
  fontSize: 13,
  fontWeight: 600,
  transition: 'all .15s ease',
});

const radioHidden: React.CSSProperties = { position: 'absolute', opacity: 0, pointerEvents: 'none' };

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 10,
  background: '#fafafa',
};

const cardTitle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 12,
  marginBottom: 8,
  color: '#111827',
};

const muted: React.CSSProperties = { fontSize: 12, color: '#6b7280' };

const checkItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
};

const checkLabel: React.CSSProperties = { fontSize: 13 };

const input: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d1d5db',
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 14,
  outline: 'none',
};

const actionsStyle: React.CSSProperties = {
  padding: 12,
  borderTop: '1px solid #e5e7eb',
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  background: '#fff',
};

const primaryBtn: React.CSSProperties = {
  background: '#16a34a',
  color: '#fff',
  border: '1px solid #16a34a',
  borderRadius: 12,
  padding: '10px 14px',
  fontWeight: 800,
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  background: '#fff',
  color: '#111827',
  border: '1px solid #d1d5db',
  borderRadius: 12,
  padding: '10px 14px',
  fontWeight: 700,
  cursor: 'pointer',
};
