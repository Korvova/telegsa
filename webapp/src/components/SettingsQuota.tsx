import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';

type QuotaSummary = {
  ok: boolean;
  totalCapacity: number;
  usage: { tasks: number; events: number; pretasks: number; total: number };
  available: number;
};

export default function SettingsQuota({ chatId }: { chatId: string }) {
  const [data, setData] = useState<QuotaSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/quota?chatId=${encodeURIComponent(chatId)}`).then(r=>r.json());
      setData(r);
      setError(null);
    } catch (e:any) {
      setError(e?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [chatId]);

  const label = () => {
    const cap = data?.totalCapacity ?? 0;
    return `Вам доступно ${cap} задач.`;
  };

  return (
    <div style={{ border:'1px solid #2a3346', borderRadius:12, padding:12, background:'#1b2030' }}>
      <div style={{ fontWeight:700, marginBottom:6 }}>Лимит на создание</div>
      {loading ? <div style={{ opacity:.8 }}>Загрузка…</div> : null}
      {error ? <div style={{ color:'#ffb4b4' }}>{error}</div> : null}
      {data && (
        <div style={{ display:'grid', gap:6 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div>{label()}</div>
            <button onClick={() => setBuyOpen(true)} style={{ background:'transparent', border:'none', color:'#8aa0ff', cursor:'pointer' }}>(Увеличить)</button>
          </div>
          <div style={{ fontSize:13, opacity:.9 }}>Создано:</div>
          <div style={{ fontSize:13, opacity:.9 }}>Задач: {data.usage.tasks}</div>
          <div style={{ fontSize:13, opacity:.9 }}>Событий: {data.usage.events}</div>
          <div style={{ fontSize:13, opacity:.9 }}>Предзадач: {data.usage.pretasks}</div>
          <div style={{ fontSize:13, opacity:.9 }}>Итого: {data.usage.total}</div>
          <div style={{ fontSize:13, opacity:1, marginTop:6 }}>Доступно: {data.available} <button onClick={() => setBuyOpen(true)} style={{ background:'transparent', border:'none', color:'#8aa0ff', cursor:'pointer' }}>(Увеличить)</button></div>
        </div>
      )}

      {buyOpen && (
        <div onClick={() => setBuyOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={(e)=>e.stopPropagation()} style={{ width:'min(420px,92vw)', background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontWeight:800 }}>Пополнить лимит</div>
              <button onClick={() => setBuyOpen(false)} style={{ background:'transparent', border:'none', color:'#9ca3af', fontSize:18, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ display:'grid', gap:8 }}>
              {[{pack:100, stars:100},{pack:1000, stars:500},{pack:5000, stars:1000}].map(p => (
                <button
                  key={p.pack}
                  onClick={async () => {
                    try {
                      const r = await fetch(`${import.meta.env.VITE_API_BASE}/quota/purchase`, {
                        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId, pack: p.pack }),
                      }).then(r=>r.json());
                      const link = (r as any)?.invoiceLink;
                      if (link) {
                        try {
                          if ((WebApp as any)?.openInvoice) {
                            (WebApp as any).openInvoice(link, async (status:any) => {
                              try { console.log('[invoice:quota][settings] status', status); } catch {}
                              if (status === 'paid') {
                                alert('Оплата прошла. Обновляю лимит…');
                                await load();
                                setBuyOpen(false);
                                try { WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
                              } else if (status === 'cancelled') {
                                alert('Оплата отменена');
                              } else if (status === 'failed') {
                                alert('Оплата не прошла');
                              }
                            });
                          } else if (WebApp?.openTelegramLink) {
                            WebApp.openTelegramLink(link);
                          } else {
                            window.open?.(link, '_blank');
                          }
                        } catch {}
                      } else if ((r as any)?.ok && (r as any)?.devApplied) {
                        WebApp?.HapticFeedback?.notificationOccurred?.('success');
                        setBuyOpen(false);
                        await load();
                      } else {
                        alert('Покупка недоступна');
                      }
                    } catch {
                      alert('Не удалось пополнить лимит');
                    }
                  }}
                  style={{ padding:'10px 12px', borderRadius:12, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', textAlign:'left' }}
                >
                  +{p.pack} задач · {p.stars} ⭐️
                </button>
              ))}
            </div>
            <div style={{ fontSize:12, opacity:.75, marginTop:8 }}>Лимит увеличивается суммарно. Покупка постоянная.</div>
          </div>
        </div>
      )}
    </div>
  );
}
