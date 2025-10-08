/**
 * AIProcessButton - кнопка для открытия AI-помощника создания процессов
 * Отображается справа внизу на полотне процессов
 */

type AIProcessButtonProps = {
  onClick: () => void;
  disabled?: boolean;
};

export default function AIProcessButton({ onClick, disabled = false }: AIProcessButtonProps) {
  return (
    <button
      aria-label="AI-помощник процессов"
      title="Создать процесс с помощью ИИ"
      onClick={onClick}
      disabled={disabled}
      style={{
        position: 'fixed',
        right: 16,
        bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
        width: 56,
        height: 56,
        borderRadius: 28,
        background: disabled ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#ffffff',
        border: 'none',
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.35)',
        fontSize: 28,
        lineHeight: '56px',
        textAlign: 'center' as const,
        cursor: disabled ? 'not-allowed' : 'pointer',
        zIndex: 50,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseDown={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'scale(0.95)';
        }
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      🪄
    </button>
  );
}
