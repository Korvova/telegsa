import { useEffect, useState } from 'react';
import {
  getAITokenBalance,
  getAITokenPackages,
  createAITokenPurchase,
  createAITokenPaymentRequest,
  type AITokenBalance,
  type AITokenPackage,
} from '../api';

export default function SettingsAITokens({ chatId }: { chatId: string }) {
  const [balance, setBalance] = useState<AITokenBalance | null>(null);
  const [packages, setPackages] = useState<AITokenPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [balanceData, packagesData] = await Promise.all([
        getAITokenBalance(chatId),
        getAITokenPackages(),
      ]);
      setBalance(balanceData);
      setPackages(packagesData);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [chatId]);

  const formatBalance = () => {
    if (!balance) return '0';
    return balance.balance.toLocaleString();
  };

  const formatUSDT = () => {
    if (!balance) return '$0.00';
    // Примерная стоимость: 1M токенов ≈ $2 (с учетом средней цены и комиссии)
    const approxUSDT = (balance.balance / 1_000_000) * 2;
    return `$${approxUSDT.toFixed(2)}`;
  };

  const getStatusColor = () => {
    if (!balance) return '#9ca3af';
    if (balance.status === 'critical') return '#ef4444';
    if (balance.status === 'low') return '#f59e0b';
    return '#10b981';
  };

  const getStatusEmoji = () => {
    if (!balance) return '';
    if (balance.status === 'critical') return ' 🔴';
    if (balance.status === 'low') return ' ⚠️';
    return '';
  };

  /**
   * Handle TON/USDT payment for AI token purchase
   */
  const handlePurchase = async (pkg: AITokenPackage) => {
    if (paying) return;
    setPaying(true);

    try {
      // 1. Ensure TonConnect is available
      let tonAny: any = (window as any).ton;
      if (!tonAny?.sendTransaction) {
        try {
          const appOrigin = (import.meta as any).env?.VITE_PUBLIC_ORIGIN || location.origin;
          const mod: any = await import('@tonconnect/ui');
          const inst = new mod.TonConnectUI({
            manifestUrl: `${appOrigin}/tonconnect-manifest.json`,
          });
          (window as any).ton = inst;
          tonAny = inst;
        } catch (err) {
          console.error('Failed to load TonConnect:', err);
          alert('Не удалось загрузить TonConnect');
          setPaying(false);
          return;
        }
      }

      // 2. Check wallet status
      const walletStatus = await fetch(
        `/telegsar-api/wallet/ton/status?chatId=${encodeURIComponent(chatId)}`
      );
      const walletData = await walletStatus.json().catch(() => ({}));

      if (walletData?.network && walletData.network !== 'mainnet') {
        try {
          tonAny?.openModal?.();
        } catch {}
        alert('Кошелёк не в mainnet');
        setPaying(false);
        return;
      }

      if (!walletData?.connected) {
        try {
          tonAny?.openModal?.();
        } catch {}
        alert('Подключите тон-кошелёк');
        setPaying(false);
        return;
      }

      const ownerAddress = walletData?.address || '';
      if (!ownerAddress) {
        alert('Не удалось получить адрес кошелька');
        setPaying(false);
        return;
      }

      // 3. Create purchase record
      const purchaseResult = await createAITokenPurchase(chatId, pkg.usdt);
      const purchaseId = purchaseResult?.purchase?.id;

      // 4. Create payment request
      const paymentResult = await createAITokenPaymentRequest({
        chatId,
        ownerAddress,
        usdtAmount: pkg.usdt,
        purchaseId,
      });

      if (!paymentResult.ok || !paymentResult.transaction) {
        throw new Error('Failed to create payment transaction');
      }

      // 5. Send transaction via TonConnect
      const ton = (window as any).ton;
      if (!ton?.sendTransaction) {
        try {
          tonAny?.openModal?.();
        } catch {}
        throw new Error('TonConnect не инициализирован');
      }

      await ton.sendTransaction(paymentResult.transaction);

      // 6. Success! Reload balance
      alert(
        `Транзакция отправлена! Баланс обновится после подтверждения в блокчейне (обычно 1-2 минуты).`
      );
      setBuyOpen(false);

      // Reload balance after a delay
      setTimeout(() => {
        load();
      }, 3000);
    } catch (err: any) {
      console.error('Payment error:', err);
      const errorMsg = err?.message || 'Ошибка при оплате';

      if (errorMsg.includes('User declined the transaction')) {
        alert('Вы отклонили транзакцию');
      } else if (errorMsg.includes('jetton_wallet_not_found')) {
        alert('USDT кошелек не найден. Пополните USDT баланс в вашем кошельке.');
      } else if (errorMsg.includes('tonapi_failed')) {
        alert('Ошибка связи с TON API. Попробуйте позже.');
      } else {
        alert(`Ошибка: ${errorMsg}`);
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <div
      style={{
        border: '1px solid #D1D5DB',
        borderRadius: 12,
        padding: 12,
        background: 'linear-gradient(180deg, #e5e7eb, #cbd5e1)',
        color: '#374151',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Баланс ИИ</div>
      {loading ? <div style={{ opacity: 0.8 }}>Загрузка…</div> : null}
      {error ? <div style={{ color: '#ffb4b4' }}>{error}</div> : null}
      {balance && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ color: getStatusColor(), fontWeight: 600 }}>
              {formatBalance()} токенов{getStatusEmoji()}
            </div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              ({formatUSDT()})
            </div>
          </div>
          <button
            onClick={() => setBuyOpen(true)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #667eea',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            Пополнить
          </button>
          {balance.lastUsage && (
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              Последнее использование: {balance.lastUsage.totalTokens} токенов
            </div>
          )}
        </div>
      )}

      {buyOpen && (
        <div
          onClick={() => setBuyOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.45)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(420px,92vw)',
              background: '#1b2030',
              color: '#e8eaed',
              border: '1px solid #2a3346',
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 800 }}>Пополнить токены ИИ</div>
              <button
                onClick={() => setBuyOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9ca3af',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
              Выберите пакет токенов для AI-помощника процессов:
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {packages.map((pkg) => (
                <button
                  key={pkg.tokens}
                  onClick={() => handlePurchase(pkg)}
                  disabled={paying}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: pkg.recommended ? '2px solid #667eea' : '1px solid #D1D5DB',
                    background: pkg.recommended
                      ? 'linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)'
                      : '#f3f4f6',
                    color: '#374151',
                    textAlign: 'left',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {pkg.label}
                        {pkg.recommended && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 11,
                              background: '#667eea',
                              color: '#fff',
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                          >
                            Рекомендуем
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                        {pkg.tokens.toLocaleString()} токенов
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#667eea' }}>
                      ${pkg.usdt}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 12 }}>
              Токены используются при работе с AI-помощником создания процессов.
              <br />
              GPT-4o mini: Input $0.25, Output $2.00 за 1M токенов + комиссия 20%.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
