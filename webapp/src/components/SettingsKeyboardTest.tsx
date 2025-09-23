import { useRef } from 'react';
import { useKeyboardInsets } from '../hooks/useKeyboardInsets';

export default function SettingsKeyboardTest({ onBack }: { onBack: () => void }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const isiOS = /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
  const { bottom } = useKeyboardInsets(true, wrapRef as any, 80, true, true);

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

      {/* фиксированный input, «прилипает» к клавиатуре */}
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
      </div>
    </div>
  );
}

