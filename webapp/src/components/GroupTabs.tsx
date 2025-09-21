type GroupTab = 'kanban' | 'members';

export default function GroupTabs({
  current,
  onChange,
}: {
  current: GroupTab;
  onChange: (t: GroupTab) => void;
}) {
  const items = [
    { id: 'kanban' as const, icon: '🧮', label: 'Канбан' },
    { id: 'members' as const, icon: '👥', label: 'Участники' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
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
  );
}
