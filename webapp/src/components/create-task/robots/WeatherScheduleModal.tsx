import { useEffect, useMemo, useRef, useState } from 'react';

type GeoItem = { name: string; country?: string; admin1?: string; latitude: number; longitude: number };
type Op = 'GE' | 'LE';

export default function WeatherScheduleModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (p: { atIso: string; city: string; lat: number; lon: number; op: Op; valueC: number }) => void;
}) {
  const [local, setLocal] = useState(''); // yyyy-MM-ddTHH:mm
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoItem[]>([]);
  const [sel, setSel] = useState<GeoItem | null>(null);
  const [op, setOp] = useState<Op>('GE');
  const [val, setVal] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocal(''); setQ(''); setResults([]); setSel(null); setOp('GE'); setVal(''); setErr(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (timer.current) window.clearTimeout(timer.current);
    if (!q || q.trim().length < 2) { setResults([]); return; }
    timer.current = window.setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=ru&format=json`);
        const j = await r.json().catch(()=>({}));
        const arr = Array.isArray(j?.results) ? j.results : [];
        setResults(arr.map((x:any) => ({ name: String(x.name||''), country: x.country, admin1: x.admin1, latitude: Number(x.latitude), longitude: Number(x.longitude) })));
      } catch { setResults([]); }
    }, 300) as any;
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [q, open]);

  const minAttr = useMemo(() => {
    const d = new Date(); d.setSeconds(0,0);
    const p = (n:number)=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }, []);

  const canSave = useMemo(() => {
    if (!local) return false;
    if (!sel) return false;
    const vv = parseFloat(val);
    if (!Number.isFinite(vv)) return false;
    if (vv < -60 || vv > 60) return false;
    const dt = new Date(local);
    if (Number.isNaN(dt.getTime()) || dt.getTime() <= Date.now()) return false;
    return true;
  }, [local, sel, val]);

  const save = () => {
    setErr(null);
    if (!canSave || !sel) { setErr('Заполните все поля корректно'); return; }
    const dt = new Date(local);
    if (Number.isNaN(dt.getTime()) || dt.getTime() <= Date.now()) { setErr('Нельзя в прошлое'); return; }
    const atIso = dt.toISOString();
    const vv = Math.max(-60, Math.min(60, Number(val)));
    const labelCity = [sel.name, sel.admin1, sel.country].filter(Boolean).join(', ');
    onApply({ atIso, city: labelCity, lat: sel.latitude, lon: sel.longitude, op, valueC: vv });
  };

  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex: 2250, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:12, padding:16, width:'min(520px, 92vw)' }}>
        <div style={{ fontWeight:700, marginBottom:8, fontSize:16 }}>🌦️ Плановое создание с погодой</div>

        <div style={{ display:'grid', gap:10 }}>
          <div>
            <div style={{ fontSize:12, opacity:.8, marginBottom:4 }}>Дата/время</div>
            <input type="datetime-local" value={local} min={minAttr} onChange={(e)=>setLocal(e.target.value)} style={{ width:'100%', background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:8, padding:'8px 10px' }} />
          </div>

          <div>
            <div style={{ fontSize:12, opacity:.8, marginBottom:4 }}>Город</div>
            <input value={q} onChange={(e)=>{ setQ(e.target.value); setSel(null); }} placeholder="Начните вводить…" style={{ width:'100%', background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:8, padding:'8px 10px' }} />
            {results.length>0 && (
              <div style={{ marginTop:6, border:'1px solid #1f2937', borderRadius:8, overflow:'hidden' }}>
                {results.map((r,idx)=>(
                  <div key={idx} role="button" onClick={()=>{ setSel(r); setQ([r.name, r.admin1, r.country].filter(Boolean).join(', ')); }} style={{ padding:'8px 10px', cursor:'pointer', background: (sel && sel.name===r.name && sel.latitude===r.latitude && sel.longitude===r.longitude) ? '#1a2338' : '#0f172a', borderBottom: '1px solid #1f2937' }}>
                    {r.name}{r.admin1?`, ${r.admin1}`:''}{r.country?`, ${r.country}`:''}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'auto auto 1fr', gap:8, alignItems:'center' }}>
            <div style={{ fontSize:12, opacity:.8 }}>Условие</div>
            <select value={op} onChange={(e)=>setOp((e.target.value as Op) || 'GE')} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:8, padding:'8px 10px' }}>
              <option value="GE">≥</option>
              <option value="LE">≤</option>
            </select>
            <div>
              <input value={val} onChange={(e)=>setVal(e.target.value.replace(/[^\-\d.]/g,'').replace(/(\.)(?=.*\.)/g,'').slice(0,6))} placeholder="Температура, °C" inputMode="decimal" style={{ width:'100%', background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:8, padding:'8px 10px' }} />
            </div>
          </div>

          {err ? (<div style={{ color:'#fca5a5', fontSize:12 }}>{err}</div>) : null}
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
          <button onClick={onClose} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отмена</button>
          <button onClick={save} disabled={!canSave} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid transparent', background: canSave ? '#2563eb' : '#2a3350', color:'#fff' }}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
