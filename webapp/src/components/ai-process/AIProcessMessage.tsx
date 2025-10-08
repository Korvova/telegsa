/**
 * AIProcessMessage - одно сообщение в чате с ИИ
 */

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type AIProcessMessageProps = {
  message: Message;
};

export default function AIProcessMessage({ message }: AIProcessMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {/* Сообщение */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: 12,
          background: isUser
            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            : '#ffffff',
          color: isUser ? '#ffffff' : '#1f2937',
          fontSize: 15,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        {message.content}
      </div>

      {/* Время */}
      <div
        style={{
          fontSize: 11,
          color: '#9ca3af',
          marginTop: 4,
          paddingLeft: isUser ? 0 : 4,
          paddingRight: isUser ? 4 : 0,
        }}
      >
        {new Date(message.timestamp).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  );
}
