import { useEffect, useMemo, useState } from 'react';

const API = (import.meta as any).env.VITE_API_BASE || '';

export default function SettingsTheme({ chatId }: { chatId: string }) {
  const [value, setValue] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // load current from API
  useEffect(() => {
    (async () => {
      const r = await fetch(`${API}/me/theme?chatId=${encodeURIComponent(chatId)}`).then(r=>r.json()).catch(()=>({ ok:false }));
      if (r?.ok) setValue(r.themeBg || '');
    })();
  }, [chatId]);

  // apply to document
  useEffect(() => {
    const bg = value && /^#([0-9a-fA-F]{6})$/.test(value) ? value : '#0b1220';
    try { document.documentElement.style.setProperty('--app-bg', bg); } catch {}
    try { document.body.style.background = bg; } catch {}
  }, [value]);

  const presets = useMemo(() => [
    '#0b1220','#101827','#121722','#1b2030','#202840','#0f172a','#111827','#1f2937',
    '#222222','#000000','#1a1a1a','#131313',
    '#0b1020','#08121f','#0c1a24',
    '#0a1f1a','#0f1d12','#0d1a0f',
    '#1a140d','#1a0f0d','#1a0d14',
    '#16213e','#0f3460','#1b1a55','#2d3250'
  ], []);

  const save = async (v: string) => {
    try {
      setSaving(true);
      const r = await fetch(`${API}/me/theme`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, value: v })
      }).then(r=>r.json());
      if (r?.ok) setValue(r.themeBg || ''); else throw new Error('save_failed');
    } catch { alert('Не удалось сохранить цвет'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background:'#121722', border:'1px solid #2a3346', borderRadius:12, padding:12 }}>
      <div style={{ fontWeight:600, marginBottom:6 }}>Фон приложения</div>
      <div style={{ fontSize:12, opacity:.8, marginBottom:8 }}>Выберите цвет фона. По умолчанию тёмный.</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(8, 1fr)', gap:8 }}>
        {presets.map(c => (
          <button key={c} onClick={() => save(c)} title={c}
            style={{ height:28, borderRadius:8, border: value===c ? '2px solid #8aa0ff' : '1px solid #2a3346', background:c, color:'#e8eaed', cursor:'pointer' }}>
            {value===c ? '✓' : ''}
          </button>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:10 }}>
        <input
          type="text"
          placeholder="#RRGGBB"
          value={value}
          onChange={(e)=>setValue(e.target.value)}
          onBlur={()=>{ if (/^#([0-9a-fA-F]{6})$/.test(value)) save(value); }}
          style={{ flex:1, padding:'8px 10px', borderRadius:8, background:'#0b1220', color:'#e8eaed', border:'1px solid #2a3346' }}
        />
        <button onClick={()=>save(value)} disabled={!/^#([0-9a-fA-F]{6})$/.test(value) || saving} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', opacity: saving?0.6:1 }}>
          Сохранить
        </button>
      </div>
    </div>
  );
}

