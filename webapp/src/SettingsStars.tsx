import { useEffect, useState } from 'react';
import { getPayoutMethod, setPayoutMethod, getStarsSummary } from './api';

export default function SettingsStars({ chatId }: { chatId: string }) {
  const [received, setReceived] = useState(0);
  const [sent, setSent] = useState(0);
  const [phone, setPhone] = useState('');
  const [bank, setBank] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getStarsSummary(chatId);
        if (s?.ok) { setReceived(s.received); setSent(s.sent); }
        const pm = await getPayoutMethod(chatId);
        if (pm?.ok && pm.method) { setPhone(pm.method.phone || ''); setBank(pm.method.bankCode || ''); }
      } catch {}
    })();
  }, [chatId]);

  const save = async () => {
    if (!phone.trim()) return;
    setBusy(true);
    try { await setPayoutMethod(chatId, phone.trim(), bank.trim() || undefined); } finally { setBusy(false); }
  };

  return (
    <div style={{ background:'#1b2030', border:'1px solid #2a3346', borderRadius:16, padding:12, display:'grid', gap:12 }}>
      <div>
        <div style={{ fontWeight:700, marginBottom:4 }}>Звёзды</div>
        <div style={{ display:'flex', gap:12 }}>
          <div>Получил: <b>{received}</b></div>
          <div>Отправил: <b>{sent}</b></div>
        </div>
      </div>
      <div>
        <div style={{ fontWeight:700, marginBottom:4 }}>Способ получения (СБП)</div>
        <div style={{ display:'grid', gap:8 }}>
          <input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="Телефон для СБП" style={{ background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:10, padding:'8px 10px' }} />
          <input value={bank} onChange={(e)=>setBank(e.target.value)} placeholder="Банк (опц.)" style={{ background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:10, padding:'8px 10px' }} />
          <div>
            <button onClick={save} disabled={busy || !phone.trim()} style={{ padding:'8px 12px', borderRadius:10, background:'#2563eb', color:'#fff', border:'1px solid transparent' }}>{busy? 'Сохраняю…':'Сохранить'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

