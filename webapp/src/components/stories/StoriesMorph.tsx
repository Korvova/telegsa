import StoriesRing from './StoriesRing';
import type { StoriesBarItem } from './StoriesTypes';

type Props = {
  items: StoriesBarItem[];
  progress: number; // 0..1 — 0=точка, 1=полный круг
  onOpen?: (item: StoriesBarItem) => void;
  minSize?: number; // px
  maxSize?: number; // px
};

export default function StoriesMorph({ items, progress, onOpen, minSize = 6, maxSize = 48 }: Props) {
  if (!items || items.length === 0) return null;
  const sorted = [...items].sort((a, b) => {
    const aUnread = a.segments?.some((s) => !s.seen) ? 1 : 0;
    const bUnread = b.segments?.some((s) => !s.seen) ? 1 : 0;
    return bUnread - aUnread;
  });
  const first = sorted[0];

  const p = Math.max(0, Math.min(1, progress || 0));
  const size = Math.round(minSize + (maxSize - minSize) * p);

  const label = (first?.title || '').slice(0, 2);

  const isDot = size < 16;

  return (
    <div style={{ position: 'relative', height: maxSize, marginBottom: 4 }}>
      <button
        onClick={() => onOpen?.(first)}
        title={first?.title}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          position: 'absolute',
          left: 0,
          top: 0,
        }}
      >
        {isDot ? (
          <div
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              background: '#22c55e',
              // тонкая окантовка, чтобы было видно на тёмном фоне
              boxShadow: '0 0 0 2px #2a3346 inset',
            }}
          />
        ) : (
          <StoriesRing
            segments={first.segments || []}
            centerLabel={size >= 28 ? label : ''}
            size={size}
            stroke={Math.max(2, Math.round(size * 0.07))}
            gapDeg={6}
          />
        )}
      </button>
    </div>
  );
}

