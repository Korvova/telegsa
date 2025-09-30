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
        background: 'linear-gradient(180deg, #e5e7eb, #cbd5e1)',
        color: '#374151',
        border: '1px solid #D1D5DB',
        borderRadius: 12,
        padding: '10px 12px',
      }}
    >
      <span style={{ fontSize: 18 }}>👤</span>
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{fio || '—'}</div>
        <div style={{ fontSize: 12, opacity: 0.8, color: '#4b5563' }}>ID: {id}</div>
      </div>
    </div>
  );
}
