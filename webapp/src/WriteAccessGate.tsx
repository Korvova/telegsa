import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';

type Settings = {
  telegramId: string;
  receiveTaskAccepted: boolean;
  writeAccessGranted: boolean;
};

export default function WriteAccessGate() {
  const me = String(WebApp?.initDataUnsafe?.user?.id || '');
  const API = (import.meta as any).env.VITE_API_BASE || '';

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [enabling, setEnabling] = useState(false);

  const allowed =
    !!settings &&
    settings.writeAccessGranted === true &&
    settings.receiveTaskAccepted === true;

  // грузим текущие настройки
  useEffect(() => {
    if (!me) return;
    setLoading(true);
    fetch(`${API}/notifications/${encodeURIComponent(me)}`)
      .then((r) => r.json())
      .then((r) => {
        const st = r?.settings || {};
        setSettings({
          telegramId: me,
          receiveTaskAccepted: st.receiveTaskAccepted !== false, // по умолчанию true
          writeAccessGranted: !!st.writeAccessGranted,
        });
      })
      .catch(() => {
        // если не нашли запись — считаем, что приём "принял задачу" включён, но доступа к личке ещё нет
        setSettings({
          telegramId: me,
          receiveTaskAccepted: true,
          writeAccessGranted: false,
        });
      })
      .finally(() => setLoading(false));
  }, [me, API]);

  // универсальный enable: работает и через колбэк, и через промис
  const enable = async () => {
    if (!me) return;
    setEnabling(true);

    let finished = false;
    const apply = async (granted: boolean) => {
      if (finished) return;
      finished = true;
      try {
        if (granted) {
          await fetch(`${API}/notifications/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: me, enabled: true }),
          });
          setSettings({
            telegramId: me,
            receiveTaskAccepted: true,
            writeAccessGranted: true,
          });
          WebApp?.HapticFeedback?.notificationOccurred?.('success');
        } else {
          WebApp?.HapticFeedback?.notificationOccurred?.('error');
        }
      } catch {
        WebApp?.HapticFeedback?.notificationOccurred?.('error');
      } finally {
        setEnabling(false);
      }
    };

    try {
      // 1) старый API с колбэком
      const ret: any = WebApp?.requestWriteAccess?.((gr: boolean) => {
        // срабатывает на iOS/Android
        apply(!!gr);
      });

      // 2) если вдруг вернулся промис — обработаем и его (Desktop / некоторые версии)
      if (ret && typeof ret.then === 'function') {
        const granted = await ret;
        await apply(!!granted);
      }
    } catch {
      await apply(false);
    }
  };

  // Не из Telegram → заглушка
  if (!me) {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <div style={titleStyle}>Нужно открыть из Telegram</div>
          <div style={textStyle}>Запустите мини-приложение из чата с ботом.</div>
        </div>
      </div>
    );
  }

  // Доступ дан — ничего не перекрываем
  if (!loading && allowed) return null;

  // Иначе рисуем фулл-скрин оверлей
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={titleStyle}>Включите уведомления</div>
        <div style={textStyle}>
          Чтобы пользоваться приложением, разрешите боту отправлять вам личные сообщения.
        </div>

        <button
          onClick={enable}
          disabled={enabling}
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #2a3346',
            background: '#abb2c9ff',
            color: '#e8eaed',
            width: '100%',
          }}
        >
          {enabling ? 'Включаем…' : 'Включить'}
        </button>

        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
          После подтверждения доступ откроется автоматически. <br />
          Отключить уведомления можно в настройках.
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background:
    'linear-gradient(180deg, rgba(10,12,20,0.95) 0%, rgba(213, 215, 223, 0.77) 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  borderRadius: 16,
  border: '1px solid #2a3346',
  background: '#dcdfe6ff',
  padding: 16,
  boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700 as const,
  marginBottom: 8,
};

const textStyle: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.85,
};
