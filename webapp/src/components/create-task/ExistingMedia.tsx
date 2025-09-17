type Media = { id: string; url: string; kind: string; fileName?: string };

export default function ExistingMedia({ items }: { items: Media[] }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ fontSize: 12, opacity: 0.95 }}>
      <div style={{ marginBottom: 4 }}>Прикреплено (в задаче):</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {items.slice(0, 6).map((m, idx) => {
          const href = `${m.url}`;
          if (m.kind === 'photo') {
            return (
              <a key={`${m.id}_${idx}`} href={href} target="_blank" rel="noreferrer" style={{ display:'inline-block', width: 56, height: 56, borderRadius: 8, overflow:'hidden', border:'1px solid #2a3346' }}>
                <img src={href} alt={m.fileName || 'photo'} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
              </a>
            );
          }
          const label = m.fileName || (m.url ? m.url.split('/').pop() || 'файл' : 'файл');
          const icon = m.kind === 'voice' ? '🎵' : '📄';
          return (
            <a key={`${m.id}_${idx}`} href={href} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:6, border:'1px solid #2a3346', background:'#1b2030', color:'#e8eaed', borderRadius:999, padding:'2px 8px' }}>
              <span>{icon}</span>
              <span style={{ maxWidth: 120, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</span>
            </a>
          );
        })}
        {items.length > 6 && (
          <span style={{ display:'inline-flex', alignItems:'center', gap:6, border:'1px solid #2a3346', background:'#121722', color:'#e8eaed', borderRadius:999, padding:'2px 8px' }}>+{items.length - 6} ещё</span>
        )}
      </div>
    </div>
  );
}

