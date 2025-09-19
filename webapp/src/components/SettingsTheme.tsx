import { useEffect, useMemo, useRef, useState } from 'react';

const API = (import.meta as any).env.VITE_API_BASE || '';

// ---- color utils ----
function clamp(n: number, min = 0, max = 1) { return Math.min(max, Math.max(min, n)); }
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
  // picker state
  const [h, setH] = useState(210); // default blue-ish
  const [s, setS] = useState(0.5);
  const [v, setV] = useState(0.25);

  const svRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);

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
  const onSVPointer = (e: React.PointerEvent) => {
    const el = svRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width);
    const y = clamp((e.clientY - rect.top) / rect.height);
    setS(x); setV(1 - y);
  };
  const onHuePointer = (e: React.PointerEvent) => {
    const el = hueRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width);
    setH(Math.round(x * 360));
  };

  const handleDownFactory = (move: (e: React.PointerEvent) => void) => (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    (target as any).setPointerCapture?.(e.pointerId);
    move(e);
    const onMove = (ev: any) => move(ev);
    const onUp = () => {
      try { (target as any).releasePointerCapture?.(e.pointerId); } catch {}
      window.removeEventListener('pointermove', onMove as any);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove as any);
    window.addEventListener('pointerup', onUp);
  };

  // computed styles
  const svBg = {
    background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), hsl(${h}, 100%, 50%)`
  } as React.CSSProperties;
  const svKnob = { left: `${s*100}%`, top: `${(1-v)*100}%` } as React.CSSProperties;
  const hueBg = {
    background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'
  } as React.CSSProperties;
  const hueKnob = { left: `${(h/360)*100}%` } as React.CSSProperties;

  return (
    <div style={{ background:'#121722', border:'1px solid #2a3346', borderRadius:12, padding:12 }}>
      <div style={{ fontWeight:600, marginBottom:6 }}>Фон приложения</div>
      <div style={{ fontSize:12, opacity:.8, marginBottom:8 }}>Выберите цвет фона: пресеты ниже или пальцем по палитре.</div>

      {/* Picker */}
      <div style={{ display:'grid', gap:8, marginBottom:10 }}>
        <div
          ref={svRef}
          onPointerDown={handleDownFactory(onSVPointer)}
          style={{ position:'relative', width:'100%', height:160, borderRadius:12, border:'1px solid #2a3346', ...svBg }}
        >
          <div style={{ position:'absolute', width:14, height:14, borderRadius:999, border:'2px solid #fff', boxShadow:'0 0 0 1px #0006', transform:'translate(-50%, -50%)', ...svKnob }} />
        </div>
        <div
          ref={hueRef}
          onPointerDown={handleDownFactory(onHuePointer)}
          style={{ position:'relative', height:16, borderRadius:999, border:'1px solid #2a3346', ...hueBg }}
        >
          <div style={{ position:'absolute', top:'50%', transform:'translate(-50%, -50%)', width:12, height:20, borderRadius:4, border:'2px solid #fff', boxShadow:'0 0 0 1px #0006', background:'transparent', ...hueKnob }} />
        </div>
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
    </div>
  );
}
