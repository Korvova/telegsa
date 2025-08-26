import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';

type Settings = {
  telegramId: string;
  receiveTaskAccepted: boolean;
  writeAccessGranted: boolean;
};

export default function NotificationsView() {
  const me = String(WebApp?.initDataUnsafe?.user?.id || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<Settings | null>(null);
  const API = (import.meta as any).env.VITE_API_BASE || '';

  useEffect(() => {
    if (!me) return;
    setLoading(true);
    fetch(`${API}/notifications/${encodeURIComponent(me)}`)
      .then((r) => r.json())
      .then((r) => {
        const st = r?.settings || {};
        setS({
          telegramId: me,
          receiveTaskAccepted: !!st.receiveTaskAccepted,
          writeAccessGranted: !!st.writeAccessGranted,
        });
      })
      .catch(() =>
        setS({
          telegramId: me,
          receiveTaskAccepted: true,
          writeAccessGranted: false,
        })
      )
      .finally(() => setLoading(false));
  }, [me, API]);

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      await fetch(`${API}/notifications/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: me, enabled }),
      });
      setS((prev) =>
        prev
          ? {
              ...prev,
              receiveTaskAccepted: enabled,
              writeAccessGranted: enabled,
            }
          : prev
      );
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch {
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  const requestWrite = async () => {
    const doSet = (granted: boolean) => toggle(!!granted);
    try {
      const maybe: any = WebApp?.requestWriteAccess?.((granted: boolean) => {
        if (typeof granted === 'boolean') doSet(granted);
      });
      if (maybe && typeof maybe.then === 'function') {
        const granted = await maybe as boolean;
        if (typeof granted === 'boolean') doSet(granted);
      }
    } catch {
      // пользователь мог отменить диалог
    }
  };


  if (!me)
    return (
      <div style={{ padding: 16 }}>
        Откройте WebApp из Telegram, чтобы настроить уведомления.
      </div>
    );
  if (loading || !s) return <div style={{ padding: 16 }}>Загрузка…</div>;

  const enabled = s.receiveTaskAccepted && s.writeAccessGranted;

  return (
    <div
      style={{
        padding: 16,
        background: '#1b2030',
        border: '1px solid #2a3346',
        borderRadius: 16,
        minHeight: 200,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>
        Уведомления
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>Личные сообщения от бота</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Разреши боту писать тебе, чтобы получать уведомления.
          </div>
        </div>

        {enabled ? (
          <button
            onClick={() => toggle(false)}
            disabled={saving}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #2a3346',
              background: '#2a3e2f',
              color: '#d7ffd7',
            }}
          >
            Выключить
          </button>
        ) : (
          <button
            onClick={requestWrite}
            disabled={saving}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #2a3346',
              background: '#202840',
              color: '#e8eaed',
            }}
          >
            Включить
          </button>
        )}
      </div>

      <div
        style={{
          marginTop: 8,
          padding: 12,
          borderRadius: 12,
          border: '1px solid #2a3346',
          background: '#121722',
          opacity: enabled ? 1 : 0.6,
        }}
      >
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={enabled} readOnly />
          <div>
            <div style={{ fontWeight: 600 }}>Когда приняли задачу</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Придёт сообщение, когда вас назначили ответственным.
            </div>
          </div>
        </label>
        {!enabled && (
          <div style={{ fontSize: 12, color: '#ffcf99', marginTop: 8 }}>
            Нажмите «Включить», чтобы активировать уведомления.
          </div>
        )}
      </div>
    </div>
  );
}
