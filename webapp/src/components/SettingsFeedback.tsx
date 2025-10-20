import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { API_BASE } from '../api';

type Props = {
  chatId: string;
};

export default function SettingsFeedback({ chatId }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const tgUser = (WebApp as any)?.initDataUnsafe?.user;
      const res = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          from: {
            id: tgUser?.id || chatId,
            username: tgUser?.username,
            first_name: tgUser?.first_name,
          },
        }),
      });

      if (!res.ok) throw new Error('feedback_failed');

      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      setSent(true);
      setText('');
      setTimeout(() => {
        setOpen(false);
        setSent(false);
      }, 2000);
    } catch (e) {
      console.error('[SettingsFeedback] send error:', e);
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Не удалось отправить сообщение. Попробуйте позже.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textAlign: 'left',
          background: 'linear-gradient(180deg, #e5e7eb, #cbd5e1)',
          color: '#374151',
          border: '1px solid #D1D5DB',
          borderRadius: 12,
          padding: '10px 12px',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 18 }}>💬</span>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Обратная связь</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Пожелания, идеи и отзывы
          </div>
        </div>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.6)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(480px, 94vw)',
              background: '#1b2030',
              border: '1px solid #2a3346',
              borderRadius: 16,
              padding: 16,
              color: '#e8eaed',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>💬 Обратная связь</div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9ca3af',
                  fontSize: 20,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {sent ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                  Спасибо за обращение!
                </div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  Мы обязательно рассмотрим ваше сообщение
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>
                  Напишите ваши пожелания, идеи или отзывы о приложении
                </div>

                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Например: Спасибо, очень крутое приложение!"
                  style={{
                    width: '100%',
                    height: 120,
                    padding: 10,
                    borderRadius: 10,
                    background: '#121722',
                    color: '#e8eaed',
                    border: '1px solid #2a3346',
                    resize: 'none',
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                />

                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setOpen(false)}
                    disabled={sending}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 10,
                      background: '#374151',
                      color: '#e8eaed',
                      border: 'none',
                      cursor: sending ? 'default' : 'pointer',
                      opacity: sending ? 0.6 : 1,
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={!text.trim() || sending}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 10,
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      cursor: !text.trim() || sending ? 'default' : 'pointer',
                      opacity: !text.trim() || sending ? 0.6 : 1,
                    }}
                  >
                    {sending ? 'Отправка...' : 'Отправить'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
