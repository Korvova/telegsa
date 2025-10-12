import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function ComplexityToggle({ value, onChange, style, dockBottom, onBeforeOpen, onAfterClose }: { value: number | null; onChange: (v: number | null) => void; style?: any; dockBottom?: number; onBeforeOpen?: () => void; onAfterClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number>(value ?? 5);

  const handleOpen = () => {
    setDraft(value ?? 5);
    if (onBeforeOpen) onBeforeOpen();
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    if (onAfterClose) onAfterClose();
  };

  const handleApply = () => {
    onChange(draft);
    setOpen(false);
    if (onAfterClose) onAfterClose();
  };

  const modal = open ? (
    <div onClick={handleClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:1000005, display:'flex', alignItems:'center', justifyContent:'center', paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.max(0, dockBottom ?? 0)}px)`, backdropFilter: (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent || '')) ? undefined : 'blur(8px)', WebkitBackdropFilter: (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent || '')) ? undefined : ('blur(8px)' as any) }}>
      <div onClick={(e)=>e.stopPropagation()} onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()} onTouchStart={(e)=>e.stopPropagation()} onMouseDownCapture={(e)=>e.stopPropagation()} onPointerDownCapture={(e)=>e.stopPropagation()} onTouchStartCapture={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(520px, 94vw)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div style={{ fontWeight:700 }}>🔘 Сложность задачи</div>
          <button onClick={handleClose} style={{ background:'transparent', border:'none', color:'#8aa0ff', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ display:'grid', gap:8 }}>
          <input type="range" min={1} max={10} value={draft} onChange={(e)=>setDraft(parseInt(e.target.value,10))} style={{ width:'100%' }} />
          <div style={{ textAlign:'center', fontSize:14 }}>Выбрано: <b>{draft}</b></div>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:10 }}>
          <button onClick={handleClose} style={{ padding:'10px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отмена</button>
          <button onClick={handleApply} style={{ padding:'10px 12px', borderRadius:10, border:'1px solid transparent', background:'#2563eb', color:'#fff' }}>Применить</button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button type="button" onClick={handleOpen} title="Сложность задачи (1–10)" style={style}>🔘</button>
      {modal ? (typeof document !== 'undefined' ? createPortal(modal, document.body) : modal) : null}
    </>
  );
}

