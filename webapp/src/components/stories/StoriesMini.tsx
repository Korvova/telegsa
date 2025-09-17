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

  const FRONT = 44;   // передний круг
  const BACK = 40;    // задний круг
  const SHIFT = Math.round(FRONT / 2); // горизонтальный сдвиг заднего круга
  const BACK_TOP = Math.max(0, Math.round((FRONT - BACK) / 2)); // чтобы центры совпали по вертикали

  return (
    <div
      style={{
        position: 'relative',
        height: FRONT,
        marginBottom: 4,
      }}
    >
      {/* Задний кружок */}
      {second ? (
        <button
          onClick={() => second && onOpen?.(second)}
          style={{
            position: 'absolute',
            left: SHIFT,
            top: BACK_TOP,
            width: BACK,
            height: BACK,
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
          title={second.title}
        >
          <StoriesRing segments={second.segments || []} centerLabel={label2} size={BACK} stroke={3} gapDeg={6} />
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
            width: FRONT,
            height: FRONT,
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
          title={first.title}
        >
          <StoriesRing segments={first.segments || []} centerLabel={label1} size={FRONT} stroke={3} gapDeg={6} />
        </button>
      ) : null}
    </div>
  );
}
