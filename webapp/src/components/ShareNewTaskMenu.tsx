import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { createShareLink } from '../api/sharenewtask';

export default function ShareNewTaskMenu({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      WebApp?.showPopup?.({ message: 'Ссылка скопирована' });
    } catch {
      alert(link);
    }
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
        <div
          style={{
            position: 'absolute', right: 0, marginTop: 6, minWidth: 220,
            background: '#0f1422', border: '1px solid #2a3346', borderRadius: 10, padding: 8, zIndex: 5
          }}
        >
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
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #2a3346', background: '#131a2a', color: '#e8eaed' }}
              />
              <button onClick={copy} style={{ marginTop: 6, width: '100%', padding: 8, borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>
                Копировать
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
