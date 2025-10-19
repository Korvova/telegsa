export default function SettingsForms({ onOpenForms }: { chatId: string; onOpenForms: () => void }) {
  return (
    <button
      onClick={onOpenForms}
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
      <span style={{ fontSize: 18 }}>📩</span>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Формы</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Создавайте формы для приёма заявок
        </div>
      </div>
    </button>
  );
}
