// webapp/src/components/SettingsProfile.tsx
import WebApp from '@twa-dev/sdk';

export default function SettingsProfile({ chatId }: { chatId: string }) {
  const u = WebApp?.initDataUnsafe?.user as
    | { id?: number; first_name?: string; last_name?: string; username?: string }
    | undefined;

  const fio = [u?.first_name, u?.last_name].filter(Boolean).join(' ');
  const id = u?.id ? String(u.id) : String(chatId || '');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: '#202840',
        color: '#e8eaed',
        border: '1px solid #2a3346',
        borderRadius: 12,
        padding: '10px 12px',
      }}
    >
      <span style={{ fontSize: 18 }}>👤</span>
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{fio || '—'}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>ID: {id}</div>
      </div>
    </div>
  );
}

