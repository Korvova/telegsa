import TonWalletConnect from './components/TonWalletConnect';

export default function SettingsStars({ chatId }: { chatId: string }) {
  return (
    <div style={{ background:'#1b2030', border:'1px solid #2a3346', borderRadius:16, padding:12, display:'grid', gap:12 }}>
      <div>
        <div style={{ fontWeight:700, marginBottom:4 }}>USDT и кошелёк</div>
        <div style={{ fontSize:12, opacity:0.85, marginBottom:8 }}>
          Подключите TON-кошелёк для пополнения вознаграждений и получения выплат.
        </div>
        <TonWalletConnect chatId={chatId} />
      </div>
    </div>
  );
}
