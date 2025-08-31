// src/components/NodeConditionsModal.tsx
import { useState } from 'react';




export type StartCondition =
  | 'AFTER_ANY'
  | 'AFTER_SELECTED'
  | 'ON_DATE'
  | 'ON_DATE_AND_AFTER_SELECTED'
  | 'AFTER_DAYS_AND_AFTER_SELECTED';

export type CancelCondition = 'NONE' | 'CANCEL_IF_ANY_SELECTED_CANCELLED';







export default function NodeConditionsModal({
  open,
  initialStart = 'AFTER_ANY',
  initialCancel = 'NONE',
  onClose,
  onDelete,
  onSave,
}: {
  open: boolean;
  initialStart?: StartCondition;
  initialCancel?: CancelCondition;
  onClose: () => void;
  onDelete?: () => void;
  onSave: (value: { start: StartCondition; cancel: CancelCondition }) => void;
}) {
  const [start, setStart] = useState<StartCondition>(initialStart);
  const [cancel, setCancel] = useState<CancelCondition>(initialCancel);

  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.25)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, padding: 16, minWidth: 320, maxWidth: '92vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Условия запуска</div>

        {/* Блок условий запуска */}
        <fieldset style={{ marginBottom: 12 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>Когда запускать</legend>
          {([
            ['AFTER_ANY', 'После завершения любой связанной'],
            ['AFTER_SELECTED', 'После выбранных связей (с чекбоксами)'],
            ['ON_DATE', 'В дату (📅)'],
            ['ON_DATE_AND_AFTER_SELECTED', 'В дату (📅) и после выбранных связей'],
            ['AFTER_DAYS_AND_AFTER_SELECTED', 'Через X дней (⏰) + после выбранных связей'],
          ] as const).map(([val, label]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="radio" name="start" checked={start === val} onChange={() => setStart(val)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        {/* Блок условий отмены */}
        <fieldset style={{ marginBottom: 12 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>Когда отменять</legend>
          {([
            ['NONE', 'Не отменять автоматически'],
            ['CANCEL_IF_ANY_SELECTED_CANCELLED', 'Отменить, если одна из выбранных отменена'],
          ] as const).map(([val, label]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="radio" name="cancel" checked={cancel === val} onChange={() => setCancel(val)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          {onDelete ? (
            <button style={{ color: '#ef4444' }} onClick={onDelete}>
              🗑️ Удалить узел
            </button>
          ) : <span />}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}>Отмена</button>
            <button onClick={() => onSave({ start, cancel })}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
}
