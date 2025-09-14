import { useEffect, useState } from 'react';
import { getPreTask, setPreTaskLinks, deletePreTask, listPreTasks } from '../api';
import SelectPreTasksModal from './SelectPreTasksModal';

export default function TaskPreTaskLinkManager({
  open,
  chatId,
  taskId,
  onClose,
  onAdd,
  onChanged,
}: {
  open: boolean;
  chatId: string;
  taskId: string;
  onClose: () => void;
  onAdd: () => void; // open create modal
  onChanged: () => void; // refresh preTasks
}) {
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const r = await listPreTasks({ chatId, status: ['PREVIEW','ARMED'] });
      const arr = (r as any)?.ok ? (r as any).preTasks : [];
      const linked = arr.filter((p:any) => Array.isArray(p.links) && p.links.some((l:any) => String(l.taskId||'') === String(taskId)));
      setItems(linked);
    } catch { setItems([]); }
    setBusy(false);
  }

  useEffect(() => { if (open) load(); }, [open]);

  async function unlink(preId: string) {
    try {
      const full = await getPreTask(preId);
      const pre = (full as any)?.preTask;
      const existing = Array.isArray(pre?.links) ? pre.links : [];
      const next = existing.filter((l:any) => String(l.taskId||'') !== String(taskId));
      if (next.length === 0) {
        try { await deletePreTask(preId); } catch {}
      } else {
        await setPreTaskLinks(preId, next.map((l:any) => (l.taskId ? { taskId: l.taskId } : { preTaskId: l.depPreTaskId })));
      }
      await load();
      onChanged();
    } catch {}
  }

  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2100, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ width:'min(720px,96vw)', maxHeight:'80vh', overflow:'auto', background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:12, padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <span>⚫</span>
          <div style={{ fontWeight:700 }}>Запустится после</div>
          <div style={{ marginLeft:'auto' }} />
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#8aa0ff', cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ border:'1px solid #1f2937', borderRadius:8, padding:8, maxHeight:280, overflow:'auto' }}>
          {busy ? (<div style={{ padding:12, opacity:.7 }}>Загрузка…</div>) : (
            items.length ? items.map((p:any) => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'space-between', padding:'6px 8px' }}>
                <span style={{ flex:1 }}>⚫ {p.text}</span>
                <button onClick={()=>unlink(p.id)} style={{ background:'transparent', border:'1px solid #2a3346', color:'#93c5fd', borderRadius:8, padding:'4px 8px', cursor:'pointer' }}>(x)</button>
              </div>
            )) : (<div style={{ padding:8, opacity:.7 }}>Связей нет</div>)
          )}
        </div>
        <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onAdd} style={{ borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', padding:'8px 12px' }}>Добавить</button>
          <button onClick={()=>setSelectOpen(true)} style={{ borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', padding:'8px 12px' }}>Выбрать</button>
          <button onClick={onClose} style={{ borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', padding:'8px 12px' }}>Закрыть</button>
        </div>

        <SelectPreTasksModal
          open={selectOpen}
          chatId={chatId}
          taskId={taskId}
          onClose={() => setSelectOpen(false)}
          onApply={async (ids) => {
            if (!ids.length) { setSelectOpen(false); return; }
            try {
              for (const preId of ids) {
                try {
                  const full = await getPreTask(preId);
                  const pre = (full as any)?.preTask;
                  const existing = Array.isArray(pre?.links) ? pre.links : [];
                  const next = [
                    ...existing.map((l:any) => (l.taskId ? { taskId: String(l.taskId) } : { preTaskId: String(l.depPreTaskId) })),
                  ];
                  if (!next.some((l:any) => String(l.taskId||'') === String(taskId))) next.push({ taskId });
                  await setPreTaskLinks(preId, next as any);
                } catch {}
              }
              await load();
              onChanged();
            } finally {
              setSelectOpen(false);
            }
          }}
        />
      </div>
    </div>
  );
}
