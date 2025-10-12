import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  // initial in TON for backward compatibility
  initial?: number;
  // optional initial RUB value if known
  initialRub?: number | null;
  onApply: (amountTon: number, approxRub?: number) => void;
  onClose: () => void;
};

export default function BountyPicker({ open, initial = 0, initialRub = null, onApply, onClose }: Props) {
  // TON/RUB rate (RUB per 1 TON)
  const [tonRub, setTonRub] = useState<number | null>(null);
  const feeBps = 100; // 1%

  // Selected RUB amount (100 / 500 / 1000 or custom)
  const [rubSelected, setRubSelected] = useState<number>(0);
  const [customRub, setCustomRub] = useState<string>('');

  // Initialize on open
  useEffect(() => {
    if (!open) return;
    // set initial RUB either from prop or convert from initial TON using rate later
    if (typeof initialRub === 'number' && initialRub > 0) {
      setRubSelected(Math.round(initialRub));
      setCustomRub('');
    } else {
      // if only TON provided and rate not yet known, wait for rate fetch then compute
      if (initial > 0 && tonRub) {
        const rub = Math.round(initial * tonRub);
        setRubSelected(rub);
        setCustomRub('');
      } else {
        setRubSelected(0);
        setCustomRub('');
      }
    }
    // fetch rates
    (async () => {
      try {
        const r = await fetch('/telegsar-api/bounty/rates');
        const j = await r.json().catch(()=>({}));
        if (j?.ok && Number.isFinite(j.tonRub)) setTonRub(Number(j.tonRub));
        else setTonRub(null);
      } catch { setTonRub(null); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // If rate arrives and we only had initial TON — compute RUB lazily
  useEffect(() => {
    if (!open) return;
    if (rubSelected === 0 && !customRub && initial > 0 && tonRub) {
      const rub = Math.round(initial * tonRub);
      setRubSelected(rub);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tonRub]);

  if (!open) return null;

  const setPickRub = (n: number) => { setRubSelected(n); setCustomRub(''); };
  const rubValue = customRub.trim() ? Math.max(0, parseFloat(customRub.trim() || '0')) : rubSelected;
  const amountTon = tonRub && rubValue > 0 ? (rubValue / tonRub) : 0;
  const feeTonRaw = amountTon * feeBps / 10000;
  const feeTon = Math.ceil(feeTonRaw * 1e4) / 1e4; // show 4 dp rounded up
  const totalTon = amountTon + feeTon;

  const tonFmt = (v: number) => v.toFixed(4);
  const approxTon = (rub: number) => (tonRub ? (rub / tonRub) : null);

  const apply = async () => {
    if (!tonRub || rubValue <= 0) { onClose(); return; }
    // Ограничим точность до 9 знаков после запятой (nanoTON)
    const amountClamped = Math.floor(amountTon * 1e9) / 1e9;
    // Call onApply (which may be async) and DON'T close immediately
    // Let the parent decide when to close based on payment success
    await onApply(amountClamped, rubValue);
    // Don't close here - parent will close after successful payment
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(460px,92vw)' }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>💵 Укажите сумму в рублях</div>
        <div style={{ display:'grid', gap:8 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="radio" checked={rubSelected===100 && !customRub} onChange={()=>setPickRub(100)} /> 100 ₽ {tonRub ? `(≈ ${tonFmt(approxTon(100) || 0)} TON)` : ''}
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="radio" checked={rubSelected===500 && !customRub} onChange={()=>setPickRub(500)} /> 500 ₽ {tonRub ? `(≈ ${tonFmt(approxTon(500) || 0)} TON)` : ''}
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="radio" checked={rubSelected===1000 && !customRub} onChange={()=>setPickRub(1000)} /> 1000 ₽ {tonRub ? `(≈ ${tonFmt(approxTon(1000) || 0)} TON)` : ''}
          </label>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="radio" checked={!!customRub} onChange={()=>{ setRubSelected(0); setCustomRub(''); }} />
            <input value={customRub} onChange={(e)=>setCustomRub(e.target.value)} placeholder="Другая сумма (₽)" inputMode="numeric" pattern="[0-9]*" style={{ flex:1, background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:8, padding:'8px 10px' }} />
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
          <div>Сумма: {rubValue} ₽ {tonRub ? `(≈ ${tonFmt(amountTon)} TON)` : ''}</div>
          <div>Комиссия (1%): {tonRub ? `${tonFmt(feeTon)} TON (≈ ${Math.round(feeTon * tonRub)} ₽)` : '—'}</div>
          <div>Итого к оплате: <b>{tonRub ? `${tonFmt(totalTon)} TON` : '—'}</b> {tonRub ? `(≈ ${Math.round(totalTon * tonRub)} ₽)` : ''}</div>
          {!tonRub && <div style={{ color:'#fca5a5' }}>Курс TON/RUB недоступен. Попробуйте позже.</div>}
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:10 }}>
          <button onClick={onClose} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отмена</button>
          <button disabled={!tonRub || rubValue<=0} onClick={apply} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid transparent', background:(!tonRub || rubValue<=0)?'#3a3f5a':'#2563eb', color:'#fff' }}>Применить</button>
        </div>
      </div>
    </div>
  );
}
