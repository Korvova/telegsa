import { useState } from 'react';

export default function ComplexityToggle({ value, onChange, style }: { value: number | null; onChange: (v: number | null) => void; style?: any }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number>(value ?? 5);

  return (
    <>
      <button type="button" onClick={() => { setDraft(value ?? 5); setOpen(true); }} title="Сложность задачи (1–10)" style={style}>🔘</button>
      {open && (
        <div onClick={()=>setOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={(e)=>e.stopPropagation()} style={{ background:'#111827', color:'#e5e7eb', border:'1px solid #2a3346', borderRadius:12, padding:16, width:'min(420px,92vw)' }}>
            <div style={{ fontWeight:800, marginBottom:8 }}>Сложность задачи</div>
            <div style={{ display:'grid', gap:8 }}>
              <input type="range" min={1} max={10} value={draft} onChange={(e)=>setDraft(parseInt(e.target.value,10))} style={{ width:'100%' }} />
              <div style={{ textAlign:'center', fontSize:14 }}>Выбрано: <b>{draft}</b></div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
              <button onClick={()=>setOpen(false)} style={{ borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', padding:'8px 12px', cursor:'pointer' }}>Отмена</button>
              <button onClick={()=>{ onChange(draft); setOpen(false); }} style={{ borderRadius:8, border:'1px solid transparent', background:'#2563eb', color:'#fff', padding:'8px 12px', cursor:'pointer' }}>Применить</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

