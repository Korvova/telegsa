/**
 * AIProcessChat - область отображения сообщений с ИИ
 */

import { useEffect, useRef } from 'react';
import AIProcessMessage from './AIProcessMessage';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type AIProcessChatProps = {
  messages: Message[];
  isLoading: boolean;
};

export default function AIProcessChat({ messages, isLoading }: AIProcessChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Автоскролл вниз при новых сообщениях
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div
      ref={scrollRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {messages.map((message, index) => (
        <AIProcessMessage key={`${message.timestamp}-${index}`} message={message} />
      ))}

      {/* Индикатор загрузки */}
      {isLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            background: '#ffffff',
            borderRadius: 12,
            maxWidth: '80%',
            alignSelf: 'flex-start',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '4px',
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#9333ea',
                  animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 14, color: '#6b7280' }}>ИИ думает...</span>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
