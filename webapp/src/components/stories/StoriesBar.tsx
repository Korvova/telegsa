
import StoriesRing, { type StorySegment } from './StoriesRing';


export type StoriesBarItem = {
  id: string;                 // уникальный id кружка (проект или страница проекта)
  title: string;              // название проекта
  segments: StorySegment[];   // 1..20
  onClick?: () => void;       // открыть сториз
};

type Props = {
  items: StoriesBarItem[];
};

export default function StoriesBar({ items }: Props) {
  return (
    <div style={{ padding: '8px 0' }}>
      <div
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          padding: '4px 2px 8px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {items.map((it) => (
          <div key={it.id} style={{ width: 72, flex: '0 0 auto', textAlign: 'center' }}>
            <StoriesRing
              size={64}
              thickness={5}
              gapDeg={4}
              segments={it.segments}
              onClick={it.onClick}
            >
              {/* Центр кружка — первая буква проекта */}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#e8eaed',
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                {it.title?.trim()?.[0]?.toUpperCase() || '•'}
              </div>
            </StoriesRing>

            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: '#cbd5e1',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={it.title}
            >
              {it.title}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
