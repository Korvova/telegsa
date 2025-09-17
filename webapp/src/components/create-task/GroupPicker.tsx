// no React import needed with automatic JSX
import type { Group } from '../../api';

export default function GroupPicker({
  open,
  groupTab,
  setGroupTab,
  ownGroups,
  memberGroups,
  groupId,
  setGroupId,
  onClose,
  onApply,
}: {
  open: boolean;
  groupTab: 'own' | 'member';
  setGroupTab: (v: 'own' | 'member') => void;
  ownGroups: Group[];
  memberGroups: Group[];
  groupId: string | null;
  setGroupId: (id: string | null) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2300,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1b2030',
          color: '#e8eaed',
          border: '1px solid #2a3346',
          borderRadius: 12,
          padding: 12,
          width: 'min(460px, 92vw)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Выберите группу</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => setGroupTab('own')}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid #2a3346',
              background: groupTab === 'own' ? '#1b2030' : '#121722',
              color: groupTab === 'own' ? '#8aa0ff' : '#e8eaed',
              cursor: 'pointer',
            }}
          >
            Мои проекты ({ownGroups.length})
          </button>
          <button
            onClick={() => setGroupTab('member')}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid #2a3346',
              background: groupTab === 'member' ? '#1b2030' : '#121722',
              color: groupTab === 'member' ? '#8aa0ff' : '#e8eaed',
              cursor: 'pointer',
            }}
          >
            Проекты со мной ({memberGroups.length})
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8, maxHeight: '50vh', overflow: 'auto' }}>
          {groupTab === 'own' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="radio" name="group" checked={!groupId} onChange={() => setGroupId(null)} />
              <span>Моя группа (личная доска)</span>
            </label>
          )}

          {groupTab === 'own'
            ? ownGroups.map((g) => (
                <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" name="group" checked={groupId === g.id} onChange={() => setGroupId(g.id)} />
                  <span style={{ color: (g as any).isPublic ? '#86efac' : undefined }}>{(g as any).isPublic ? '🌍 ' : ''}{g.title}</span>
                </label>
              ))
            : memberGroups.map((g) => (
                <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" name="group" checked={groupId === g.id} onChange={() => setGroupId(g.id)} />
                  <span>
                    <span style={{ color: (g as any).isPublic ? '#86efac' : undefined }}>{(g as any).isPublic ? '🌍 ' : ''}{g.title}</span>
                    {g.ownerName && <span style={{ opacity: 0.7, marginLeft: 6 }}>(👑 {g.ownerName})</span>}
                  </span>
                </label>
              ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <button onClick={onApply} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>Готово</button>
        </div>
      </div>
    </div>
  );
}
