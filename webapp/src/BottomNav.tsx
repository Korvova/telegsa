// webapp/src/BottomNav.tsx
import { useMemo } from 'react';

export type TabKey = 'home' | 'groups' | 'calendar' | 'notifications' | 'settings';

export default function BottomNav({
  current,
  onChange,
}: {
  current: TabKey;
  onChange: (t: TabKey) => void;
}) {
  const items = useMemo(
    () => [
      { key: 'home',          icon: '🏠︎', label: 'Главная' },
      { key: 'groups',        icon: '🗂️', label: 'Группы' },
      { key: 'calendar',      icon: '📅', label: 'Календарь' },
      { key: 'notifications', icon: '🔔', label: 'Уведомления' },
      { key: 'settings',      icon: '⚙️', label: 'Настройки' },
    ] as const,
    []
  );

  return (
    <nav
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        background: '#0b1220',
        borderTop: '1px solid #1f2937',
        zIndex: 40,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 4, padding: 8 }}>
        {items.map((it) => {
          const active = current === (it.key as TabKey);
          return (
            <button
              key={it.key}
              onClick={() => onChange(it.key as TabKey)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '8px 4px',
                borderRadius: 10,
                border: '1px solid #1f2937',
                background: active ? '#18223b' : 'transparent',
                color: active ? '#e5e7eb' : '#9ca3af',
                cursor: 'pointer',
              }}
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
