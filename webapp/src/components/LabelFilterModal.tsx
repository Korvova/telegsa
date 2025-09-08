import { useEffect, useState } from 'react';
import { API_BASE, type GroupLabel } from '../api';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  chatId: string;
  selectedLabelId: string | null;
  onApply: (label: { id: string; title: string } | null) => void; // null = все ярлыки
};

export default function LabelFilterModal({
  isOpen, onClose, groupId, chatId, selectedLabelId, onApply
}: Props) {
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState<GroupLabel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await fetch(`${API_BASE}/groups/${groupId}/labels?chatId=${encodeURIComponent(chatId)}`);
        const json = await r.json();
        const arr: GroupLabel[] = Array.isArray(json?.labels) ? json.labels
                       : Array.isArray(json) ? json
                       : [];
        if (alive) setLabels(arr);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Не удалось загрузить ярлыки');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isOpen, groupId, chatId]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,.45)',
        zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:'#1b2030', color:'#e8eaed', border:'1px solid #2a3346',
          borderRadius:12, padding:12, width:'min(460px,92vw)', maxHeight:'70vh', overflow:'auto'
        }}
      >
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontWeight:700 }}>Фильтр по ярлыку</div>
          <button
            onClick={onClose}
            style={{ background:'transparent', border:'none', color:'#8aa0ff', cursor:'pointer' }}
          >✕</button>
        </div>

        {error && <div style={{ color:'#ffb4b4', marginBottom:8 }}>{error}</div>}
        {loading && <div style={{ opacity:.8 }}>Загружаю…</div>}

        {!loading && (
          <div style={{ display:'grid', gap:8 }}>
            {/* Сброс фильтра */}
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input
                type="radio"
                name="label_filter"
                checked={selectedLabelId === null}
                onChange={() => onApply(null)}
              />
              <span>Все ярлыки</span>
            </label>

            {labels.map(l => (
              <label key={l.id} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                <input
                  type="radio"
                  name="label_filter"
                  checked={selectedLabelId === l.id}
                  onChange={() => onApply({ id: l.id, title: l.title })}
                />
                <span>🏷️ {l.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
