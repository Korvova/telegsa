export default function StarBadge({ amount, status }: { amount: number; status?: 'NONE'|'PLEDGED'|'PAID'|'REFUNDED'|string }) {
  if (!amount || amount <= 0) return null;
  const isPaid = String(status||'') === 'PAID';
  const color = isPaid ? '#9ca3af' : '#facc15';
  const bg = isPaid ? '#1f2937' : '#3a2a10';
  const brd = isPaid ? '#374151' : '#6a4a20';
  return (
    <span title={isPaid ? 'Выплачено' : 'Ожидает выплаты'} style={{
      display:'inline-block', border:`1px solid ${brd}`, background:bg, color, borderRadius:999, padding:'2px 8px', fontSize:12,
    }}>
      ⭐ ({amount})
    </span>
  );
}

