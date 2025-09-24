import { useEffect, useMemo, useRef, useState } from 'react';
import { useKeyboardInsets } from '../hooks/useKeyboardInsets';

type Variant = 'hook' | 'micro' | 'pos-above' | 'sticky-top' | 'textarea';

export default function SettingsKeyboardTest({ onBack }: { onBack: () => void }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const isiOS = useMemo(() => /iPad|iPhone|iPod/i.test(navigator.userAgent || ''), []);
  const [includeOffset, setIncludeOffset] = useState(true);
  const [stable, setStable] = useState(true);
  const { bottom } = useKeyboardInsets(true, wrapRef as any, 80, true, includeOffset, stable);
  const [variant, setVariant] = useState<Variant>('micro');

  // Micro-utility (vanilla vv.height+offsetTop)
  const microRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (variant !== 'micro') return;
    const el = microRef.current;
    const vv: any = (window as any).visualViewport;
    if (!el || !vv) return;
    let maxSeen = 0;
    let baseH = 0; // minimal vv.height while kb is open
    let freezeUpper = 0; // freeze keyboard top after initial settle window
    let lastKh = 0; // last kHeightOnly
    let raf = 0 as any;
    const update = () => {
      const vh = vv.height || 0;
      const vt = vv.offsetTop || 0;
      const kWithOffset = Math.max(0, window.innerHeight - (vh + vt)); // «полный» инсет
      // freeze baseline height once when keyboard opens; reset on close
      if (kWithOffset > 0) {
        if (baseH === 0) baseH = vh;
      } else {
        baseH = 0;
      }
      const h = baseH || vh;
      const kHeightOnly = Math.max(0, window.innerHeight - h);         // базовый верх клавиатуры
      lastKh = kHeightOnly;
      // Клапаны: не выше верхней кромки клавиатуры, и не ниже её (±люфт)
      const ALLOW_UP = 0;  // px — запрет подниматься выше
      const ALLOW_DOWN = 2; // px
      const frozenUpper = freezeUpper > 0 ? freezeUpper : kHeightOnly;
      const upper = frozenUpper + ALLOW_UP;
      const lower = Math.max(0, kHeightOnly - ALLOW_DOWN);
      const clamped = Math.max(lower, Math.min(kWithOffset, upper));
      // stable: предотвращаем внезапные просадки вниз, но не даём подняться выше upper
      if (clamped > 0) maxSeen = Math.max(maxSeen, clamped); else maxSeen = 0;
      let k = stable ? Math.max(clamped, Math.min(maxSeen, upper)) : clamped;
      k = Math.max(lower, Math.min(k, upper));
      el.style.transform = k > 0 ? `translateY(-${k}px)` : 'translateY(0)';
    };
    const startFollow = () => {
      freezeUpper = 0; // reset freeze; will capture at the end of follow window
      const endAt = performance.now() + 900; // активно следим ~0.9s
      cancelAnimationFrame(raf);
      const loop = () => {
        update();
        if (performance.now() < endAt) raf = requestAnimationFrame(loop);
        else {
          // capture final keyboard top for the rest of the session until kb hides
          if (lastKh > 0) freezeUpper = lastKh;
        }
      };
      raf = requestAnimationFrame(loop);
    };
    const onAny = () => { update(); startFollow(); };

    vv.addEventListener('resize', onAny);
    vv.addEventListener('scroll', onAny);
    document.addEventListener('focusin', onAny, true);
    document.addEventListener('focusout', onAny, true);
    document.addEventListener('click', onAny, true);
    document.addEventListener('touchstart', onAny, { capture: true, passive: true } as any);
    window.addEventListener('orientationchange', onAny);
    // мгновенно при монтировании
    update();
    startFollow();
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', onAny);
      vv.removeEventListener('scroll', onAny);
      document.removeEventListener('focusin', onAny, true);
      document.removeEventListener('focusout', onAny, true);
      document.removeEventListener('click', onAny, true);
      document.removeEventListener('touchstart', onAny, { capture: true } as any);
      window.removeEventListener('orientationchange', onAny);
    };
  }, [variant, stable]);

  // pos-above-keyboard approach: adjust bottom instead of transform
  const posAboveRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (variant !== 'pos-above') return;
    const el = posAboveRef.current;
    const vv: any = (window as any).visualViewport;
    if (!el || !vv) return;
    let baseH = vv.height; // baseline stored once (as в примере)
    const update = () => {
      // keep baseH on iOS (do not update while keyboard animates)
      if (!isiOS) baseH = vv.height;
      const delta = Math.max(0, baseH - (vv.height || 0));
      el.style.bottom = `calc(${10 + delta}px + env(safe-area-inset-bottom, 0px))`;
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [variant, isiOS]);

  return (
    <div ref={wrapRef} style={{ background:'#0b1220', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:16, padding:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <button onClick={onBack} style={{ background:'transparent', border:'1px solid #2a3346', color:'#e8eaed', borderRadius:8, padding:'6px 10px', cursor:'pointer' }}>← Назад</button>
        <div style={{ fontWeight:800 }}>🧪 Тест клавиатуры (iOS веб)</div>
      </div>

      <div style={{ lineHeight:1.55, opacity:.95 }}>
        {Array.from({ length: 30 }).map((_,i)=> (
          <p key={i} style={{ margin:'8px 0' }}>
            Текст #{i+1}. Прокрутите страницу вверх/вниз, затем нажмите в поле ввода — панель ввода должна «прилипнуть» над клавиатурой.
          </p>
        ))}
      </div>

      {/* Переключение вариантов */}
      <div style={{ position:'sticky', top:0, zIndex:5, background:'#0b1220', paddingBottom:8 }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {([
            ['hook','Hook (vv height/offset via useKeyboardInsets)'],
            ['micro','Micro (vv height+offset, vanilla)'],
            ['pos-above','pos-above (bottom adjust)'],
            ['sticky-top','Sticky top (top:0)'],
            ['textarea','Textarea (iOS autofocus)'],
          ] as [Variant,string][]).map(([k,label]) => (
            <button key={k} onClick={()=>setVariant(k)} style={{
              padding:'6px 10px', borderRadius:999, border:'1px solid #2a3346',
              background: variant===k ? '#2563eb' : '#202840', color: variant===k ? '#fff' : '#e8eaed', cursor:'pointer'
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Вариант 1: Hook (transform by kb) */}
      {variant==='hook' && (
      <div
        style={{
          position:'fixed', left:10, right:10, bottom:0, zIndex:10000,
          transform: `translate3d(0, -${isiOS ? bottom : 0}px, 0)`,
          transition: 'transform 80ms ease-out',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div style={{ display:'flex', gap:8, alignItems:'center', background:'#111827', border:'1px solid #2a3346', borderRadius:12, padding:8 }}>
          <input
            placeholder="Сообщение…"
            style={{ flex:1, background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:8, padding:'10px 12px', fontSize:16 }}
            onFocus={()=>{ try { window.scrollTo({ top: 0, behavior:'smooth' }); } catch {} }}
          />
          <button style={{ padding:'10px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отпр.</button>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:8, opacity:.85, fontSize:12 }}>
          <label style={{ display:'flex', alignItems:'center', gap:6 }}>
            <input type="checkbox" checked={includeOffset} onChange={e=>setIncludeOffset(e.target.checked)} /> height + offsetTop
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:6 }}>
            <input type="checkbox" checked={stable} onChange={e=>setStable(e.target.checked)} /> stable (не опускать при панорамировании)
          </label>
          <span style={{ marginLeft:'auto' }}>kb: {Math.round(bottom)} px</span>
        </div>
      </div>
      )}

      {/* Вариант 2: Micro-utility (vanilla) */}
      {variant==='micro' && (
        <div ref={microRef} style={{ position:'fixed', left:10, right:10, bottom:0, zIndex:10000, transform:'translate3d(0,0,0)', transition:'none', paddingBottom:'env(safe-area-inset-bottom, 0px)' }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', background:'#111827', border:'1px solid #2a3346', borderRadius:12, padding:8 }}>
            <input placeholder="Сообщение…" style={{ flex:1, background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:8, padding:'10px 12px', fontSize:16 }} />
            <button style={{ padding:'10px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отпр.</button>
          </div>
        </div>
      )}

      {/* Вариант 3: pos-above-keyboard (adjust bottom) */}
      {variant==='pos-above' && (
        <div ref={posAboveRef} style={{ position:'fixed', left:0, right:0, bottom:'10px', zIndex:10000 }}>
          <div style={{ margin:'0 10px', display:'flex', gap:8, alignItems:'center', background:'#111827', border:'1px solid #2a3346', borderRadius:12, padding:8 }}>
            <input placeholder="Сообщение…" style={{ flex:1, background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:8, padding:'10px 12px', fontSize:16 }} />
            <button style={{ padding:'10px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отпр.</button>
          </div>
        </div>
      )}

      {/* Вариант 4: Sticky top (не над клавиатурой, но не уезжает при скролле) */}
      {variant==='sticky-top' && (
        <div style={{ position:'sticky', top:0, zIndex:5, background:'#0b1220', padding:'8px 0' }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', background:'#111827', border:'1px solid #2a3346', borderRadius:12, padding:8 }}>
            <input placeholder="Sticky сверху…" style={{ flex:1, background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:8, padding:'10px 12px', fontSize:16 }} />
            <button style={{ padding:'10px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отпр.</button>
          </div>
        </div>
      )}

      {/* Вариант 5: Textarea с iOS-only autofocus */}
      {variant==='textarea' && (
        <div style={{ position:'fixed', left:10, right:10, bottom:0, zIndex:10000, transform:`translate3d(0, -${isiOS?bottom:0}px, 0)`, transition:'transform 80ms ease-out', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div style={{ background:'#111827', border:'1px solid #2a3346', borderRadius:12, padding:8 }}>
            <textarea rows={4} wrap='hard' placeholder='Сообщение…' autoFocus={isiOS} style={{ width:'100%', boxSizing:'border-box', background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:8, padding:'10px 12px', fontSize:16 }} />
          </div>
        </div>
      )}
    </div>
  );
}
