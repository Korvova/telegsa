import { useMemo } from 'react';

export type TabKey = 'groups' | 'calendar' | 'notifications' | 'settings';

export default function BottomNav({
  current,
  onChange,
}: {
  current: TabKey;
  onChange: (t: TabKey) => void;
}) {
  const items = useMemo(
    () => [
      { id: 'groups' as const, icon: '🗂️', label: 'Группы' },
      { id: 'calendar' as const, icon: '📅', label: 'Календарь' },
      { id: 'notifications' as const, icon: '🔔', label: 'Уведомления' },
      { id: 'settings' as const, icon: '⚙️', label: 'Настройки' },
    ],
    []
  );

  return (
    <nav
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        background: '#0b1020',
        borderTop: '1px solid #2a3346',
        padding: '8px 10px calc(8px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
          maxWidth: 720,
          margin: '0 auto',
        }}
      >
        {items.map((it) => {
          const active = current === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onChange(it.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '8px 4px',
                borderRadius: 12,
                border: '1px solid #2a3346',
                background: active ? '#1b2030' : '#121722',
                color: active ? '#8aa0ff' : '#e8eaed',
                cursor: 'pointer',
              }}
              aria-current={active ? 'page' : undefined}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{it.icon}</span>
              <span style={{ fontSize: 11 }}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
