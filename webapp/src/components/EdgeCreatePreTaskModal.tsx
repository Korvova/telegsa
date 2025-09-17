import { useEffect, useState } from 'react';
import { getGroupMembers, type GroupMember, createPreTask } from '../api';
import PreTaskToggle from './_internal/PreTaskToggleEmbed';

type Link = { taskId?: string; preTaskId?: string };

export default function EdgeCreatePreTaskModal({
  open,
  chatId,
  task,
  onClose,
  onCreated,
}: {
  open: boolean;
  chatId: string;
  task: { id: string; text: string; groupId?: string | null };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [links, setLinks] = useState<Link[]>([{ taskId: task.id }]);
  const [mode, setMode] = useState<'AFTER_ALL_DONE'|'DATE_PLUS'|'DELAY_AFTER'|'AFTER_ALL_CANCELED'>('AFTER_ALL_DONE');
  const [startAt, setStartAt] = useState<string | null>(null);
  const [delay, setDelay] = useState<string>('');
  const [autoCancel, setAutoCancel] = useState<boolean>(false);

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pickMember, setPickMember] = useState<boolean>(false);

  useEffect(() => {
    if (!open) return;
    // preload members of group
    (async () => {
      try {
        if (task.groupId) {
          const r = await getGroupMembers(task.groupId);
          const arr: GroupMember[] = [];
          if (r?.owner) arr.push(r.owner);
          for (const m of (r.members||[])) arr.push(m);
          const uniq = new Map(arr.map(m => [String(m.chatId), m]));
          setMembers(Array.from(uniq.values()));
        } else {
          setMembers([{ chatId, name: 'Я', role: 'owner' } as any]);
        }
      } catch { setMembers([{ chatId, name: 'Я', role: 'owner' } as any]); }
    })();
  }, [open, task.groupId, chatId]);

  async function doCreate(plannedAssigneeChatId: string | null) {
    const delayMinutes = delay.trim()==='' ? null : Math.max(0, parseInt(delay, 10) || 0);
    const body = {
      chatId,
      groupId: task.groupId ?? null,
      text: (task.text || '').slice(0, 200),
      plannedAssigneeChatId,
      triggerMode: mode,
      startAt: startAt || null,
      delayMinutes,
      autoCancelOnAny: autoCancel,
      links,
      arm: true,
    };
    const r = await createPreTask(body as any);
    if (!(r as any)?.ok) throw new Error((r as any)?.error || 'pretask_create_failed');
    onCreated(); onClose();
  }

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2100, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ width:'min(760px,96vw)', maxHeight:'80vh', overflow:'auto', background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:12, padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <span>🔘</span>
          <div style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.text}</div>
        </div>
        <div style={{ fontSize:12, opacity:.8, marginBottom:8 }}>после выполнения запустить:</div>

        {/* Links editor (reuse embedded toggle) */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:12, marginBottom:4 }}>Связи:</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:8 }}>
            <span style={{ background:'#1f2937', padding:'2px 8px', borderRadius:999, fontSize:12 }}>#{task.id.slice(0,6)} (эта задача)</span>
            {links.filter(l => l.taskId && l.taskId!==task.id).map((l, idx) => (
              <span key={`t-${idx}-${l.taskId}`} style={{ background:'#1f2937', padding:'2px 8px', borderRadius:999, fontSize:12 }}>
                task:{String(l.taskId).slice(0,6)} <button onClick={()=>setLinks(prev => prev.filter(x => !(x.taskId===l.taskId && x!==prev[0]))) } style={{ background:'transparent', border:'none', color:'#93c5fd', cursor:'pointer' }}>(x)</button>
              </span>
            ))}
            {links.filter(l => l.preTaskId).map((l, idx) => (
              <span key={`p-${idx}-${l.preTaskId}`} style={{ background:'#1f2937', padding:'2px 8px', borderRadius:999, fontSize:12 }}>
                ⚫:{String(l.preTaskId).slice(0,6)} <button onClick={()=>setLinks(prev => prev.filter(x => !(x.preTaskId===l.preTaskId))) } style={{ background:'transparent', border:'none', color:'#93c5fd', cursor:'pointer' }}>(x)</button>
              </span>
            ))}
          </div>
          <PreTaskToggle
            chatId={chatId}
            groupId={task.groupId ?? null}
            value={{ links, mode, startAt, delayMinutes: (delay.trim()===''?null:parseInt(delay,10)||0), autoCancelOnAny: autoCancel } as any}
            onApplied={(cfg:any)=>{
              // merge but keep current task link
              const rest: Link[] = (cfg?.links||[]).filter((l:Link)=>!(l.taskId===task.id));
              setLinks([{ taskId: task.id }, ...rest]);
              setMode(cfg?.mode || 'AFTER_ALL_DONE');
              setStartAt(cfg?.startAt || null);
              const d = typeof cfg?.delayMinutes==='number'? String(Math.max(0,cfg.delayMinutes)):'';
              setDelay(d);
              setAutoCancel(!!cfg?.autoCancelOnAny);
            }}
          />
        </div>

        {/* Modes */}
        <div style={{ display:'grid', gap:6 }}>
          <label><input type="radio" name="ed_mode2" checked={mode==='AFTER_ALL_DONE'} onChange={()=>setMode('AFTER_ALL_DONE')} /> ➡️ Сразу</label>
          <label>
            <input type="radio" name="ed_mode2" checked={mode==='DATE_PLUS'} onChange={()=>setMode('DATE_PLUS')} /> 📅 + выбранные
            {mode==='DATE_PLUS' && (
              <input type="datetime-local" value={startAt || ''} onChange={e=>setStartAt(e.target.value || null)} style={{ marginLeft:8, background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:6, padding:'2px 6px' }} />
            )}
          </label>
          <label>
            <input type="radio" name="ed_mode2" checked={mode==='DELAY_AFTER'} onChange={()=>setMode('DELAY_AFTER')} /> ⏰ Через X минут
            {mode==='DELAY_AFTER' && (
              <input type="text" inputMode="numeric" pattern="\\d*" value={delay} onChange={e=>setDelay(e.target.value.replace(/\D/g,'').replace(/^0+(?=\d)/,''))} style={{ marginLeft:8, width:110, background:'#0b1220', color:'#e8eaed', border:'1px solid #1f2937', borderRadius:6, padding:'2px 6px' }} placeholder="минуты" />
            )}
          </label>
          <label><input type="radio" name="ed_mode2" checked={mode==='AFTER_ALL_CANCELED'} onChange={()=>setMode('AFTER_ALL_CANCELED')} /> 🚫➡️ После отменены запуск</label>
          {mode!=='AFTER_ALL_CANCELED' && (
            <label style={{ display:'block', marginTop:6 }}>
              <input type="checkbox" checked={autoCancel} onChange={e=>setAutoCancel(e.target.checked)} /> 🚫 Отменить, если одна из выбранных отменена.
            </label>
          )}
        </div>

        {/* Actions */}
        {!pickMember ? (
          <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', padding:'8px 12px' }}>Отмена</button>
            <button onClick={()=>doCreate(chatId)} style={{ borderRadius:8, border:'1px solid transparent', background:'#2563eb', color:'#fff', padding:'8px 12px' }}>Сделать меня ответственным</button>
            <button onClick={()=>setPickMember(true)} style={{ borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', padding:'8px 12px' }}>Выбрать из группы…</button>
          </div>
        ) : (
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:12, opacity:.8, marginBottom:6 }}>Выберите участника группы:</div>
            <div style={{ maxHeight: 240, overflow:'auto', display:'grid', gap:6 }}>
              {members.map((m) => (
                <button key={String(m.chatId)} onClick={()=>doCreate(String(m.chatId))} style={{ textAlign:'left', padding:'8px 10px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>
                  {(m.name || m.chatId)}
                </button>
              ))}
            </div>
            <div style={{ marginTop:8, display:'flex', justifyContent:'flex-end' }}>
              <button onClick={()=>setPickMember(false)} style={{ borderRadius:8, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', padding:'8px 12px' }}>Назад</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
