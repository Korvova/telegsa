// no React import needed with automatic JSX

export default function DeleteConfirmModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2500, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:12, padding:12, width:'min(420px, 92vw)' }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Удалить задачу?</div>
        <div style={{ fontSize:13, opacity:.85, marginBottom:10 }}>Это действие нельзя отменить.</div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отмена</button>
          <button onClick={onConfirm} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #7f1d1d', background:'#991b1b', color:'#fee2e2' }}>Да, удалить</button>
        </div>
      </div>
    </div>
  );
}
