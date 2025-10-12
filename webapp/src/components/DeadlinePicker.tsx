import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  value: string | null; // ISO string or null
  onChange: (next: string | null) => void;
  onClose: () => void;
  minNow?: boolean; // default true
  title?: string;
  icon?: string; // header icon (default 🚩)
  centered?: boolean; // if true, show as centered modal even on iOS
  dockBottom?: number; // extra bottom padding (e.g., keyboard height)
};

function toLocalInputValue(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return '';
  }
}

function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function DeadlinePicker({ open, value, onChange, onClose, minNow = true, title = 'Дедлайн', icon = '🚩', centered = false, dockBottom = 0 }: Props) {
  const isiOS = useMemo(() => {
    try { return /iPad|iPhone|iPod/i.test(navigator.userAgent || ''); } catch { return false; }
  }, []);

  // Unified internal state: for iOS separate date+time; for others keep datetime-local string
  const [localDT, setLocalDT] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>(''); // YYYY-MM-DD
  const [timeStr, setTimeStr] = useState<string>(''); // HH:MM
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const dt = value ? toLocalInputValue(value) : '';
    setLocalDT(dt);
    if (dt) {
      const [d, t] = dt.split('T');
      setDateStr(d || ''); setTimeStr((t || '').slice(0,5));
    } else {
      setDateStr(''); setTimeStr('');
    }
  }, [open, value]);

  const nowMinDT = useMemo(() => {
    if (!minNow) return undefined;
    const d = new Date(); d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [minNow]);
  const nowMinDate = useMemo(() => nowMinDT?.split('T')[0], [nowMinDT]);

  const makeISO = (d: string, t: string): string | null => {
    if (!d || !t) return null;
    const isoLocal = `${d}T${t}`;
    const dd = new Date(isoLocal);
    if (Number.isNaN(dd.getTime())) return null;
    return dd.toISOString();
  };

  // Quick presets for iOS sheet
  const applyPlusMinutes = (min: number) => {
    const d = new Date(Date.now() + min * 60000); d.setSeconds(0, 0);
    const pad = (n:number)=>String(n).padStart(2,'0');
    const ds = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const ts = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setDateStr(ds); setTimeStr(ts);
  };
  const setTodayAt = (h:number,m:number)=>{ const d=new Date();d.setSeconds(0,0);d.setHours(h,m,0,0); const pad=(n:number)=>String(n).padStart(2,'0'); setDateStr(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`); setTimeStr(`${pad(h)}:${pad(m)}`); };
  const setTomorrowAt = (h:number,m:number)=>{ const d=new Date();d.setDate(d.getDate()+1);d.setSeconds(0,0); const pad=(n:number)=>String(n).padStart(2,'0'); setDateStr(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`); setTimeStr(`${pad(h)}:${pad(m)}`); };

  if (!open) return null;

  if (isiOS && !centered) {
    const sheet = (
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:1000005 }}>
        <div
          onClick={(e)=>e.stopPropagation()}
          onMouseDown={(e)=>e.stopPropagation()}
          onPointerDown={(e)=>e.stopPropagation()}
          onTouchStart={(e)=>e.stopPropagation()}
          onMouseDownCapture={(e)=>e.stopPropagation()}
          onPointerDownCapture={(e)=>e.stopPropagation()}
          onTouchStartCapture={(e)=>e.stopPropagation()}
          style={{ position:'fixed', left:0, right:0, bottom:0, borderTopLeftRadius:16, borderTopRightRadius:16, background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', padding:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <div style={{ fontWeight:700 }}>{icon} {title}</div>
            <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#8aa0ff', fontSize:18, cursor:'pointer' }}>✕</button>
          </div>

          {/* Quick actions */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:10 }}>
            <button onClick={()=>applyPlusMinutes(15)} style={chipBtn}>+15м</button>
            <button onClick={()=>applyPlusMinutes(60)} style={chipBtn}>+1ч</button>
            <button onClick={()=>setTodayAt(18,0)} style={chipBtn}>Сегодня 18:00</button>
            <button onClick={()=>setTomorrowAt(9,0)} style={chipBtn}>Завтра 09:00</button>
            <button onClick={()=>applyPlusMinutes(24*60*7)} style={chipBtn}>Через неделю</button>
            <button onClick={()=>{ const d=new Date(); const day=(d.getDay()+6)%7; const add=((7-day)%7)||7; d.setDate(d.getDate()+add); d.setHours(10,0,0,0); const pad=(n:number)=>String(n).padStart(2,'0'); setDateStr(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`); setTimeStr('10:00'); }} style={chipBtn}>Пн 10:00</button>
          </div>

          {/* Big iOS-friendly pickers - vertical layout to prevent overlap */}
          <div style={{ display:'flex', flexDirection:'column', gap:8, paddingLeft:4, paddingRight:4 }}>
            <input type="date" value={dateStr} min={nowMinDate} onChange={(e)=>setDateStr(e.target.value)} style={{...iosInput, minWidth:0, width:'calc(100% - 8px)', maxWidth:'calc(100% - 8px)'}} />
            <input type="time" value={timeStr} onChange={(e)=>setTimeStr(e.target.value)} style={{...iosInput, minWidth:0, width:'calc(100% - 8px)', maxWidth:'calc(100% - 8px)'}} />
          </div>
          {error ? <div style={{ color:'salmon', fontSize:12, marginTop:6 }}>{error}</div> : null}

          <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginTop:12 }}>
            <button onClick={()=>{ onChange(null); onClose(); }} style={btnSecondary}>Без дедлайна</button>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={onClose} style={btnSecondary}>Отмена</button>
              <button onClick={()=>{
                const iso = makeISO(dateStr, timeStr);
                if (!iso) { setError('Выберите дату и время'); return; }
                const dt = new Date(iso).getTime(); if (minNow && dt <= Date.now()) { setError('Нельзя в прошлое'); return; }
                onChange(iso); onClose();
              }} style={btnPrimary}>Сохранить</button>
            </div>
          </div>
        </div>
      </div>
    );
    try { return createPortal(sheet, document.body); } catch { return sheet; }
  }

  // Centered modal (default or forced on iOS via centered=true)
  const centeredModal = (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:1000005, display:'flex', alignItems:'center', justifyContent:'center', paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.max(0, dockBottom)}px)`, backdropFilter: !isiOS ? 'blur(8px)' : undefined, WebkitBackdropFilter: !isiOS ? ('blur(8px)' as any) : undefined }}>
      <div
        onClick={(e)=>e.stopPropagation()}
        onMouseDown={(e)=>e.stopPropagation()}
        onPointerDown={(e)=>e.stopPropagation()}
        onTouchStart={(e)=>e.stopPropagation()}
        onMouseDownCapture={(e)=>e.stopPropagation()}
        onPointerDownCapture={(e)=>e.stopPropagation()}
        onTouchStartCapture={(e)=>e.stopPropagation()}
        style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(460px, 92vw)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontWeight:700 }}>{icon} {title}</div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#8aa0ff', cursor:'pointer' }}>✕</button>
        </div>
        {isiOS ? (
          <>
            <div style={{ display:'flex', flexDirection:'column', gap:8, paddingLeft:4, paddingRight:4 }}>
              <input type="date" value={dateStr} min={nowMinDate} onChange={(e)=>setDateStr(e.target.value)} style={{...iosInput, minWidth:0, width:'calc(100% - 8px)', maxWidth:'calc(100% - 8px)'}} />
              <input type="time" value={timeStr} onChange={(e)=>setTimeStr(e.target.value)} style={{...iosInput, minWidth:0, width:'calc(100% - 8px)', maxWidth:'calc(100% - 8px)'}} />
            </div>
            {error ? <div style={{ color:'salmon', fontSize:12, marginTop:6 }}>{error}</div> : null}
          </>
        ) : (
          <div style={{ display:'grid', gap:8 }}>
            <input type="datetime-local" value={localDT} min={nowMinDT} onChange={(e)=>setLocalDT(e.target.value)} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:10, padding:'8px 10px' }} />
            {error ? <div style={{ color:'salmon', fontSize:12 }}>{error}</div> : null}
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginTop:10 }}>
          <button onClick={()=>{ onChange(null); onClose(); }} style={btnSecondary}>Без дедлайна</button>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={btnSecondary}>Отмена</button>
            <button onClick={()=>{
              if (isiOS) {
                const iso = makeISO(dateStr, timeStr);
                if (!iso) { setError('Выберите дату и время'); return; }
                const dt = new Date(iso).getTime(); if (minNow && dt <= Date.now()) { setError('Нельзя в прошлое'); return; }
                onChange(iso); onClose();
              } else {
                const iso=fromLocalInputValue(localDT); if (!iso){ setError('Неверная дата/время'); return; } const dt=new Date(iso).getTime(); if (minNow && dt<=Date.now()) { setError('Нельзя в прошлое'); return; } onChange(iso); onClose();
              }
            }} style={btnPrimary}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
  try { return createPortal(centeredModal, document.body); } catch { return centeredModal; }
}

const chipBtn: React.CSSProperties = { padding:'10px 12px', borderRadius:12, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', cursor:'pointer', textAlign:'center' };
const iosInput: React.CSSProperties = { width:'100%', maxWidth:'100%', boxSizing:'border-box', minWidth:0, background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:10, padding:'6px 8px', fontSize:14 };
const btnSecondary: React.CSSProperties = { padding:'10px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', cursor:'pointer' };
const btnPrimary: React.CSSProperties = { padding:'10px 12px', borderRadius:10, border:'1px solid transparent', background:'#2563eb', color:'#fff', cursor:'pointer' };
