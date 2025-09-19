import { useEffect, useMemo, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';

const API = (import.meta as any).env.VITE_API_BASE || '';

// ---- color utils ----
function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}
function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/); if (!m) return null;
  const n = parseInt(m[1], 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d === 0) h = 0;
  else if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

export default function SettingsTheme({ chatId }: { chatId: string }) {
  const [value, setValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const prevRef = useRef<string>('');
  // picker state
  const [h, setH] = useState(210); // default blue-ish
  const [s, setS] = useState(0.5);
  const [v, setV] = useState(0.25);

  // refs no longer used with react-colorful

  // init from API
  useEffect(() => {
    (async () => {
      const r = await fetch(`${API}/me/theme?chatId=${encodeURIComponent(chatId)}`).then(r=>r.json()).catch(()=>({ ok:false }));
      if (r?.ok && r.themeBg) {
        setValue(r.themeBg);
        const rgb = hexToRgb(r.themeBg);
        if (rgb) {
          const { h: hh, s: ss, v: vv } = rgbToHsv(rgb.r, rgb.g, rgb.b);
          setH(Math.round(hh)); setS(ss); setV(vv);
        }
      }
    })();
  }, [chatId]);

  // apply css var live
  useEffect(() => {
    const bg = value && /^#([0-9a-fA-F]{6})$/.test(value) ? value : '#0b1220';
    try { document.documentElement.style.setProperty('--app-bg', bg); } catch {}
    try { document.body.style.background = bg; } catch {}
  }, [value]);

  // update hex when hsv changes (live preview, not saved yet)
  useEffect(() => {
    const { r, g, b } = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);
    setValue(hex);
  }, [h, s, v]);

  const presets = useMemo(() => [
    '#0b1220','#101827','#121722','#1b2030','#202840','#0f172a','#111827','#1f2937',
    '#222222','#000000','#1a1a1a','#131313',
    '#0b1020','#08121f','#0c1a24',
    '#0a1f1a','#0f1d12','#0d1a0f',
    '#1a140d','#1a0f0d','#1a0d14',
    '#16213e','#0f3460','#1b1a55','#2d3250'
  ], []);

  const save = async (v: string) => {
    try { setSaving(true);
      const r = await fetch(`${API}/me/theme`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, value: v })
      }).then(r=>r.json());
      if (!r?.ok) throw new Error('save_failed');
    } catch { alert('Не удалось сохранить цвет'); }
    finally { setSaving(false); }
  };

  // pointer handlers
  // legacy pointer handlers removed (using react-colorful picker)

  // computed styles (for swatch only)

  return (
    <div style={{ background:'#121722', border:'1px solid #2a3346', borderRadius:12, padding:12 }}>
      <div style={{ fontWeight:600, marginBottom:6 }}>Фон приложения</div>
      <div style={{ fontSize:12, opacity:.8, marginBottom:8 }}>Выберите цвет фона: пресеты ниже или пальцем по палитре.</div>

      {/* Row with label and swatch */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <div style={{ flex:1, fontWeight:600 }}>Цвет фона</div>
        <button onClick={()=>{ prevRef.current = value; setOpen(true); }} title="Выбрать цвет"
          style={{ width:32, height:32, borderRadius:8, border:'1px solid #2a3346', background:value, cursor:'pointer' }} />
      </div>

      {/* Presets */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(8, 1fr)', gap:8 }}>
        {presets.map(c => (
          <button key={c} onClick={() => { setValue(c); const rgb = hexToRgb(c); if (rgb) { const t = rgbToHsv(rgb.r,rgb.g,rgb.b); setH(Math.round(t.h)); setS(t.s); setV(t.v);} }} title={c}
            style={{ height:28, borderRadius:8, border: value===c ? '2px solid #8aa0ff' : '1px solid #2a3346', background:c, color:'#e8eaed', cursor:'pointer' }}>
            {value===c ? '✓' : ''}
          </button>
        ))}
      </div>

      {/* Manual input + save */}
      <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:10 }}>
        <div title="текущий цвет" style={{ width:28, height:28, borderRadius:8, border:'1px solid #2a3346', background:value }} />
        <input
          type="text"
          placeholder="#RRGGBB"
          value={value}
          onChange={(e)=>{
            const v = e.target.value; setValue(v);
            const rgb = hexToRgb(v); if (rgb) { const t = rgbToHsv(rgb.r,rgb.g,rgb.b); setH(Math.round(t.h)); setS(t.s); setV(t.v); }
          }}
          style={{ flex:1, padding:'8px 10px', borderRadius:8, background:'#0b1220', color:'#e8eaed', border:'1px solid #2a3346' }}
        />
        <button onClick={()=>save(value)} disabled={!/^#([0-9a-fA-F]{6})$/.test(value) || saving} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: saving?0.6:1 }}>
          Сохранить
        </button>
      </div>

      {/* Modal picker */}
      {open && (
        <div onClick={()=>{ setOpen(false); setValue(prevRef.current); }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={(e)=>e.stopPropagation()} style={{ width:'min(520px, 92vw)', background:'#1b2030', border:'1px solid #2a3346', borderRadius:16, padding:16, color:'#e8eaed' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ fontWeight:700, fontSize:16 }}>Выбор цвета</div>
              <button onClick={()=>{ setOpen(false); setValue(prevRef.current); }} style={{ background:'transparent', border:'none', color:'#9ca3af', fontSize:18, cursor:'pointer' }} aria-label="Закрыть">✕</button>
            </div>
            <div style={{ display:'grid', gap:12 }}>
              <HexColorPicker color={value || '#0b1220'} onChange={(c)=>setValue(/^#/.test(c)?c:('#'+c))} />
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ width:28, height:28, borderRadius:8, border:'1px solid #2a3346', background:value }} />
                <input value={value} onChange={(e)=>setValue(e.target.value)} style={{ flex:1, padding:'8px 10px', borderRadius:8, background:'#0b1220', color:'#e8eaed', border:'1px solid #2a3346' }} />
                <button onClick={async()=>{ await save(value); setOpen(false); prevRef.current = value; }} disabled={!/^#([0-9a-fA-F]{6})$/.test(value) || saving}
                  style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: saving?0.6:1 }}>Готово</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
