export default function WeatherScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex: 2250, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:12, padding:16, width:'min(480px, 92vw)' }}>
        <div style={{ fontWeight:700, marginBottom:8, fontSize:16 }}>🌦️ Плановое создание с погодой</div>
        <div style={{ fontSize:13, opacity:.85 }}>
          Заглушка. Здесь позже появится выбор условий по погоде.
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
          <button onClick={onClose} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
