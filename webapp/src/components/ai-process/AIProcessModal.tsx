/**
 * AIProcessModal - полноэкранная модалка для общения с AI-помощником
 * Аналогична модалке комментариев
 */

import { useState, useRef, useEffect } from 'react';
import AIProcessChat from './AIProcessChat';
import AIProcessInput from './AIProcessInput';
import { getAITokenBalance, type AITokenBalance } from '../../api';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type AIProcessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  groupId: string | null;
  chatId: string;
};

export default function AIProcessModal({ isOpen, onClose, groupId: _groupId, chatId }: AIProcessModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processResult, _setProcessResult] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<AITokenBalance | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Начальное приветственное сообщение от ИИ
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: 'Привет! Я помогу создать процесс для вашей группы. Опишите, что вы хотите спланировать, и я задам уточняющие вопросы.',
          timestamp: Date.now(),
        },
      ]);
    }
  }, [isOpen, messages.length]);

  // Загрузка баланса токенов при открытии
  useEffect(() => {
    if (isOpen && chatId) {
      getAITokenBalance(chatId)
        .then(setTokenBalance)
        .catch((err) => console.error('Failed to load token balance:', err));
    }
  }, [isOpen, chatId]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Добавляем сообщение пользователя
    const userMessage: Message = {
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // TODO: Отправить запрос к API
      // const response = await fetch('/ai/process/message', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     chatId,
      //     groupId,
      //     messages: [...messages, userMessage],
      //   }),
      // });
      // const data = await response.json();

      // Временная заглушка
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const aiMessage: Message = {
        role: 'assistant',
        content: 'Спасибо! Расскажите подробнее: кто будет участвовать в этом процессе?',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Произошла ошибка. Попробуйте ещё раз.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmProcess = () => {
    // TODO: Создать процесс на основе processResult
    console.log('Creating process:', processResult);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#f3f4f6',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Заголовок */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#ffffff',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>🪄 AI-помощник</div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
            {tokenBalance ? (
              <span>
                Токены: {tokenBalance.balance.toLocaleString()}
                {tokenBalance.status === 'low' && ' ⚠️'}
                {tokenBalance.status === 'critical' && ' 🔴'}
              </span>
            ) : (
              'Опишите что хотите спланировать'
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: 8,
            color: '#ffffff',
            fontSize: 24,
            width: 36,
            height: 36,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>

      {/* Область чата */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <AIProcessChat messages={messages} isLoading={isLoading} />
      </div>

      {/* Кнопка подтверждения (если процесс готов) */}
      {processResult && (
        <div style={{ padding: 12, background: '#e0f2fe', borderTop: '1px solid #bae6fd' }}>
          <button
            onClick={handleConfirmProcess}
            style={{
              width: '100%',
              padding: '12px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ✅ Создать процесс
          </button>
        </div>
      )}

      {/* Поле ввода */}
      <div style={{ padding: '12px', background: '#ffffff', borderTop: '1px solid #e5e7eb', position: 'relative' }}>
        {/* Кнопка назад над кнопкой отправки */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            right: '12px',
            bottom: 'calc(100% + 8px)',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '2px solid #667eea',
            borderRadius: 12,
            color: '#667eea',
            width: 44,
            height: 44,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(102, 126, 234, 0.25)',
            fontWeight: 'bold',
            gap: 1,
          }}
          aria-label="Назад"
        >
          <div style={{ fontSize: 20, lineHeight: '20px' }}>←</div>
          <div style={{ fontSize: 8, lineHeight: '8px', opacity: 0.8 }}>Назад</div>
        </button>

        <AIProcessInput
          ref={inputRef}
          onSend={handleSendMessage}
          disabled={isLoading}
          placeholder={isLoading ? 'ИИ думает...' : 'Опишите вашу задачу...'}
        />
      </div>
    </div>
  );
}
