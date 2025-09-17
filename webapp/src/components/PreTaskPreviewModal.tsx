import type { PreTaskDTO } from '../api';

export default function PreTaskPreviewModal({ open, preTask, onClose, nameByChat }: { open: boolean; preTask: PreTaskDTO | null; onClose: () => void; nameByChat?: Record<string,string> | Map<string,string> }) {
  if (!open || !preTask) return null;
  const p = preTask;
  const modeText = p.triggerMode === 'AFTER_ALL_DONE'
    ? 'Сразу'
    : p.triggerMode === 'DATE_PLUS'
    ? '📅 ко времени'
    : p.triggerMode === 'DELAY_AFTER'
    ? '⏰ задержка'
    : '🚫 после отмены';
  const getName = (cid?: string | null) => {
    if (!cid) return '';
    const map = nameByChat instanceof Map ? nameByChat : new Map(Object.entries(nameByChat || {}));
    return map.get(String(cid)) || String(cid);
  };
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ background:'#131a26', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(520px, 92vw)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <div style={{ width: 10, height: 10, borderRadius: 999, background: '#64748b' }} />
          <div style={{ fontWeight:700 }}>Предзадача</div>
          <div style={{ marginLeft:'auto' }} />
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#8aa0ff', cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ fontSize: 16, marginBottom: 8 }}>{p.text}</div>
        <div style={{ fontSize: 14, marginBottom: 10, opacity:.9 }}>Режим: {modeText}</div>
        <div style={{ display:'grid', gap:10 }}>
          <div style={{ display:'grid', gap:4 }}>
            <div style={{ fontSize:12, opacity:.75 }}>Ответственный</div>
            <div style={{ fontSize:14 }}>{getName(p.creatorChatId)}</div>
          </div>
          <div style={{ display:'grid', gap:4 }}>
            <div style={{ fontSize:12, opacity:.75 }}>Ждёт</div>
            <div style={{ fontSize:14 }}>{getName(p.plannedAssigneeChatId) || 'не выбран'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
