import { useEffect, useState } from 'react';


export type StartCondition =
  | 'AFTER_ANY'
  | { mode: 'AFTER_SELECTED'; selectedEdges: string[] }
  | { mode: 'ON_DATE'; date: string } // ISO (для <input type="datetime-local"> тоже храним ISO)
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
  // для <input type="datetime-local"> ожидается YYYY-MM-DDTHH:mm
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
  const [startDateLocal, setStartDateLocal] = useState<string>(''); // datetime-local
  const [startMinutes, setStartMinutes] = useState<number>(10);

  const [cancelMode, setCancelMode] = useState<'NONE' | 'CANCEL_IF_ANY_SELECTED_CANCELLED'>('NONE');
  const [cancelSelected, setCancelSelected] = useState<string[]>([]);

  // инициализация из initial*
  useEffect(() => {
    // start
    if (initialStart === 'AFTER_ANY') {
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

  const toggleArr = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  if (!open) return null;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <b>⚙️ Условия узла</b>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onDelete} title="Удалить узел">🗑️</button>
            <button onClick={onClose} title="Закрыть">✖️</button>
          </div>
        </div>

        {/* START */}
        <div className="modal-block">
          <div className="modal-block-title">Старт</div>
          {[
            ['AFTER_ANY', 'После завершения любой связанной (➡️, зелёный пунктир)'],
            ['AFTER_SELECTED', 'После выбранных связей (чекбоксы, ➡️ только на выбранных)'],
            ['ON_DATE', 'В дату (📅)'],
            ['ON_DATE_AND_AFTER_SELECTED', 'В дату (📅) + после выбранных связей'],
            ['AFTER_MINUTES_AND_AFTER_SELECTED', 'Через X минут (⏰) + после выбранных связей'],
          ].map(([val, label]) => (
            <label key={val} style={{ display: 'block', marginBottom: 6 }}>
              <input
                type="radio"
                name="start-mode"
                value={val}
                checked={startMode === val}
                onChange={() => setStartMode(val as any)}
              />{' '}
              {label}
            </label>
          ))}

          {/* блоки параметров по режимам */}
          {startMode === 'AFTER_SELECTED' && (
            <div className="modal-subblock">
              <div className="modal-subtitle">Выберите связи</div>
              {prevEdges.length === 0 && <div className="muted">Нет входящих связей</div>}
              {prevEdges.map((e) => (
                <label key={e.id} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={startSelected.includes(e.id)}
                    onChange={() => setStartSelected((a) => toggleArr(a, e.id))}
                  />{' '}
                  {e.label}
                </label>
              ))}
            </div>
          )}

          {startMode === 'ON_DATE' && (
            <div className="modal-subblock">
              <div className="modal-subtitle">Дата/время</div>
              <input
                type="datetime-local"
                value={startDateLocal}
                onChange={(e) => setStartDateLocal(e.target.value)}
              />
            </div>
          )}

          {startMode === 'ON_DATE_AND_AFTER_SELECTED' && (
            <div className="modal-subblock">
              <div className="modal-subtitle">Дата/время</div>
              <input
                type="datetime-local"
                value={startDateLocal}
                onChange={(e) => setStartDateLocal(e.target.value)}
              />
              <div className="modal-subtitle" style={{ marginTop: 10 }}>Выберите связи</div>
              {prevEdges.length === 0 && <div className="muted">Нет входящих связей</div>}
              {prevEdges.map((e) => (
                <label key={e.id} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={startSelected.includes(e.id)}
                    onChange={() => setStartSelected((a) => toggleArr(a, e.id))}
                  />{' '}
                  {e.label}
                </label>
              ))}
            </div>
          )}

          {startMode === 'AFTER_MINUTES_AND_AFTER_SELECTED' && (
            <div className="modal-subblock">
              <div className="modal-subtitle">Минуты</div>
              <input
                type="number"
                min={1}
                value={startMinutes}
                onChange={(e) => setStartMinutes(Math.max(1, Number(e.target.value || 1)))}
                style={{ width: 100 }}
              />
              <div className="modal-subtitle" style={{ marginTop: 10 }}>Выберите связи</div>
              {prevEdges.length === 0 && <div className="muted">Нет входящих связей</div>}
              {prevEdges.map((e) => (
                <label key={e.id} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={startSelected.includes(e.id)}
                    onChange={() => setStartSelected((a) => toggleArr(a, e.id))}
                  />{' '}
                  {e.label}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* CANCEL */}
        <div className="modal-block">
          <div className="modal-block-title">Отмена</div>
          <label style={{ display: 'block', marginBottom: 6 }}>
            <input
              type="radio"
              name="cancel-mode"
              value="NONE"
              checked={cancelMode === 'NONE'}
              onChange={() => setCancelMode('NONE')}
            />{' '}
            Не отменять
          </label>
          <label style={{ display: 'block' }}>
            <input
              type="radio"
              name="cancel-mode"
              value="CANCEL_IF_ANY_SELECTED_CANCELLED"
              checked={cancelMode === 'CANCEL_IF_ANY_SELECTED_CANCELLED'}
              onChange={() => setCancelMode('CANCEL_IF_ANY_SELECTED_CANCELLED')}
            />{' '}
            Отменить, если одна из выбранных отменена (🚫)
          </label>

          {cancelMode === 'CANCEL_IF_ANY_SELECTED_CANCELLED' && (
            <div className="modal-subblock">
              <div className="modal-subtitle">Выберите связи</div>
              {prevEdges.length === 0 && <div className="muted">Нет входящих связей</div>}
              {prevEdges.map((e) => (
                <label key={e.id} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={cancelSelected.includes(e.id)}
                    onChange={() => setCancelSelected((a) => toggleArr(a, e.id))}
                  />{' '}
                  {e.label}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ACTIONS */}
        <div className="modal-actions">
          <button
            onClick={() => {
              const toIso = (local: string) => (local ? new Date(local).toISOString() : '');
              // собираем старт
              let startOut: StartCondition = 'AFTER_ANY';
              if (startMode === 'AFTER_ANY') {
                startOut = 'AFTER_ANY';
              } else if (startMode === 'AFTER_SELECTED') {
                startOut = { mode: 'AFTER_SELECTED', selectedEdges: startSelected };
              } else if (startMode === 'ON_DATE') {
                startOut = { mode: 'ON_DATE', date: toIso(startDateLocal) };
              } else if (startMode === 'ON_DATE_AND_AFTER_SELECTED') {
                startOut = { mode: 'ON_DATE_AND_AFTER_SELECTED', date: toIso(startDateLocal), selectedEdges: startSelected };
              } else if (startMode === 'AFTER_MINUTES_AND_AFTER_SELECTED') {
                startOut = { mode: 'AFTER_MINUTES_AND_AFTER_SELECTED', minutes: startMinutes, selectedEdges: startSelected };
              }

              // собираем отмену
              let cancelOut: CancelCondition = 'NONE';
              if (cancelMode === 'CANCEL_IF_ANY_SELECTED_CANCELLED') {
                cancelOut = { mode: 'CANCEL_IF_ANY_SELECTED_CANCELLED', selectedEdges: cancelSelected };
              }

              onSave({ start: startOut, cancel: cancelOut });
            }}
          >
            Сохранить
          </button>
          <button onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
