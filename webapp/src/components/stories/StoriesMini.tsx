import StoriesRing from './StoriesRing';
import type { StoriesBarItem } from './StoriesTypes';

type Props = {
  items: StoriesBarItem[];
  onOpen?: (item: StoriesBarItem) => void;
};

// Мини-вид: два маленьких перекрывающихся кружка сториз
export default function StoriesMini({ items, onOpen }: Props) {
  if (!items || items.length === 0) return null;

  // Непросмотренные вперёд
  const sorted = [...items].sort((a, b) => {
    const aUnread = a.segments?.some((s) => !s.seen) ? 1 : 0;
    const bUnread = b.segments?.some((s) => !s.seen) ? 1 : 0;
    return bUnread - aUnread;
  });

  const first = sorted[0];
  const second = sorted[1] || null;

  const label1 = (first?.title || '').slice(0, 2);
  const label2 = (second?.title || '').slice(0, 2);

  return (
    <div
      style={{
        position: 'relative',
        height: 56,
        marginBottom: 4,
      }}
    >
      {/* Задний кружок */}
      {second ? (
        <button
          onClick={() => second && onOpen?.(second)}
          style={{
            position: 'absolute',
            left: 22,
            top: 10,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
          title={second.title}
        >
          <StoriesRing segments={second.segments || []} centerLabel={label2} size={40} stroke={3} gapDeg={6} />
        </button>
      ) : null}

      {/* Передний кружок */}
      {first ? (
        <button
          onClick={() => onOpen?.(first)}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
          title={first.title}
        >
          <StoriesRing segments={first.segments || []} centerLabel={label1} size={44} stroke={3} gapDeg={6} />
        </button>
      ) : null}
    </div>
  );
}

