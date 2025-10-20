// src/components/ShareNewTaskMenu.tsx
import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { createShareLink, createShareLinkWithPretasks } from '../api/sharenewtask';

type Props = {
  taskId: string;
  onDelete?: () => void;     // 👈 колбэк удаления
  isEvent?: boolean;         // 👈 чтобы подписать "Удалить событие"
  meChatId?: string;         // 👈 для изменения затрат
  initialExpenses?: number | null; // 👈 текущее значение затрат
  onOpenAccept?: () => void;     // 👈 открыть условия
  onOpenDeadline?: () => void;   // 👈 открыть дедлайн
  onOpenReminders?: () => void;  // 👈 открыть напоминания
  onOpenHistory?: () => void;    // 👈 открыть историю
};

export default function ShareNewTaskMenu({ taskId, onDelete, isEvent = false, meChatId = '', initialExpenses = null, onOpenAccept, onOpenDeadline, onOpenReminders, onOpenHistory }: Props) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [linkFull, setLinkFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyFull, setBusyFull] = useState(false);
  const [expDraft, setExpDraft] = useState('');
  const [expBusy, setExpBusy] = useState(false);

  useEffect(() => {
    try {
      // Показываем плейсхолдер вместо «0»
      const v = (initialExpenses != null && Number(initialExpenses) !== 0)
        ? String(initialExpenses)
        : '';
      setExpDraft(v);
    } catch { setExpDraft(''); }
  }, [initialExpenses]);

  async function makeLink() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await createShareLink(taskId);
      if (!r.ok) throw new Error(r.error || 'failed');
      setLink(r.link);
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch {
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось создать ссылку');
    } finally {
      setBusy(false);
    }
  }

  async function makeLinkFull() {
    if (busyFull) return;
    setBusyFull(true);
    try {
      const r = await createShareLinkWithPretasks(taskId);
      if (!r.ok) throw new Error(r.error || 'failed');
      setLinkFull(r.link);
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch {
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось создать ссылку со связями');
    } finally {
      setBusyFull(false);
    }
  }

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      WebApp?.showPopup?.({ message: 'Ссылка скопирована' });
    } catch {
      alert(link);
    }
  };

  const copyFull = async () => {
    if (!linkFull) return;
    try {
      await navigator.clipboard.writeText(linkFull);
      WebApp?.showPopup?.({ message: 'Ссылка со связями скопирована' });
    } catch {
      alert(linkFull);
    }
  };

  const doDelete = () => {
    setOpen(false);
    onDelete?.(); // вызовем обработчик из TaskView
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        title="Меню"
        onClick={() => setOpen((v) => !v)}
        style={{
          border: '1px solid #2a3346', background: '#121722', color: '#e8eaed',
          borderRadius: 10, padding: '6px 10px', cursor: 'pointer'
        }}
      >
        ⋮
      </button>

      {open && (
        <>
          {/* Оверлей для закрытия меню при клике вне */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 19,
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', right: 0, marginTop: 6, minWidth: 240,
              background: '#0f1422', border: '1px solid #2a3346', borderRadius: 10, padding: 8, zIndex: 20
            }}
          >
          {/* ID задачи */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>ID:</span>
            <input
              readOnly
              value={taskId}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="ID задачи"
              title="ID задачи"
              style={{ flex: 1, minWidth: 0, padding: 8, borderRadius: 8, border: '1px solid #2a3346', background: '#131a2a', color: '#e8eaed', fontSize: 12 }}
            />
          </div>

          <div style={{ height: 8 }} />

          {/* Затраты (₽) — уже не на всю ширину, чтобы не упираться в края */}
          <div style={{ position: 'relative', width: '90%', minWidth: 140 }}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={expDraft}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d*$/.test(v)) setExpDraft(v);
              }}
              onBlur={async () => {
                if (!meChatId) return; // без chatId не сохраняем
                setExpBusy(true);
                try {
                  const n = expDraft.trim() === '' ? null : Math.max(0, Math.round(Number(expDraft)));
                  const api = await import('../api');
                  const r = await (api as any).setTaskExpenses(taskId, meChatId, n);
                  if (!r?.ok) {
                    if (String((r as any)?.error||'')==='no_rights') alert('У вас нет прав на это действие');
                  } else {
                    try { WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch {}
                  }
                } catch (e: any) {
                  const msg = String(e?.message || '');
                  if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие');
                } finally {
                  setExpBusy(false);
                }
              }}
              placeholder="затраты"
              disabled={expBusy}
              style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '8px 30px 8px 8px', borderRadius: 8, border: '1px solid #2a3346', background: '#131a2a', color: '#e8eaed', fontSize: 12 }}
            />
            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, opacity: 0.75, pointerEvents: 'none' }}>(₽)</span>
          </div>

          <div style={{ height: 8 }} />

          {/* Действия: условия / дедлайн / напоминание / лог */}
          <div style={{ display:'grid', gap: 6 }}>
            <button
              onClick={() => { setOpen(false); onOpenAccept?.(); }}
              style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', color: '#e8eaed', border: '1px solid #2a3346', borderRadius: 8, cursor: 'pointer' }}
            >
              ☝️ Условия приёма
            </button>
            <button
              onClick={() => { setOpen(false); onOpenDeadline?.(); }}
              style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', color: '#e8eaed', border: '1px solid #2a3346', borderRadius: 8, cursor: 'pointer' }}
              title="Установить дедлайн"
            >
              🚩 Дедлайн
            </button>
            <button
              onClick={() => { setOpen(false); onOpenReminders?.(); }}
              style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', color: '#e8eaed', border: '1px solid #2a3346', borderRadius: 8, cursor: 'pointer' }}
              title="Создать напоминание"
            >
              ⏰ Напомнить
            </button>
            <button
              onClick={() => { setOpen(false); onOpenHistory?.(); }}
              style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', color: '#e8eaed', border: '1px solid #2a3346', borderRadius: 8, cursor: 'pointer' }}
              title="Посмотреть историю задачи"
            >
              📋 Лог
            </button>
          </div>

          <div style={{ height: 8 }} />

          <button
            onClick={makeLink}
            disabled={busy}
            style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', color: '#e8eaed', border: 'none', cursor: 'pointer' }}
          >
            Новая задача по ссылке
          </button>

          {link && (
            <div style={{ marginTop: 8 }}>
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid #2a3346', background: '#131a2a', color: '#e8eaed' }}
              />
              <button onClick={copy} style={{ marginTop: 6, width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>
                Копировать
              </button>
            </div>
          )}

          <div style={{ height: 8 }} />

          <button
            onClick={makeLinkFull}
            disabled={busyFull}
            style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', color: '#e8eaed', border: 'none', cursor: 'pointer' }}
          >
            Задача по ссылке со связями
          </button>

          {linkFull && (
            <div style={{ marginTop: 8 }}>
              <input
                readOnly
                value={linkFull}
                onFocus={(e) => e.currentTarget.select()}
                style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid #2a3346', background: '#131a2a', color: '#e8eaed' }}
              />
              <button onClick={copyFull} style={{ marginTop: 6, width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>
                Копировать
              </button>
            </div>
          )}

          <div style={{ height: 8 }} />

          {/* 🔻 Опасное действие: Удалить */}
          <button
            onClick={doDelete}
            style={{
              width: '100%', textAlign: 'left', padding: '8px 10px',
              background: '#291919', color: '#ffd7d7',
              border: '1px solid #472a2a', borderRadius: 8, cursor: 'pointer'
            }}
          >
            {isEvent ? 'Удалить событие' : 'Удалить'}
          </button>
        </div>
        </>
      )}
    </div>
  );
}
