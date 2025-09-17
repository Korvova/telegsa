// Encapsulate TonConnect flow + server endpoints used for bounty
export default function useTonPayment(chatId: string) {
  async function ensureTon() {
    let tonAny: any = (window as any).ton;
    if (!tonAny?.sendTransaction) {
      try {
        const appOrigin = (import.meta as any).env?.VITE_PUBLIC_ORIGIN || location.origin;
        const mod: any = await import('@tonconnect/ui');
        const inst = new mod.TonConnectUI({ manifestUrl: `${appOrigin}/tonconnect-manifest.json` });
        (window as any).ton = inst;
        tonAny = inst;
      } catch {}
    }
    return tonAny;
  }

  async function loadWalletStatus() {
    const st = await fetch(`/telegsar-api/wallet/ton/status?chatId=${encodeURIComponent(chatId)}`);
    const sj = await st.json().catch(()=>({}));
    return sj;
  }

  async function startPayment(amountTon: number, amountRub: number | null, taskId?: string | null) {
    const tonAny = await ensureTon();
    const sj = await loadWalletStatus();
    if (sj?.network && sj.network !== 'mainnet') { try{tonAny?.openModal?.();}catch{}; throw new Error('Кошелёк не в mainnet'); }
    if (!sj?.connected) { try{tonAny?.openModal?.();}catch{}; throw new Error('Подключите тон-кошелёк'); }
    const ownerAddress = sj?.address || '';
    const fr = await fetch('/telegsar-api/bounty/fund-request', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId, ownerAddress, amount: amountTon, taskId: taskId || null }) });
    const fj = await fr.json().catch(()=>({ ok:false, error:'internal' }));
    if (!fr.ok || !fj?.ok) throw new Error(String(fj?.error || `http_${fr.status}`));
    const ton = (window as any).ton;
    if (!ton?.sendTransaction) { try{tonAny?.openModal?.();}catch{}; throw new Error('TonConnect не инициализирован'); }
    await ton.sendTransaction(fj.transaction);
    // persist draft after wallet accepted.
    try { await fetch('/telegsar-api/bounty/draft/set', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId, amountTon, amountRub: amountRub ?? undefined }) }); } catch {}
  }

  async function refund(amountTon: number) {
    const sj = await loadWalletStatus();
    const ownerAddress = sj?.address || '';
    const rr = await fetch('/telegsar-api/bounty/refund-request', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId, ownerAddress, amount: amountTon }) });
    const rj = await rr.json().catch(()=>({ ok:false, error:'internal' }));
    if (!rr.ok || !rj?.ok) throw new Error(String(rj?.error || `http_${rr.status}`));
    try { await fetch('/telegsar-api/bounty/draft/clear', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId }) }); } catch {}
  }

  async function loadDraft() {
    try {
      const r = await fetch(`/telegsar-api/bounty/draft/get?chatId=${encodeURIComponent(chatId)}`);
      const j = await r.json().catch(()=>({}));
      return j?.draft || null;
    } catch { return null; }
  }

  async function clearDraft() {
    try { await fetch('/telegsar-api/bounty/draft/clear', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chatId }) }); } catch {}
  }

  return { startPayment, refund, loadDraft, clearDraft };
}

