import { useEffect, useMemo, useState } from 'react';
import { listPreTasks, listGroups } from '../api';

type Props = {
  open: boolean;
  chatId: string;
  taskId: string;
  onClose: () => void;
  onApply: (ids: string[]) => Promise<void> | void;
};

export default function SelectPreTasksModal({ open, chatId, onClose, onApply }: Props) {
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<{ id: string; title: string }[]>([]);
  const [groupId, setGroupId] = useState<string>('');

  async function load() {
    setBusy(true);
    try {
      const pr = await listPreTasks({ chatId, status: ['PREVIEW', 'ARMED'] });
      const arr = (pr as any)?.ok ? (pr as any).preTasks : [];
      setItems(arr);
      try {
        const gr = await listGroups(chatId);
        const gs = (gr as any)?.ok ? (gr as any).groups : [];
        setGroups(gs.map((g: any) => ({ id: String(g.id), title: String(g.title || g.id) })));
      } catch {}
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { if (open) { setSelected({}); setQ(''); setGroupId(''); load(); } }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((p) => {
      if (groupId && String(p.groupId || '') !== String(groupId)) return false;
      if (!s) return true;
      return String(p.text || '').toLowerCase().includes(s);
    });
  }, [items, q, groupId]);

  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ width:'min(720px,96vw)', maxHeight:'80vh', overflow:'auto', background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:12, padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <span>⚫</span>
          <div style={{ fontWeight:700 }}>Выбрать существующие предзадачи</div>
          <div style={{ marginLeft:'auto' }} />
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#8aa0ff', cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <select value={groupId} onChange={(e)=>setGroupId(e.target.value)} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'4px 6px' }}>
            <option value="">Все группы</option>
            {groups.map(g => (<option key={g.id} value={g.id}>{g.title}</option>))}
          </select>
          <input placeholder="Поиск…" value={q} onChange={(e)=>setQ(e.target.value)} style={{ flex:1, background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'6px 8px' }} />
        </div>
        <div style={{ border:'1px solid #1f2937', borderRadius:8, padding:8, maxHeight:320, overflow:'auto' }}>
          {busy ? (
            <div style={{ padding:12, opacity:.7 }}>Загрузка…</div>
          ) : (
            filtered.length ? filtered.map((p:any) => (
              <label key={p.id} style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'space-between', padding:'6px 8px', cursor:'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!selected[p.id]}
                  onChange={(e)=> setSelected(prev => ({ ...prev, [p.id]: e.target.checked }))}
                />
                <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>⚫ {p.text}</span>
              </label>
            )) : (
              <div style={{ padding:8, opacity:.7 }}>Нет предзадач</div>
            )
          )}
        </div>
        <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', padding:'8px 12px' }}>Отмена</button>
          <button
            onClick={async ()=>{
              const ids = Object.entries(selected).filter(([,v])=>!!v).map(([k])=>k);
              await onApply(ids);
            }}
            disabled={!Object.values(selected).some(Boolean) || busy}
            style={{ borderRadius:8, border:'1px solid transparent', background:'#2563eb', color:'#fff', padding:'8px 12px', opacity: (!Object.values(selected).some(Boolean) || busy) ? .6 : 1 }}
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}

