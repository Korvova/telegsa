import { useEffect, useRef, useState } from 'react';
import coinSfx from '../assets/coin.mp3';
import TonWalletConnect from './TonWalletConnect';

export default function PayoutPromptModal({
  open,
  taskId,
  amountRub,
  chatId,
  onPaid,
}: {
  open: boolean;
  taskId: string;
  amountRub: number;
  chatId: string;
  onPaid: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { if (!open) { setBusy(false); setDone(false); } }, [open]);

  // Play sound when payment is confirmed
  useEffect(() => {
    if (!done) return;
    try {
      if (!audioRef.current) audioRef.current = new Audio(coinSfx);
      const a = audioRef.current;
      a.currentTime = 0;
      a.volume = 1;
      a.play().catch(() => {});
    } catch {}
  }, [done]);

  if (!open) return null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex: 3000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(520px, 92vw)', display:'grid', gap:10 }}>
        {!done ? (
          <>
            <div style={{ fontWeight:700 }}>Задача завершена</div>
            <div>Получите вознаграждение: <b>{amountRub}</b> ₽</div>
            <div style={{ fontSize:12, opacity:0.85 }}>Если кошелька нет — подключите через TonConnect, затем нажмите «Ок».</div>
            <div><TonWalletConnect chatId={chatId} /></div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button
                disabled={busy}
                onClick={async () => {
                  try {
                    setBusy(true);
                    const r = await fetch('/telegsar-api/bounty/release-request', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ taskId }) });
                    const j = await r.json().catch(()=>({ ok:false, error:'internal' }));
                    if (!r.ok || !j?.ok) {
                      if (String(j?.error || '').includes('needs_wallet')) {
                        alert('Подключите TON-кошелёк и попробуйте ещё раз');
                        setBusy(false);
                        return;
                      }
                      alert(String(j?.error || `http_${r.status}`));
                      setBusy(false);
                      return;
                    }
                    setDone(true);
                  } catch (e:any) {
                    alert(e?.message || 'release_failed');
                  }
                }}
                style={{ padding:'8px 12px', borderRadius:10, background:'#2563eb', color:'#fff', border:'1px solid transparent', minWidth: 140 }}
              >{busy ? 'Отправляю…' : 'Ок'}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight:700 }}>Поздравляем!</div>
            <div>На ваш счёт поступил платёж.</div>
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button onClick={onPaid} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', minWidth: 120 }}>Ок</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
