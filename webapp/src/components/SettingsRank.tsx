// webapp/src/components/SettingsRank.tsx
import { useEffect, useMemo, useState } from 'react';
import OverlayModal from './OverlayModal';
import { getRankInfo, createRankPurchase, createRankPaymentRequest, type RankInfo } from '../api';
import { RANKS } from './Achievements';

type RankCode =
  | 'ANT' | 'FISH' | 'SCORPION' | 'SQUIRREL' | 'CAT' | 'DOG' | 'WOLF' | 'BEAR'
  | 'EAGLE' | 'HORSE' | 'DRAGON' | 'SHARK' | 'ELEPHANT' | 'TREX' | 'TIGER' | 'LION';

function findRank(code?: string | null) {
  const c = String(code || 'ANT').toUpperCase() as RankCode;
  return RANKS.find(r => r.code === c) || RANKS[0];
}

export default function SettingsRank({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  const [rankInfo, setRankInfo] = useState<RankInfo | null>(null);
  const [buying, setBuying] = useState(false);
  const [openRanks, setOpenRanks] = useState<Record<string, boolean>>({});

  const current = useMemo(() => findRank(rankInfo?.activeRank), [rankInfo]);

  const toggleRank = (code: string) => setOpenRanks((m) => ({ ...m, [code]: !m[code] }));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const info = await getRankInfo(chatId);
        if (alive) setRankInfo(info);
      } catch (e) {
        console.error('Failed to load rank info:', e);
        if (alive) setRankInfo(null);
      }
    })();
    return () => { alive = false; };
  }, [chatId]);

  const handlePurchase = async (rankCode: string, priceRub: number) => {
    if (buying) return;
    setBuying(true);

    try {
      // 1. Check TON wallet connection
      const ton = (window as any).ton;
      if (!ton?.sendTransaction) {
        alert('Подключите TON кошелёк в настройках');
        setBuying(false);
        return;
      }

      // 2. Create purchase record
      console.log('[Rank] Creating purchase...', { chatId, rankCode, priceRub });
      const purchaseResult = await createRankPurchase(chatId, rankCode);
      console.log('[Rank] Purchase created:', purchaseResult);

      // 3. Create payment request
      console.log('[Rank] Creating payment request...', { rubAmount: String(priceRub) });
      const paymentResult = await createRankPaymentRequest({
        chatId,
        rubAmount: String(priceRub),
        purchaseId: purchaseResult.purchase.id,
      });
      console.log('[Rank] Payment request created:', paymentResult);

      // 4. Send transaction via TonConnect
      const txResult = await ton.sendTransaction(paymentResult.transaction);
      console.log('[Rank] Transaction sent:', txResult);

      // 5. Show success message
      alert(
        `✅ Транзакция отправлена!\n\nСумма: ${paymentResult.tonAmount} TON (~${priceRub}₽)\nКурс: ${paymentResult.tonRubRate.toFixed(2)}₽/TON\n\nРанг будет активирован через 10-20 секунд после подтверждения в блокчейне.`
      );

      setBuying(false);
      setOpen(false);

      // 6. Reload rank info after delay
      setTimeout(async () => {
        try {
          const updated = await getRankInfo(chatId);
          setRankInfo(updated);
        } catch (e) {
          console.error('Failed to reload rank info:', e);
        }
      }, 15000);
    } catch (error: any) {
      console.error('[Rank] Purchase error:', error);
      if (error?.message?.includes('User declined')) {
        alert('Транзакция отменена');
      } else {
        alert(`Ошибка: ${error?.message || 'Unknown error'}`);
      }
      setBuying(false);
    }
  };

  // Get active rank index
  const activeRankCode = rankInfo?.activeRank || 'ANT';
  const activeRankIndex = RANKS.findIndex((r) => r.code === activeRankCode);

  // Check if trial is active
  const trialActive = rankInfo?.trialEndsAt && new Date(rankInfo.trialEndsAt).getTime() > Date.now();
  const trialDaysLeft = trialActive ? Math.ceil((new Date(rankInfo!.trialEndsAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: 'linear-gradient(180deg, #e5e7eb, #cbd5e1)',
        color: '#374151',
        border: '1px solid #D1D5DB',
        borderRadius: 12,
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>{current.icon}</span>
        <div>
          <div style={{ fontWeight: 700 }}>Ваш ранг: {current.title}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Очки: {rankInfo?.score || 0}</div>
          {trialActive && (
            <div style={{ fontSize: 11, color: '#d97706', marginTop: 2 }}>
              🎁 Trial: {trialDaysLeft} {trialDaysLeft === 1 ? 'день' : 'дней'}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: '#f3f4f6',
          color: '#374151',
          border: '1px solid #D1D5DB',
          borderRadius: 10,
          padding: '8px 10px',
          cursor: 'pointer',
        }}
      >
        Повысить…
      </button>

      {open && (
        <OverlayModal open onClose={() => setOpen(false)} maxWidth={560}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <div style={{ fontWeight:800, fontSize:16 }}>Повышение ранга</div>
            <div style={{ marginLeft:'auto' }} />
            <button onClick={() => setOpen(false)} style={{ background:'transparent', border:'none', color:'#9fb1ff', cursor:'pointer', fontSize:18 }}>✖</button>
          </div>

          {trialActive && (
            <div style={{ fontSize:13, marginBottom:8, padding:'8px 10px', background:'rgba(255,215,0,0.1)', border:'1px solid rgba(255,215,0,0.3)', borderRadius:8, color:'#ffd700' }}>
              🎁 Trial период: осталось <b>{trialDaysLeft}</b> {trialDaysLeft === 1 ? 'день' : 'дней'}
            </div>
          )}

          {rankInfo?.purchasedRank && (
            <div style={{ fontSize:13, marginBottom:8, padding:'8px 10px', background:'rgba(102,126,234,0.1)', border:'1px solid rgba(102,126,234,0.3)', borderRadius:8, color:'#a5b4fc' }}>
              💎 Куплен ранг: {RANKS.find((r) => r.code === rankInfo.purchasedRank)?.icon} {RANKS.find((r) => r.code === rankInfo.purchasedRank)?.title}
            </div>
          )}

          <div style={{ fontSize:13, marginBottom:12, opacity:0.8 }}>
            Зарабатывайте 🦅 очки выполняя задачи или покупайте ранги навсегда
          </div>

          <div style={{ display:'grid', gap:8, maxHeight:'60vh', overflowY:'auto' }}>
            {RANKS.map((r, idx) => {
              const opened = !!openRanks[r.code];
              const canPurchase = r.priceRub && idx > activeRankIndex;
              const isActive = idx <= activeRankIndex;

              return (
                <div
                  key={r.code}
                  style={{
                    border:'1px solid #2a3346',
                    borderRadius:12,
                    overflow:'hidden',
                    background: isActive ? '#17203a' : '#121722'
                  }}
                >
                  <button
                    onClick={() => toggleRank(r.code)}
                    style={{
                      display:'flex',
                      alignItems:'center',
                      gap:10,
                      width:'100%',
                      textAlign:'left',
                      background:'transparent',
                      color:'#e8eaed',
                      border:'none',
                      padding:'10px 12px',
                      cursor:'pointer'
                    }}
                  >
                    <span style={{ fontSize:18 }}>{r.icon}</span>
                    <div style={{ fontWeight:600, flex:1 }}>{r.title} ({r.threshold}🦅)</div>
                    {isActive && <div style={{ fontSize:12, opacity:0.7 }}>✓ Доступен</div>}
                    {r.priceRub && !isActive && <div style={{ fontSize:11, opacity:0.6 }}>{(r.priceRub / 1000).toFixed(0)}K₽</div>}
                    <div style={{ opacity:0.9 }}>{opened ? '▲' : '▼'}</div>
                  </button>

                  {opened && (
                    <div style={{ padding:'0 12px 10px 38px' }}>
                      {r.perks && r.perks.length > 0 && (
                        <ul style={{ margin:0, marginBottom:8 }}>
                          {r.perks.map((p, i) => (<li key={i} style={{ fontSize:13, opacity:0.95, lineHeight:1.6 }}>{p}</li>))}
                        </ul>
                      )}
                      {canPurchase && (
                        <button
                          onClick={() => handlePurchase(r.code, r.priceRub!)}
                          disabled={buying}
                          style={{
                            background:'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color:'#fff',
                            border:'none',
                            borderRadius:8,
                            padding:'8px 12px',
                            fontSize:13,
                            fontWeight:600,
                            cursor: buying ? 'not-allowed' : 'pointer',
                            opacity: buying ? 0.6 : 1,
                          }}
                        >
                          {buying ? 'Обработка...' : `Купить за ${(r.priceRub! / 1000).toFixed(0)}K₽`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </OverlayModal>
      )}
    </div>
  );
}
