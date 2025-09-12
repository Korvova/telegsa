import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  initial?: number;
  onApply: (amount: number, approxRub?: number) => void;
  onClose: () => void;
};

export default function BountyPicker({ open, initial = 0, onApply, onClose }: Props) {
  const [amount, setAmount] = useState<number>(initial || 0);
  const [custom, setCustom] = useState<string>(initial && ![1,10,100].includes(initial) ? String(initial) : '');
  const feeBps = 100; // 1%
  const parsed = custom.trim() ? Math.max(0, parseFloat(custom.trim() || '0')) : amount;
  const fee = Math.round((parsed * feeBps)) / 10000; // show to 4 dp for display
  const total = parsed + fee;
  const [tonRub, setTonRub] = useState<number | null>(null);
  const approx = (n: number) => tonRub ? Math.round(n * tonRub) : null;

  useEffect(() => {
    if (!open) return;
    setAmount(initial || 0);
    setCustom(initial && ![1,10,100].includes(initial) ? String(initial) : '');
    // fetch rates
    (async () => {
      try {
        const r = await fetch('/telegsar-api/bounty/rates');
        const j = await r.json().catch(()=>({}));
        if (j?.ok && Number.isFinite(j.tonRub)) setTonRub(Number(j.tonRub));
        else setTonRub(null);
      } catch { setTonRub(null); }
    })();
  }, [open, initial]);

  if (!open) return null;
  const pick = (n: number) => { setAmount(n); setCustom(''); };
  const apply = () => {
    const val = custom.trim() ? parseFloat(custom.trim()) : amount;
    const n = Number.isFinite(val) && val > 0 ? val : 0;
    onApply(n, approx(n) ?? undefined);
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(420px,92vw)' }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>⭐ Укажите сумму вознаграждения</div>
        <div style={{ display:'grid', gap:8 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}><input type="radio" checked={amount===1 && !custom} onChange={()=>pick(1)} /> 1 {tonRub ? `(≈ ${approx(1)} ₽)` : ''}</label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}><input type="radio" checked={amount===10 && !custom} onChange={()=>pick(10)} /> 10 {tonRub ? `(≈ ${approx(10)} ₽)` : ''}</label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}><input type="radio" checked={amount===100 && !custom} onChange={()=>pick(100)} /> 100 {tonRub ? `(≈ ${approx(100)} ₽)` : ''}</label>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="radio" checked={!!custom} onChange={()=>{ setAmount(0); setCustom(''); }} />
            <input value={custom} onChange={(e)=>setCustom(e.target.value)} placeholder="Другая сумма" inputMode="numeric" pattern="[0-9]*" style={{ flex:1, background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:8, padding:'8px 10px' }} />
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
          <div>Токен: TON (mainnet)</div>
          <div>Сумма: {parsed} TON {tonRub ? `(≈ ${approx(parsed)} ₽)` : ''}</div>
          <div>Комиссия (1%): {fee.toFixed(4)} TON {tonRub ? `(≈ ${approx(fee)} ₽)` : ''}</div>
          <div>Итого к оплате: <b>{total.toFixed(4)} TON</b> {tonRub ? `(≈ ${approx(total)} ₽)` : ''}</div>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:10 }}>
          <button onClick={onClose} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отмена</button>
          <button onClick={apply} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid transparent', background:'#2563eb', color:'#fff' }}>Применить</button>
        </div>
      </div>
    </div>
  );
}
