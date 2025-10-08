import { useEffect, useState } from 'react';
import {
  getAITokenBalance,
  getAITokenPackages,
  createAITokenPurchase,
  createAITokenPaymentRequest,
  processPendingAITokenPurchases,
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
   * Handle TON payment for AI token purchase (simple TON transfer like bounty)
   */
  const handlePurchase = async (pkg: AITokenPackage) => {
    if (paying) return;
    setPaying(true);

    try {
      // 1. Check TonConnect
      const ton = (window as any).ton;
      if (!ton?.sendTransaction) {
        alert('Подключите TON кошелек в настройках');
        setPaying(false);
        return;
      }

      // 2. Create purchase record
      const purchaseResult = await createAITokenPurchase(chatId, pkg.usdt);
      const purchaseId = purchaseResult?.purchase?.id;

      // 3. Create payment request (converts USD to TON automatically)
      const paymentResult = await createAITokenPaymentRequest({
        chatId,
        amountUsd: pkg.usdt,
        purchaseId,
      });

      if (!paymentResult.ok || !paymentResult.transaction) {
        throw new Error('Failed to create payment transaction');
      }

      // 4. Send transaction via TonConnect
      const txResult = await ton.sendTransaction(paymentResult.transaction);
      console.log('[AI Tokens] Transaction sent:', txResult);

      // 5. Show success message
      alert(
        `✅ Транзакция отправлена!\n\nСумма: ${paymentResult.tonAmount} TON (~$${pkg.usdt})\nКурс: $${paymentResult.tonUsdRate.toFixed(2)}\n\n⚡ Токены начисляются автоматически через 10-20 секунд после подтверждения в блокчейне.`
      );

      setBuyOpen(false);

      // 6. Wait for transaction to be confirmed in blockchain, then process pending purchases
      setTimeout(async () => {
        try {
          const result = await processPendingAITokenPurchases(chatId);
          console.log('[AI Tokens] Process pending result:', result);
          if (result.processed > 0) {
            // Successfully processed, reload balance immediately
            load();
          } else {
            // Not found yet, try again after a delay
            setTimeout(() => load(), 10000);
          }
        } catch (e) {
          console.error('[AI Tokens] Failed to process pending:', e);
          // Fallback: just reload balance
          load();
        }
      }, 10000); // Wait 10 seconds for blockchain confirmation
    } catch (err: any) {
      console.error('Payment error:', err);
      const errorMsg = err?.message || 'Ошибка при оплате';

      if (errorMsg.includes('User declined the transaction')) {
        alert('Вы отклонили транзакцию');
      } else if (errorMsg.includes('rate_unavailable')) {
        alert('Не удалось получить курс TON/USD. Попробуйте позже.');
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
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
              Выберите пакет токенов для AI-помощника процессов:
            </div>
            <div
              style={{
                fontSize: 12,
                opacity: 0.7,
                marginBottom: 12,
                padding: '8px 10px',
                background: 'rgba(102, 126, 234, 0.1)',
                borderRadius: 8,
                border: '1px solid rgba(102, 126, 234, 0.3)',
                color: '#a5b4fc',
              }}
            >
              ⚡ Токены начисляются автоматически через 10-20 секунд после оплаты
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
