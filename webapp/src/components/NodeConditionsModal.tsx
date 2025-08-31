// src/components/NodeConditionsModal.tsx
import { useEffect, useState } from 'react';

export type StartCondition =
  | 'AFTER_ANY'
  | { mode: 'AFTER_SELECTED'; selectedEdges: string[] }
  | { mode: 'ON_DATE'; date: string }
  | { mode: 'ON_DATE_AND_AFTER_SELECTED'; date: string; selectedEdges: string[] }
  | { mode: 'AFTER_MINUTES_AND_AFTER_SELECTED'; minutes: number; selectedEdges: string[] };

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
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
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
    'AFTER_ANY' | 'AFTER_SELECTED' | 'ON_DATE' | 'ON_DATE_AND_AFTER_SELECTED' | 'AFTER_MINUTES_AND_AFTER_SELECTED'
  >('AFTER_ANY');

  const [startSelected, setStartSelected] = useState<string[]>([]);
  const [startDateLocal, setStartDateLocal] = useState<string>('');
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

  // ESC = закрыть
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);



  if (!open) return null;

  // ===== стили (инлайн, без зависимостей) =====
  const sx = {
    scrim: {
      position: 'fixed' as const,
      inset: 0,
      zIndex: 9999,
      background: 'rgba(2, 6, 23, .55)',
      backdropFilter: 'blur(2px)',
      padding: '16px',
      display: 'grid',
      placeItems: 'center',
    },
    panel: {
      width: 'min(720px, 100%)',
      maxHeight: 'min(90vh, 900px)',
      borderRadius: 16,
      background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
      border: '1px solid #e5e7eb',
      boxShadow: '0 20px 60px rgba(15, 23, 42, .25)',
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: '14px 16px',
      borderBottom: '1px solid #e5e7eb',
      background: 'rgba(255,255,255,.8)',
      backdropFilter: 'blur(6px)',
    },
    title: { fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 },
    iconBtn: {
      border: '1px solid #e5e7eb',
      background: '#fff',
      borderRadius: 10,
      padding: '6px 10px',
      cursor: 'pointer',
    },
    content: {
      padding: 16,
      overflow: 'auto' as const,
      display: 'grid',
      gap: 16,
    },
    section: {
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      padding: 14,
      display: 'grid',
      gap: 12,
    },
    sectionTitle: { fontWeight: 700, fontSize: 14 },
    radioGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 10,
    },
    radioCard: (active: boolean) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 12px',
      borderRadius: 12,
      border: `1.5px solid ${active ? '#22c55e' : '#e5e7eb'}`,
      background: active ? 'linear-gradient(180deg,#f0fdf4,#ffffff)' : '#fff',
      cursor: 'pointer',
      userSelect: 'none' as const,
      transition: 'border-color .12s ease',
    }),
    subblock: {
      display: 'grid',
      gap: 10,
      padding: 12,
      borderRadius: 10,
      background: '#f8fafc',
      border: '1px dashed #dbe3ee',
    },
    chips: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 8,
    },
    chip: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 10px',
      borderRadius: 999,
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      boxShadow: '0 2px 0 rgba(0,0,0,.03)',
    },
    actions: {
      display: 'flex',
      gap: 10,
      justifyContent: 'flex-end',
      padding: 12,
      borderTop: '1px solid #e5e7eb',
      background: '#fff',
    },
    btnPrimary: {
      border: '1px solid #16a34a',
      background: 'linear-gradient(180deg,#22c55e,#16a34a)',
      color: '#fff',
      padding: '10px 14px',
      borderRadius: 12,
      fontWeight: 700,
      cursor: 'pointer',
    },
    btnGhost: {
      border: '1px solid #e5e7eb',
      background: '#fff',
      color: '#0f172a',
      padding: '10px 14px',
      borderRadius: 12,
      cursor: 'pointer',
    },
    input: {
      border: '1px solid #d1d5db',
      background: '#fff',
      borderRadius: 10,
      padding: '8px 10px',
      outline: 'none',
      width: '100%',
    },
    inputInline: { display: 'flex', alignItems: 'center', gap: 8 },
    hint: { fontSize: 12, color: '#64748b' },
  };

  const RadioCard = ({
    value,
    checked,
    children,
    onChange,
  }: {
    value: string;
    checked: boolean;
    children: any;
    onChange: () => void;
  }) => (
    <label style={sx.radioCard(checked)}>
      <input
        type="radio"
        name="start-mode"
        value={value}
        checked={checked}
        onChange={onChange}
        style={{ display: 'none' }}
      />
      <span>{children}</span>
    </label>
  );

  const toIso = (local: string) => (local ? new Date(local).toISOString() : '');

  return (
    <div style={sx.scrim} onClick={onClose}>
      <div style={sx.panel} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div style={sx.header}>
          <div style={sx.title}>⚙️ Условия узла</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={sx.iconBtn} onClick={onDelete} title="Удалить узел">🗑️</button>
            <button style={sx.iconBtn} onClick={onClose} title="Закрыть">✖️</button>
          </div>
        </div>

        {/* content */}
        <div style={sx.content}>
          {/* START */}
          <div style={sx.section}>
            <div style={sx.sectionTitle}>Старт</div>

            <div style={sx.radioGrid}>
              <RadioCard
                value="AFTER_ANY"
                checked={startMode === 'AFTER_ANY'}
                onChange={() => setStartMode('AFTER_ANY')}
              >
                ➡️ После завершения любой связанной <span style={sx.hint}>— зелёный пунктир + анимация</span>
              </RadioCard>

              <RadioCard
                value="AFTER_SELECTED"
                checked={startMode === 'AFTER_SELECTED'}
                onChange={() => setStartMode('AFTER_SELECTED')}
              >
                ➡️ После выбранных связей <span style={sx.hint}>— отметь ниже чекбоксами</span>
              </RadioCard>

              <RadioCard
                value="ON_DATE"
                checked={startMode === 'ON_DATE'}
                onChange={() => setStartMode('ON_DATE')}
              >
                📅 В дату
              </RadioCard>

              <RadioCard
                value="ON_DATE_AND_AFTER_SELECTED"
                checked={startMode === 'ON_DATE_AND_AFTER_SELECTED'}
                onChange={() => setStartMode('ON_DATE_AND_AFTER_SELECTED')}
              >
                📅 В дату + после выбранных связей
              </RadioCard>

              <RadioCard
                value="AFTER_MINUTES_AND_AFTER_SELECTED"
                checked={startMode === 'AFTER_MINUTES_AND_AFTER_SELECTED'}
                onChange={() => setStartMode('AFTER_MINUTES_AND_AFTER_SELECTED')}
              >
                ⏰ Через X минут + после выбранных связей
              </RadioCard>
            </div>

            {/* параметры режимов */}
            {startMode === 'AFTER_SELECTED' && (
              <div style={sx.subblock}>
                <div className="modal-subtitle">Выберите связи</div>
                {prevEdges.length === 0 && <div style={sx.hint}>Нет входящих связей</div>}
                <div style={sx.chips}>
                  {prevEdges.map((e) => (
                    <label key={e.id} style={sx.chip}>
                      <input
                        type="checkbox"
                        checked={startSelected.includes(e.id)}
                        onChange={() =>
                          setStartSelected((a) =>
                            a.includes(e.id) ? a.filter((x) => x !== e.id) : [...a, e.id]
                          )
                        }
                      />
                      <span>{e.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {startMode === 'ON_DATE' && (
              <div style={sx.subblock}>
                <div className="modal-subtitle">Дата/время</div>
                <input
                  type="datetime-local"
                  value={startDateLocal}
                  onChange={(e) => setStartDateLocal(e.target.value)}
                  style={sx.input}
                />
              </div>
            )}

            {startMode === 'ON_DATE_AND_AFTER_SELECTED' && (
              <div style={sx.subblock}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div>Дата/время</div>
                  <input
                    type="datetime-local"
                    value={startDateLocal}
                    onChange={(e) => setStartDateLocal(e.target.value)}
                    style={sx.input}
                  />
                </div>
                <div>
                  <div style={{ marginTop: 8, marginBottom: 6 }}>Выберите связи</div>
                  {prevEdges.length === 0 && <div style={sx.hint}>Нет входящих связей</div>}
                  <div style={sx.chips}>
                    {prevEdges.map((e) => (
                      <label key={e.id} style={sx.chip}>
                        <input
                          type="checkbox"
                          checked={startSelected.includes(e.id)}
                          onChange={() =>
                            setStartSelected((a) =>
                              a.includes(e.id) ? a.filter((x) => x !== e.id) : [...a, e.id]
                            )
                          }
                        />
                        <span>{e.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {startMode === 'AFTER_MINUTES_AND_AFTER_SELECTED' && (
              <div style={sx.subblock}>
                <div style={sx.inputInline}>
                  <div>Минуты</div>
                  <input
                    type="number"
                    min={1}
                    value={startMinutes}
                    onChange={(e) => setStartMinutes(Math.max(1, Number(e.target.value || 1)))}
                    style={{ ...sx.input, width: 120 }}
                  />
                </div>
                <div>
                  <div style={{ marginTop: 8, marginBottom: 6 }}>Выберите связи</div>
                  {prevEdges.length === 0 && <div style={sx.hint}>Нет входящих связей</div>}
                  <div style={sx.chips}>
                    {prevEdges.map((e) => (
                      <label key={e.id} style={sx.chip}>
                        <input
                          type="checkbox"
                          checked={startSelected.includes(e.id)}
                          onChange={() =>
                            setStartSelected((a) =>
                              a.includes(e.id) ? a.filter((x) => x !== e.id) : [...a, e.id]
                            )
                          }
                        />
                        <span>{e.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CANCEL */}
          <div style={sx.section}>
            <div style={sx.sectionTitle}>Отмена</div>
            <div style={sx.radioGrid}>
              <label style={sx.radioCard(cancelMode === 'NONE')}>
                <input
                  type="radio"
                  name="cancel-mode"
                  value="NONE"
                  checked={cancelMode === 'NONE'}
                  onChange={() => setCancelMode('NONE')}
                  style={{ display: 'none' }}
                />
                Не отменять
              </label>
              <label style={sx.radioCard(cancelMode === 'CANCEL_IF_ANY_SELECTED_CANCELLED')}>
                <input
                  type="radio"
                  name="cancel-mode"
                  value="CANCEL_IF_ANY_SELECTED_CANCELLED"
                  checked={cancelMode === 'CANCEL_IF_ANY_SELECTED_CANCELLED'}
                  onChange={() => setCancelMode('CANCEL_IF_ANY_SELECTED_CANCELLED')}
                  style={{ display: 'none' }}
                />
                🚫 Отменить, если одна из выбранных отменена
              </label>
            </div>

            {cancelMode === 'CANCEL_IF_ANY_SELECTED_CANCELLED' && (
              <div style={sx.subblock}>
                <div>Выберите связи</div>
                {prevEdges.length === 0 && <div style={sx.hint}>Нет входящих связей</div>}
                <div style={sx.chips}>
                  {prevEdges.map((e) => (
                    <label key={e.id} style={sx.chip}>
                      <input
                        type="checkbox"
                        checked={cancelSelected.includes(e.id)}
                        onChange={() =>
                          setCancelSelected((a) =>
                            a.includes(e.id) ? a.filter((x) => x !== e.id) : [...a, e.id]
                          )
                        }
                      />
                      <span>{e.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* actions */}
        <div style={sx.actions}>
          <button
            style={sx.btnGhost}
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            style={sx.btnPrimary}
            onClick={() => {
              // старт
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
                startOut = {
                  mode: 'AFTER_MINUTES_AND_AFTER_SELECTED',
                  minutes: startMinutes,
                  selectedEdges: startSelected,
                };
              }

              // отмена
              let cancelOut: CancelCondition = 'NONE';
              if (cancelMode === 'CANCEL_IF_ANY_SELECTED_CANCELLED') {
                cancelOut = { mode: 'CANCEL_IF_ANY_SELECTED_CANCELLED', selectedEdges: cancelSelected };
              }

              onSave({ start: startOut, cancel: cancelOut });
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
