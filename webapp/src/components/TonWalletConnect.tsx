import { useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';

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

  const short = (addr?: string | null) => {
    if (!addr) return '';
    return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
  };

  const connect = async () => {
    setLoading(true);
    try {
      // 1) get nonce from server
      const s = await fetch(`/telegsar-api/wallet/ton/connect-start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: me }) });
      const js = await s.json();
      if (!js?.ok) throw new Error('start_failed');

      // MVP: попросим пользователя ввести адрес и подпись (вместо полноценного TonConnect proof) — доработаем позже
      const address = prompt('Вставьте адрес TON (USDT будет в этом кошельке):')?.trim();
      if (!address) return;
      const signature = prompt('Вставьте подпись nonce для верификации (MVP, временно):')?.trim() || 'dummy';

      const v = await fetch(`/telegsar-api/wallet/ton/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: me, address, network: js.network || 'testnet', walletApp: 'unknown', signature })
      });
      const jv = await v.json();
      if (jv?.ok) await refresh();
      else alert('Не удалось подтвердить кошелек');
    } catch (e: any) {
      alert(e?.message || 'Ошибка подключения кошелька');
    } finally { setLoading(false); }
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
          <button disabled={loading} onClick={disconnect} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>Отключить</button>
        </>
      ) : (
        <button disabled={loading} onClick={connect} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>Подключить кошелек</button>
      )}
    </div>
  );
}

