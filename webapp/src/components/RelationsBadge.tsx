// src/pages/Groups/components/RelationsBadge.tsx
type Props = {
  prevTitles?: string[];
  nextTitles?: string[];
};

export default function RelationsBadge({ prevTitles = [], nextTitles = [] }: Props) {
  if (!prevTitles.length && !nextTitles.length) return null;
  return (
    <div style={{ marginTop: 8, fontSize: 11, color: '#374151', textAlign: 'left' }}>
      {prevTitles.length ? (
        <div style={{ marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          ← {prevTitles.join(', ')}
        </div>
      ) : null}
      {nextTitles.length ? (
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          → {nextTitles.join(', ')}
        </div>
      ) : null}
    </div>
  );
}
