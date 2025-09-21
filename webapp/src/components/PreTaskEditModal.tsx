import { useEffect, useMemo, useState } from 'react';
import { listGroups, getGroupLabels, fetchBoard, setPreTaskLinks, updatePreTask, deletePreTask, getPreTask, type PreTaskDTO } from '../api';

type LinkItem = { id: string; text: string; kind: 'TASK' | 'PRETASK'; status?: string };

export default function PreTaskEditModal({
  open,
  chatId,
  preTask,
  onClose,
  onSaved,
}: {
  open: boolean;
  chatId: string;
  preTask: PreTaskDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [groups, setGroups] = useState<{ id: string; title: string }[]>([]);
  const [browseGroupId, setBrowseGroupId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<LinkItem[]>([]);
  const [selected, setSelected] = useState<Map<string, LinkItem>>(new Map());
  const [q, setQ] = useState('');
  const [labelFilterId, setLabelFilterId] = useState<string | null>(null);
  const [taskLabelsCache, setTaskLabelsCache] = useState<Record<string, string[]>>({});
  const [groupLabels, setGroupLabelsState] = useState<{ id: string; title: string }[]>([]);

  const [mode, setMode] = useState<PreTaskDTO['triggerMode']>('AFTER_ALL_DONE');
  const [startAt, setStartAt] = useState<string | null>(null);
  const [delay, setDelay] = useState<string>('');
  const [autoCancel, setAutoCancel] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const r = await listGroups(chatId);
        const gs = (r as any)?.ok ? (r as any).groups : [];
        setGroups(gs.map((g: any) => ({ id: g.id, title: g.title })));
      } catch {}
    })();
  }, [open, chatId]);

  async function loadBoard() {
    setBusy(true);
    try {
      const b = await fetchBoard(chatId, browseGroupId ?? undefined);
      const cols = (b?.columns || []) as any[];
      const tasks: LinkItem[] = cols.flatMap((c:any) => (c.tasks || []).map((t:any) => ({ id: String(t.id), text: String(t.text || ''), kind: 'TASK' as const, status: String(c.name || '') })));
      let pret: LinkItem[] = [];
      try {
        // показываем и другие предзадачи, чтобы строить цепочки
        const pr = await (await import('../api')).listPreTasks({ chatId, status: ['PREVIEW','ARMED'] });
        if (pr?.ok && Array.isArray(pr.preTasks)) pret = pr.preTasks.filter((p:any)=>p.id!==preTask?.id).map((p:any) => ({ id: String(p.id), text: String(p.text || ''), kind: 'PRETASK' as const, status: String(p.status || '') }));
      } catch {}
      setItems([ ...pret, ...tasks ]);
      if (browseGroupId) {
        try { const ls = await getGroupLabels(browseGroupId); setGroupLabelsState(ls.map(l => ({ id: l.id, title: l.title }))); } catch {}
      } else setGroupLabelsState([]);
    } catch {}
    setBusy(false);
  }

  useEffect(() => { if (open) { loadBoard(); } }, [open, browseGroupId]);

  // Fill state from preTask
  useEffect(() => {
    (async () => {
      if (!open || !preTask) return;
      setTitle(String(preTask.text || ''));
      setMode(preTask.triggerMode);
      setStartAt(preTask.startAt || null);
      setDelay(typeof preTask.delayMinutes === 'number' ? String(preTask.delayMinutes) : '');
      setAutoCancel(!!preTask.autoCancelOnAny);
      try {
        const full = await getPreTask(preTask.id);
        const links = (full as any)?.preTask?.links || [];
        const map = new Map<string, LinkItem>();
        for (const l of links) {
          if (l.taskId) {
            const it = items.find(x => x.kind==='TASK' && x.id === l.taskId);
            const key = `TASK:${String(l.taskId)}`;
            map.set(key, it || { id: String(l.taskId), text: `(связь) #${String(l.taskId).slice(0,6)}`, kind:'TASK', status: undefined });
          } else if (l.depPreTaskId) {
            const it = items.find(x => x.kind==='PRETASK' && x.id === l.depPreTaskId);
            const key = `PRETASK:${String(l.depPreTaskId)}`;
            map.set(key, it || { id: String(l.depPreTaskId), text: `⚫ (связь) #${String(l.depPreTaskId).slice(0,6)}`, kind:'PRETASK', status: undefined });
          }
        }
        setSelected(map);
      } catch {}
    })();
  }, [open, preTask, items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = !s ? items : items.filter(it => it.text.toLowerCase().includes(s));
    if (labelFilterId) {
      base = base.filter(it => {
        if (it.kind !== 'TASK') return true;
        const lab = taskLabelsCache[it.id] || [];
        return lab.includes(labelFilterId);
      });
    }
    return base;
  }, [q, items, labelFilterId, taskLabelsCache]);

  // fetch labels lazily
  useEffect(() => {
    if (!labelFilterId) return;
    (async () => {
      const need = items.filter(it => !(taskLabelsCache[it.id]));
      if (!need.length) return;
      const entries: [string, string[]][] = [];
      try {
        for (const it of need.slice(0, 100)) {
          const ls = await (await import('../api')).getTaskLabels(it.id);
          const ids = (ls || []).map((x:any)=>x.id).filter(Boolean);
          entries.push([it.id, ids]);
        }
        setTaskLabelsCache(prev => ({ ...prev, ...Object.fromEntries(entries) }));
      } catch {}
    })();
  }, [labelFilterId, items]);

  async function apply() {
    if (!preTask) return;
    // build links
    const links = Array.from(selected.values()).map(v => (v.kind === 'TASK' ? { taskId: v.id } : { preTaskId: v.id }));
    if (!links.length) {
      if (!confirm('Удалить предзадачу?')) return;
      const d = await deletePreTask(preTask.id);
      if (!d?.ok) {
        // fallback: отменим предзадачу, чтобы скрыть её из списка
        try { await (await import('../api')).cancelPreTask(preTask.id); } catch {}
      }
      onSaved(); onClose();
      return;
    }
    // validations
    if (mode === 'DATE_PLUS' && (!startAt || !String(startAt).trim())) {
      alert('Укажите дату и время для запуска');
      return;
    }
    const delayMinutes = delay.trim() === '' ? null : Math.max(0, parseInt(delay, 10) || 0);
    await setPreTaskLinks(preTask.id, links as any);
    await updatePreTask(preTask.id, { text: title.trim() || preTask.text, triggerMode: mode, startAt: startAt || null, delayMinutes, autoCancelOnAny: autoCancel });
    onSaved(); onClose();
  }

  if (!open || !preTask) return null;

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ width:'100%', maxWidth:640, maxHeight:'80vh', overflow:'auto', background:'#111827', color:'#e5e7eb', borderTopLeftRadius:16, borderTopRightRadius:16, padding:16, borderTop:'1px solid #1f2937' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#9ca3af', fontSize:18, cursor:'pointer' }} aria-label="Закрыть">✕</button>
          <div style={{ fontWeight:700 }}>Предзадача</div>
          <div style={{ marginLeft:'auto' }} />
          <button onClick={async()=>{ if (!preTask) return; try { if (confirm('Удалить предзадачу?')) { await deletePreTask(preTask.id); onSaved(); onClose(); } } catch {} }} title="Удалить" style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid #2a3346', background: '#3b1a1a', color: '#ffd7d7', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>🗑️</button>
        </div>

        {/* Название предзадачи */}
        <div style={{ marginBottom: 10 }}>
          <textarea
            value={title}
            onChange={(e)=>setTitle(e.target.value)}
            placeholder="Текст предзадачи"
            rows={2}
            style={{ width:'100%', resize:'none', background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:8, padding:'8px 10px', fontSize:16 }}
          />
        </div>

        {/* Список выбранных связей с (x) */}
        {selected.size > 0 && (
          <div style={{ marginBottom:8, fontSize:12 }}>
            Связанные задачи: {Array.from(selected.entries()).map(([k,s]) => (
              <span key={k} style={{ marginRight:12 }}>
                {s.kind==='PRETASK' ? '⚫ ' : ''}{s.text.length>40?s.text.slice(0,40)+'…':s.text} <button onClick={()=>{ const m=new Map(selected); m.delete(k); setSelected(m); }} style={{ background:'transparent', border:'none', color:'#93c5fd', cursor:'pointer' }}>(x)</button>
              </span>
            ))}
          </div>
        )}

        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
          <span style={{ fontSize:12, opacity:.8 }}>Группа:</span>
          <select value={browseGroupId ?? ''} onChange={(e)=>setBrowseGroupId(e.target.value || null)} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'4px 6px' }}>
            <option value="">Моя группа</option>
            {groups.map(g => (<option key={g.id} value={g.id}>{g.title}</option>))}
          </select>
          <span style={{ fontSize:12, opacity:.8 }}>Ярлык:</span>
          <select value={labelFilterId ?? ''} onChange={(e)=>setLabelFilterId(e.target.value || null)} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'4px 6px' }}>
            <option value="">Все</option>
            {groupLabels.map(l => (<option key={l.id} value={l.id}>{l.title}</option>))}
          </select>
          <input placeholder="Поиск…" value={q} onChange={e=>setQ(e.target.value)} style={{ flex:1, background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'6px 8px' }} />
        </div>

        <div style={{ border:'1px solid #1f2937', borderRadius:8, padding:8, maxHeight:280, overflow:'auto' }}>
          {busy ? (<div style={{ padding:12, opacity:.7 }}>Загрузка…</div>) : (
            filtered.map(it => {
              const key = `${it.kind}:${it.id}`;
              const statusText = it.kind === 'TASK' ? (it.status || '') : `⚫ ${it.status || ''}`;
              return (
              <label key={key} style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'space-between', padding:'6px 8px' }}>
                <input type="checkbox" checked={selected.has(key)} onChange={(e)=>{ const s=new Map(selected); if(e.target.checked)s.set(key,it); else s.delete(key); setSelected(s); }} />
                <span style={{ flex:1 }}>{it.kind==='PRETASK' ? '⚫ ' : ''}{it.text}</span>
                {statusText ? (<span style={{ fontSize:12, opacity:.8 }}>{statusText}</span>) : null}
              </label>
            );})
          )}
        </div>

        <div style={{ marginTop:12 }}>
          <div style={{ display:'grid', gap:6 }}>
            <label><input type="radio" name="ed_prmode" checked={mode==='AFTER_ALL_DONE'} onChange={()=>setMode('AFTER_ALL_DONE')} /> ➡️ Сразу</label>
            <label>
              <input type="radio" name="ed_prmode" checked={mode==='DATE_PLUS'} onChange={()=>setMode('DATE_PLUS')} /> 📅 + выбранные
              {mode==='DATE_PLUS' && (
                <input type="datetime-local" value={startAt || ''} onChange={(e)=>setStartAt(e.target.value || null)} style={{ marginLeft:8, background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'2px 6px' }} />
              )}
            </label>
            <label>
              <input type="radio" name="ed_prmode" checked={mode==='DELAY_AFTER'} onChange={()=>setMode('DELAY_AFTER')} /> ⏰ Через X минут
              {mode==='DELAY_AFTER' && (
                <input type="number" min={0} value={delay} onChange={(e)=>setDelay(e.target.value.replace(/\D/g,'').replace(/^0+(?=\d)/,''))} style={{ marginLeft:8, width:100, background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'2px 6px' }} />
              )}
            </label>
            <label><input type="radio" name="ed_prmode" checked={mode==='AFTER_ALL_CANCELED'} onChange={()=>setMode('AFTER_ALL_CANCELED')} /> 🚫➡️ После отменены запуск</label>
          </div>
          {mode!=='AFTER_ALL_CANCELED' && (
            <label style={{ display:'block', marginTop:8 }}>
              <input type="checkbox" checked={autoCancel} onChange={(e)=>setAutoCancel(e.target.checked)} /> 🚫 Отменить, если одна из выбранных отменена.
            </label>
          )}
        </div>

        <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', padding:'8px 12px', cursor:'pointer' }}>Отмена</button>
          <button onClick={apply} style={{ borderRadius:8, border:'1px solid transparent', background:'#2563eb', color:'#fff', padding:'8px 12px', cursor:'pointer' }}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
