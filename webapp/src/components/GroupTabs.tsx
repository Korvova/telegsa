type GroupTab = 'kanban' | 'members';

export default function GroupTabs({
  current,
  onChange,
}: {
  current: GroupTab;
  onChange: (t: GroupTab) => void;
}) {
  const items = [
    // Канбан-таб убран из UI (плашка не нужна)
    { id: 'members' as const, icon: '👥', label: 'Участники' },
  ];
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 8, marginBottom: 8 }}>
        {items.map((it) => {
          const active = current === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onChange(it.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 8px',
                borderRadius: 12,
                border: '1px solid #2a3346',
                background: active ? '#1b2030' : '#121722',
                color: active ? '#8aa0ff' : '#e8eaed',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              <span>{it.icon}</span>
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
      {current === 'members' && (
        <div>
          <button
            onClick={() => onChange('kanban')}
            title="Вернуться к доске"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 10,
              border: '1px solid #2a3346',
              background: '#121722',
              color: '#e8eaed',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            <span>⟵</span>
            <span>Доска</span>
          </button>
        </div>
      )}
    </div>
  );
}
