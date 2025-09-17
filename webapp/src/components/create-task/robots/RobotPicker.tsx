export default function RobotPicker({
  open,
  onClose,
  onPickSchedule,
  onPickWeather,
}: {
  open: boolean;
  onClose: () => void;
  onPickSchedule: () => void;
  onPickWeather: () => void;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex: 2200, display:'flex', alignItems:'center', justifyContent:'center' }}
    >
      <div onClick={(e)=>e.stopPropagation()} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:12, padding:16, width:'min(420px, 92vw)' }}>
        <div style={{ fontWeight:700, marginBottom:10, fontSize:16 }}>Выберите робота</div>
        <div style={{ display:'grid', gap:8 }}>
          <button onClick={onPickSchedule} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', cursor:'pointer' }}>🕒 Плановое создание задачи</button>
          <button onClick={onPickWeather} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', cursor:'pointer' }}>🌦️ Плановое создание задачи с погодой</button>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
          <button onClick={onClose} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
