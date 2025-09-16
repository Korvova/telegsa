import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';

type Settings = {
  telegramId: string;
  receiveTaskAccepted: boolean;
  receiveTaskCompletedMine: boolean;
  receiveTaskComment: boolean;     // ⬅️ НОВОЕ
  writeAccessGranted: boolean;
};

export default function NotificationsView({ chatId }: { chatId?: string }) {
  const me = String(chatId || WebApp?.initDataUnsafe?.user?.id || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<Settings | null>(null);
  const API = (import.meta as any).env.VITE_API_BASE || '';

  // ---- load current settings
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
          receiveTaskCompletedMine:
            typeof st.receiveTaskCompletedMine === 'boolean' ? st.receiveTaskCompletedMine : true, // default ON

 receiveTaskComment:
  typeof st.receiveTaskComment === 'boolean' ? st.receiveTaskComment : true, // ⬅️ default ON

          writeAccessGranted: !!st.writeAccessGranted,
        });
      })
      .catch(() =>
        setS({
          telegramId: me,
          receiveTaskAccepted: true,
          receiveTaskCompletedMine: true,
                   receiveTaskComment: true, // ⬅️
          writeAccessGranted: false,
        })
      )
      .finally(() => setLoading(false));
  }, [me, API]);

  // ---- helpers
  const saveMe = async (patch: Partial<Settings>) => {
    if (!s) return;
    setSaving(true);
    try {
      const next = { ...s, ...patch };
      await fetch(`${API}/notifications/me`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: next.telegramId,
          receiveTaskAccepted: next.receiveTaskAccepted,
          receiveTaskCompletedMine: next.receiveTaskCompletedMine,
            receiveTaskComment: next.receiveTaskComment, // ⬅️ отправляем
          writeAccessGranted: next.writeAccessGranted,
        }),
      });
      setS(next);
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch {
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  const toggleMaster = async (enabled: boolean) => {
    // совместимость с твоим /notifications/toggle
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
      alert('Не удалось включить уведомления');
    } finally {
      setSaving(false);
    }
  };

  const requestWrite = async () => {
    const doSet = (granted: boolean) => toggleMaster(!!granted);
    try {
      const maybe: any = WebApp?.requestWriteAccess?.((granted: boolean) => {
        if (typeof granted === 'boolean') doSet(granted);
      });
      if (maybe && typeof maybe.then === 'function') {
        const granted = (await maybe) as boolean;
        if (typeof granted === 'boolean') doSet(granted);
      }
    } catch {
      // пользователь мог отменить диалог
    }
  };

  const sendTest = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/notifications/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: s.telegramId,
          text: '🔔 Тестовое уведомление: всё работает!',
        }),
      });
      if (!r.ok) throw new Error();
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      alert('Отправили тест в личку Telegram.');
    } catch {
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не получилось отправить тест.');
    } finally {
      setSaving(false);
    }
  };

  if (!me)
    return (
      <div style={{ padding: 16 }}>
        Откройте WebApp из Telegram, чтобы настроить уведомления.
      </div>
    );
  if (loading || !s) return <div style={{ padding: 16 }}>Загрузка…</div>;

  const masterEnabled = s.receiveTaskAccepted && s.writeAccessGranted;

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

      {/* Master toggle */}
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

        {masterEnabled ? (
          <button
            onClick={() => toggleMaster(false)}
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

      {/* Checkboxes */}
      <div
        style={{
          marginTop: 8,
          padding: 12,
          borderRadius: 12,
          border: '1px solid #2a3346',
          background: '#121722',
          opacity: masterEnabled ? 1 : 0.6,
        }}
      >
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={s.receiveTaskAccepted}
            disabled={!masterEnabled || saving}
            onChange={(e) =>
              saveMe({ receiveTaskAccepted: e.target.checked })
            }
          />
          <div>
            <div style={{ fontWeight: 600 }}>Когда приняли задачу</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Придёт сообщение, когда в задачи назначился ответственный.
            </div>
          </div>
        </label>

        <div style={{ height: 10 }} />

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={s.receiveTaskCompletedMine}
            disabled={!masterEnabled || saving}
            onChange={(e) =>
              saveMe({ receiveTaskCompletedMine: e.target.checked })
            }
          />
          <div>
            <div style={{ fontWeight: 600 }}>
              Когда завершили задачу (я постановщик)
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Уведомлять, только если задача создана вами.
            </div>
          </div>
        </label>




        <div style={{ height: 10 }} />
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={s.receiveTaskComment}
            disabled={!masterEnabled || saving}
            onChange={(e) => saveMe({ receiveTaskComment: e.target.checked })}
          />
          <div>
            <div style={{ fontWeight: 600 }}>Комментарий к задаче</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Придёт сообщение исполнителю и постановщику с текстом комментария.
            </div>
          </div>
        </label>






        {!masterEnabled && (
          <div style={{ fontSize: 12, color: '#ffcf99', marginTop: 8 }}>
            Нажмите «Включить», чтобы активировать уведомления.
          </div>
        )}

        <div style={{ height: 12 }} />
        <button
          onClick={sendTest}
          disabled={!masterEnabled || saving}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid #2a3346',
            background: masterEnabled ? '#203042' : '#202840',
            color: '#e8eaed',
          }}
        >
          Отправить тестовое уведомление
        </button>
      </div>
    </div>
  );
}
