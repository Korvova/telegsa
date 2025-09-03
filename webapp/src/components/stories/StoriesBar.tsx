//StoriesBar.tsx

import StoriesRing from './StoriesRing';
import type { StoriesBarItem } from './StoriesTypes';

type Props = {
  items: StoriesBarItem[];
  onOpen?: (item: StoriesBarItem) => void;
  showOwner?: boolean; // для вкладки «Проекты со мной»
};

export default function StoriesBar({ items, onOpen, showOwner = false }: Props) {
  const sorted = [...items].sort((a, b) => {
    const aUnread = a.segments?.some(s => !s.seen) ? 1 : 0;
    const bUnread = b.segments?.some(s => !s.seen) ? 1 : 0;
    return bUnread - aUnread;
  });

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
        padding: '8px 4px 4px',
        borderBottom: '1px solid #2a3346',
        marginBottom: 8,
      }}
    >
      {sorted.map((it) => {
        const label = (it.title || '').slice(0, 4);
        return (
          <div key={it.id} style={{ width: 76, flex: '0 0 auto', textAlign: 'center' }}>
            <button
              onClick={() => onOpen?.(it)}
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
              title={it.title}
            >
            <StoriesRing
  segments={it.segments || []}
  centerLabel={label}
  size={65}       // диаметр круга
  stroke={2}      // толщина кольца
  gapDeg={6}      // зазор между сегментами в градусах
/>
            </button>

            <div
              style={{
                fontSize: 12,
                color: '#e5e7eb',
                marginTop: 6,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 72,
                marginInline: 'auto',
              }}
              title={it.title}
            >
              {it.title}
            </div>

            {showOwner && it.ownerName ? (
              <div style={{ fontSize: 11, color: '#aab3c2', marginTop: 2, maxWidth: 72, marginInline: 'auto' }}>
                👑 {it.ownerName}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
