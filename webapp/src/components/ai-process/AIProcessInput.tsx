/**
 * AIProcessInput - поле ввода сообщений для AI-помощника
 */

import { forwardRef, useState, type KeyboardEvent } from 'react';

type AIProcessInputProps = {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

const AIProcessInput = forwardRef<HTMLTextAreaElement, AIProcessInputProps>(
  ({ onSend, disabled = false, placeholder = 'Введите сообщение...' }, ref) => {
    const [value, setValue] = useState('');

    const handleSend = () => {
      if (value.trim() && !disabled) {
        onSend(value);
        setValue('');
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter без Shift отправляет сообщение
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    };

    return (
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
        }}
      >
        {/* Текстовое поле */}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid #e5e7eb',
            fontSize: 15,
            lineHeight: 1.5,
            resize: 'none',
            fontFamily: 'inherit',
            outline: 'none',
            background: disabled ? '#f3f4f6' : '#ffffff',
            color: disabled ? '#9ca3af' : '#1f2937',
            minHeight: 44,
            maxHeight: 120,
          }}
          onInput={(e) => {
            // Автоматическое изменение высоты
            const target = e.currentTarget;
            target.style.height = '44px';
            target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
          }}
        />

        {/* Кнопка отправки */}
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            border: 'none',
            background:
              disabled || !value.trim()
                ? '#e5e7eb'
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#ffffff',
            fontSize: 20,
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.2s ease',
          }}
          aria-label="Отправить"
        >
          {disabled ? '⏳' : '↑'}
        </button>
      </div>
    );
  }
);

AIProcessInput.displayName = 'AIProcessInput';

export default AIProcessInput;
