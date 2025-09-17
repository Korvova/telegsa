import { useEffect, useMemo, useState } from 'react';

type PreConfig = {
  links: Array<{ taskId?: string; preTaskId?: string }>;
  mode: 'AFTER_ALL_DONE' | 'DATE_PLUS' | 'DELAY_AFTER' | 'AFTER_ALL_CANCELED';
  startAt?: string | null;
  delayMinutes?: number | null;
  autoCancelOnAny?: boolean;
  plannedAssigneeChatId?: string | null;
};

export default function PreTaskToggle({ chatId, groupId: _parentGroupId, value, onApplied, style }: {
  chatId: string;
  groupId: string | null;
  value?: PreConfig | null;
  onApplied: (cfg: PreConfig | null) => void;
  style?: any;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  type LinkItem = { id: string; text: string; kind: 'TASK' | 'PRETASK'; status?: string };
  const [items, setItems] = useState<LinkItem[]>([]);
  const [selected, setSelected] = useState<Map<string, LinkItem>>(new Map());
  const [q, setQ] = useState('');
  const [labelFilterId, setLabelFilterId] = useState<string | null>(null);
  const [taskLabelsCache, _setTaskLabelsCache] = useState<Record<string, string[]>>({});
  const [groupLabels, setGroupLabels] = useState<{ id: string; title: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; title: string }[]>([]);
  const [browseGroupId, setBrowseGroupId] = useState<string | null>(_parentGroupId ?? null);
  const [mode, setMode] = useState<PreConfig['mode']>('AFTER_ALL_DONE');
  const [startAt, setStartAt] = useState<string | null>(null);
  const [delayInput, setDelayInput] = useState<string>('');
  const [autoCancel, setAutoCancel] = useState<boolean>(false);

  const [applied, setApplied] = useState<PreConfig | null>(null);
  useEffect(() => { setApplied(value ?? null); }, [value]);

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

  function normStatus(raw: string) {
    const s = String(raw || '');
    const i = s.indexOf('::');
    return i >= 0 ? s.slice(i + 2) : s;
  }

  async function load() {
    setBusy(true);
    try {
      const api = await import('../../../api');
      try {
        const r = await api.listGroups(chatId);
        const arr = (r as any)?.ok ? (r as any).groups : [];
        setGroups(arr.map((g: any) => ({ id: g.id, title: g.title })));
      } catch {}

      const b = await api.fetchBoard(chatId, browseGroupId ?? undefined);
      const cols = (b?.columns || []) as any[];
      const tasks: LinkItem[] = cols.flatMap((c:any) => (c.tasks || []).map((t:any) => ({ id: String(t.id), text: String(t.text || ''), kind: 'TASK' as const, status: normStatus(String(c.name || '')) })));
      let pret: LinkItem[] = [];
      try {
        const pr = await api.listPreTasks({ chatId, status: ['PREVIEW','ARMED'] });
        if (pr?.ok && Array.isArray(pr.preTasks)) pret = pr.preTasks.map((p:any) => ({ id: String(p.id), text: String(p.text || ''), kind: 'PRETASK' as const, status: String(p.status || '') }));
      } catch {}
      setItems([ ...pret, ...tasks ]);
      if (browseGroupId) {
        try { const gl = await (await import('../../../api')).getGroupLabels(browseGroupId); setGroupLabels(gl.map(l => ({ id: l.id, title: l.title }))); } catch {}
      } else { setGroupLabels([]); }
    } catch {}
    setBusy(false);
  }

  useEffect(() => { if (open) load(); }, [open, browseGroupId]);
  useEffect(() => {
    if (!open) return;
    if (value && value.links && value.links.length) {
      const map = new Map<string, LinkItem>();
      for (const l of value.links) {
        if (l.taskId) {
          const it = items.find(x => x.kind==='TASK' && x.id === l.taskId);
          if (it) map.set(`TASK:${l.taskId}`, it);
        } else if (l.preTaskId) {
          const it = items.find(x => x.kind==='PRETASK' && x.id === l.preTaskId);
          if (it) map.set(`PRETASK:${l.preTaskId}`, it);
        }
      }
      setSelected(map);
    } else {
      setSelected(new Map());
    }
  }, [open, items, value]);

  function icon() {
    if (applied && applied.links && applied.links.length) return '⚫';
    return '🔘';
  }

  async function apply() {
    const links: Array<{ taskId?: string; preTaskId?: string }> = [];
    for (const [key, itm] of selected.entries()) {
      if (key.startsWith('TASK:')) links.push({ taskId: itm.id });
      else if (key.startsWith('PRETASK:')) links.push({ preTaskId: itm.id });
    }
    const cfg: PreConfig = {
      links,
      mode,
      startAt: startAt || null,
      delayMinutes: delayInput.trim()==='' ? null : Math.max(0, parseInt(delayInput,10) || 0),
      autoCancelOnAny: autoCancel,
    };
    setApplied(cfg);
    onApplied(cfg);
    setOpen(false);
  }

  function clear() {
    setSelected(new Map());
    setApplied(null);
    onApplied(null);
  }

  return (
    <>
      <button type="button" title={icon() === '⚫' ? 'Изменить предзадачу' : 'Настроить предзадачу'} onClick={() => setOpen(true)} style={style}>{icon()}</button>
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setOpen(false)}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 96vw)', maxHeight: '80vh', overflow: 'auto', background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Связанные задачи</div>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <input placeholder="Поиск по названию" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 8, padding: '8px 10px' }} />
              {applied && (
                <button onClick={clear} title="Сбросить предзадачу" style={{ borderRadius: 999, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', padding: '6px 10px', cursor: 'pointer' }}>Сбросить</button>
              )}
            </div>
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
            <div style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 8, maxHeight: 280, overflow: 'auto', background: '#0f172a' }}>
              {busy ? (
                <div style={{ padding: 12, opacity: 0.7 }}>Загрузка…</div>
              ) : (
                filtered.map(it => {
                  const key = `${it.kind}:${it.id}`;
                  const statusText = it.kind === 'TASK' ? (it.status || '') : `⚫ ${it.status || ''}`;
                  const color = (()=>{
                    const s = (it.status || '').toLowerCase();
                    if (s==='doing') return '#1e3a8a';
                    if (s==='done') return '#2e7d32';
                    if (s==='cancel') return '#b91c1c';
                    if (s==='approval') return '#c2410c';
                    if (s==='wait') return '#0369a1';
                    return '#e5e7eb';
                  })();
                  return (
                    <label key={key} style={{ display: 'flex', alignItems:'center', justifyContent:'space-between', padding: '6px 8px', cursor: 'pointer', gap:8 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={(e) => {
                          const s = new Map(selected);
                          if (e.target.checked) s.set(key, it);
                          else s.delete(key);
                          setSelected(s);
                        }}
                        style={{ marginRight: 8 }}
                      />
                      <span style={{ flex:1, color }}>
                        {it.kind === 'PRETASK' ? '⚫ ' : ''}
                        {it.text.length > 100 ? (it.text.slice(0, 100) + '…') : it.text}
                      </span>
                      {statusText ? (<span style={{ fontSize:12, color }}>{statusText}</span>) : null}
                    </label>
                  );
                })
              )}
            </div>
            {selected.size > 0 && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Выбранные задачи: {Array.from(selected.entries()).map(([k,s]) => (
                  <span key={k} style={{ marginRight: 12 }}>
                    {s.kind === 'PRETASK' ? '⚫ ' : ''}{s.text.length > 30 ? (s.text.slice(0, 30) + '…') : s.text} <button onClick={() => { const m = new Map(selected); m.delete(k); setSelected(m); }} style={{ background: 'transparent', border: 'none', color: '#93c5fd', cursor: 'pointer' }}>(x)</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label><input type="radio" name="prmode" checked={mode==='AFTER_ALL_DONE'} onChange={()=>setMode('AFTER_ALL_DONE')} /> ➡️ Сразу</label>
                <label>
                  <input type="radio" name="prmode" checked={mode==='DATE_PLUS'} onChange={()=>setMode('DATE_PLUS')} /> 📅 + выбранные
                  {mode==='DATE_PLUS' && (
                    <input type="datetime-local" value={startAt || ''} onChange={e => setStartAt(e.target.value || null)} style={{ marginLeft: 8, background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'2px 6px' }} />
                  )}
                </label>
                <label>
                  <input type="radio" name="prmode" checked={mode==='DELAY_AFTER'} onChange={()=>setMode('DELAY_AFTER')} /> ⏰ Через X минут
                  {mode==='DELAY_AFTER' && (
                    <input type="text" inputMode="numeric" pattern="\\d*" value={delayInput} onChange={e => setDelayInput(e.target.value.replace(/\D/g,'').replace(/^0+(?=\d)/,''))} style={{ marginLeft: 8, width: 100, background:'#0b1220', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:6, padding:'2px 6px' }} placeholder="минуты" />
                  )}
                </label>
                <label><input type="radio" name="prmode" checked={mode==='AFTER_ALL_CANCELED'} onChange={()=>setMode('AFTER_ALL_CANCELED')} /> 🚫➡️ После отменены запуск</label>
              </div>
              {mode !== 'AFTER_ALL_CANCELED' && (
                <label style={{ display: 'block', marginTop: 8 }}>
                  <input type="checkbox" checked={autoCancel} onChange={e => setAutoCancel(e.target.checked)} /> 🚫 Отменить, если одна из выбранных отменена.
                </label>
              )}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} style={{ borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', padding: '8px 12px', cursor: 'pointer' }}>Отмена</button>
              <button disabled={!selected.size} onClick={apply} style={{ borderRadius: 8, border: '1px solid transparent', background: '#2563eb', color: '#fff', padding: '8px 12px', cursor: selected.size ? 'pointer' : 'not-allowed' }}>Применить</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
