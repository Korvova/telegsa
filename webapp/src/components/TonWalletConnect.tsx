import { useEffect, useMemo, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { TonConnectUI } from '@tonconnect/ui';

export default function TonWalletConnect({ chatId }: { chatId: string }) {
  const [status, setStatus] = useState<{ connected: boolean; address?: string | null; network?: string | null; walletApp?: string | null; verified?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const me = useMemo(() => String(chatId || WebApp?.initDataUnsafe?.user?.id || ''), [chatId]);

  async function refresh() {
    try {
      const r = await fetch(`/telegsar-api/wallet/ton/status?chatId=${encodeURIComponent(me)}`);
      const j = await r.json();
      setStatus(j);
    } catch {}
  }

  useEffect(() => { refresh(); }, [me]);

  // TonConnect UI instance
  const tcRef = useRef<TonConnectUI | null>(null);
  useEffect(() => {
    const appOrigin = (import.meta as any).env.VITE_PUBLIC_ORIGIN || location.origin;
    const inst = new TonConnectUI({ manifestUrl: `${appOrigin}/tonconnect-manifest.json` });
    tcRef.current = inst;
    try { (window as any).ton = inst; } catch {}
    const unsub = inst.onStatusChange(async (wallet) => {
      if (!wallet) { setStatus((s) => s ? { ...s, connected: false, address: null, verified: false } : { connected: false } as any); return; }
      // Connected → persist via backend verify (MVP)
      const address = wallet.account?.address;
      const chain = String(wallet.account?.chain || '');
      const network = chain === '-239' ? 'mainnet' : 'testnet';
      const walletApp = wallet.device?.appName || 'wallet';
      try {
        // start + verify (MVP without real proof)
        await fetch(`/telegsar-api/wallet/ton/connect-start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: me }) });
        await fetch(`/telegsar-api/wallet/ton/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: me, address, network, walletApp, signature: 'via-tonconnect' }) });
      } catch {}
      await refresh();
    });
    return () => { try { unsub(); } catch {} };
  }, [me]);

  const short = (addr?: string | null) => {
    if (!addr) return '';
    return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
  };

  const connect = async () => {
    setLoading(true);
    try { await tcRef.current?.openModal(); } catch (e:any) { alert(e?.message || 'Ошибка TonConnect'); }
    finally { setLoading(false); }
  };

  const disconnect = async () => {
    setLoading(true);
    try {
      await fetch(`/telegsar-api/wallet/ton/disconnect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: me }) });
      await refresh();
    } catch {} finally { setLoading(false); }
  };

  const connected = !!status?.connected;
  const verified = !!status?.verified;

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {connected ? (
        <>
          <span style={{ fontSize: 12, opacity: 0.9 }}>Кошелек: <b>{short(status?.address)}</b> ({status?.network || 'net'}) {verified ? '✓' : '✗'}</span>
          <button disabled={loading} onClick={async ()=>{ try { await tcRef.current?.disconnect(); } catch {}; await disconnect(); }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>Отключить</button>
        </>
      ) : (
        <button disabled={loading} onClick={connect} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>Подключить TON Connect</button>
      )}
    </div>
  );
}
