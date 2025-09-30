export default function StarBadge({ amount, status, flat = false }: { amount: number; status?: 'NONE'|'PLEDGED'|'PAID'|'REFUNDED'|string; flat?: boolean }) {
  if (!amount || amount <= 0) return null;
  const isPaid = String(status||'') === 'PAID';
  const icon = isPaid ? (flat ? '💸' : '💫') : (flat ? '💵' : '💰');
  const iconColor = isPaid ? '#9ca3af' : '#facc15';
  const countColor = isPaid ? '#d1d5db' : '#a7f3d0'; // paid: light gray, pledged: light green

  const bg = isPaid ? '#1f2937' : '#3a2a10';
  const brd = isPaid ? '#374151' : '#6a4a20';

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: 12,
    lineHeight: '16px',
  };
  const style = flat
    ? { ...baseStyle, background: 'transparent', border: 'none' }
    : { ...baseStyle, background: bg, border: `1px solid ${brd}` };

  return (
    <span title={isPaid ? 'Выплачено' : 'Ожидает выплаты'} style={style}>
      <span style={{ color: iconColor }}>{icon}</span>
      <span style={{ color: countColor }}>({amount})</span>
    </span>
  );
}
