// no React import needed with automatic JSX

type Accept = 'NONE' | 'PHOTO' | 'APPROVAL' | 'PHOTO_AND_APPROVAL' | 'DOC_AND_APPROVAL';

export default function AcceptConditionsModal({
  open,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  value: Accept;
  onChange: (v: Accept) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex: 2000, display:'flex', alignItems:'center', justifyContent:'center' }}
    >
      <div onClick={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(420px, 92vw)' }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>☝️ Условия приёма</div>
        <div style={{ display:'grid', gap:8 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="radio" checked={value==='NONE'} onChange={()=>onChange('NONE')} />
            <span>Без условий</span>
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="radio" checked={value==='PHOTO'} onChange={()=>onChange('PHOTO')} />
            <span>Нужно фото 📸</span>
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="radio" checked={value==='APPROVAL'} onChange={()=>onChange('APPROVAL')} />
            <span>Нужно согласование 🤝</span>
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="radio" checked={value==='PHOTO_AND_APPROVAL'} onChange={()=>onChange('PHOTO_AND_APPROVAL')} />
            <span>Фото + согласование 📸🤝</span>
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="radio" checked={value==='DOC_AND_APPROVAL'} onChange={()=>onChange('DOC_AND_APPROVAL')} />
            <span>Документ + согласование 📎🤝</span>
          </label>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10 }}>
          <button onClick={onClose} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Готово</button>
        </div>
      </div>
    </div>
  );
}
