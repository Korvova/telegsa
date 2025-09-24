// no React import needed with automatic JSX
import type { Group } from '../../api';
import { getGroupLabels, type GroupLabel } from '../../api';
import { useEffect, useState } from 'react';

export default function GroupPicker({
  open,
  groupTab,
  setGroupTab,
  ownGroups,
  memberGroups,
  groupId,
  setGroupId,
  selectedLabelId,
  setSelectedLabelId,
  onClose,
  onApply,
  dockBottom,
}: {
  open: boolean;
  groupTab: 'own' | 'member';
  setGroupTab: (v: 'own' | 'member') => void;
  ownGroups: Group[];
  memberGroups: Group[];
  groupId: string | null;
  setGroupId: (id: string | null) => void;
  selectedLabelId: string | null;
  setSelectedLabelId: (id: string | null) => void;
  onClose: () => void;
  onApply: () => void;
  dockBottom?: number;
}) {
  if (!open) return null;
  const [labels, setLabels] = useState<GroupLabel[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!groupId) { setLabels([]); setSelectedLabelId(null); return; }
      try {
        setLoading(true);
        const ls = await getGroupLabels(groupId);
        if (!cancelled) setLabels(ls);
      } catch {
        if (!cancelled) setLabels([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId]);
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
        zIndex: 1000001,
        // lift content above the iOS keyboard if value provided
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.max(0, dockBottom || 0)}px)`,
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
          width: 'min(680px, 96vw)',
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
          {/* LEFT: groups */}
          <div style={{ display: 'grid', gap: 8, maxHeight: '50vh', overflow: 'auto', border: '1px solid #2a3346', borderRadius: 10, padding: 8 }}>
            {groupTab === 'own' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="radio"
                  name="group"
                  checked={!groupId}
                  onChange={() => { setGroupId(null); setSelectedLabelId(null); }}
                />
                <span>Моя группа (личная доска)</span>
              </label>
            )}

            {groupTab === 'own'
              ? ownGroups.map((g) => (
                  <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="radio"
                      name="group"
                      checked={groupId === g.id}
                      onChange={() => { setGroupId(g.id); setSelectedLabelId(null); }}
                    />
                    <span style={{ color: (g as any).isPublic ? '#86efac' : undefined }}>{(g as any).isPublic ? '🌍 ' : ''}{g.title}</span>
                  </label>
                ))
              : memberGroups.map((g) => (
                  <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="radio"
                      name="group"
                      checked={groupId === g.id}
                      onChange={() => { setGroupId(g.id); setSelectedLabelId(null); }}
                    />
                    <span>
                      <span style={{ color: (g as any).isPublic ? '#86efac' : undefined }}>{(g as any).isPublic ? '🌍 ' : ''}{g.title}</span>
                      {g.ownerName && <span style={{ opacity: 0.7, marginLeft: 6 }}>(👑 {g.ownerName})</span>}
                    </span>
                  </label>
                ))}
          </div>

          {/* RIGHT: labels */}
          <div style={{ border: '1px solid #2a3346', borderRadius: 10, padding: 8, maxHeight: '50vh', overflow: 'auto' }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Выберите ярлык</div>
            {!groupId ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>Ярлыки доступны в группах.</div>
            ) : loading ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>🏷️ Загрузка…</div>
            ) : labels.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>В группе нет ярлыков.</div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="radio"
                    name="label"
                    checked={!selectedLabelId}
                    onChange={() => setSelectedLabelId(null)}
                  />
                  <span>🏷️ Без ярлыка</span>
                </label>
                {labels.map((l) => (
                  <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="radio"
                      name="label"
                      checked={selectedLabelId === l.id}
                      onChange={() => setSelectedLabelId(l.id)}
                    />
                    <span>🏷️ {l.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <button onClick={onApply} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}>Готово</button>
        </div>
      </div>
    </div>
  );
}
