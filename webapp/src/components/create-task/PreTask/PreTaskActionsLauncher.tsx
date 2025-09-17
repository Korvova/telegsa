import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import WebApp from '@twa-dev/sdk';

type MemberOption = { chatId: string; name: string };

export default function PreTaskActionsLauncher({
  label = '➤',
  disabled,
  style,
  meChatId,
  members = [],
  onMakePreTask,
}: {
  label?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  meChatId: string;
  members?: MemberOption[];
  onMakePreTask: (plannedAssigneeChatId: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subView, setSubView] = useState<'root' | 'members'>('root');

  function openSheet() {
    if (disabled) return;
    setOpen(true);
    setSubView('root');
  }
  function closeSheet() {
    if (busy) return;
    setOpen(false);
    setSubView('root');
  }

  async function runSafely(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      try { WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
      closeSheet();
    } catch (e) {
      console.error('[PreTaskActionsLauncher] error', e);
      try { WebApp?.HapticFeedback?.notificationOccurred?.('error'); } catch {}
      alert('Не удалось создать предзадачу.');
    } finally { setBusy(false); }
  }

  const doAssignSelf = () => runSafely(async () => { await onMakePreTask(meChatId || null); });
  const doAssignMember = (m: MemberOption) => runSafely(async () => { await onMakePreTask(m.chatId); });

  const sheet = !open ? null : (
    <div onClick={closeSheet} style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', padding:12 }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:520, background:'#131a26', border:'1px solid #2a3346', borderRadius:16, padding:12, color:'#fff', boxShadow:'0 16px 50px rgba(0,0,0,.45)' }}>
        {subView==='root' ? (
          <>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:10 }}>Кого сделать ответственным?</div>
            <button disabled={busy} style={styles.btn} onClick={doAssignSelf}>Сделать себя ответственным</button>
            <button disabled={busy || members.length===0} style={styles.btn} onClick={()=>setSubView('members')}>Выбрать из группы</button>
            <div style={{ fontSize:12, opacity:0.7, marginTop:8, textAlign:'center' }}>Предзадача запустится по условиям. Ответственный будет назначен при запуске.</div>
            <button style={styles.closeBtn} onClick={closeSheet}>Закрыть</button>
          </>
        ) : (
          <>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:10 }}>Выберите участника группы</div>
            <div style={{ maxHeight:320, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
              {members.map(m => (
                <div key={m.chatId} style={styles.row}>
                  <div style={{ display:'flex', flexDirection:'column' }}>
                    <div style={{ fontSize:15 }}>{m.name || m.chatId}</div>
                    <div style={{ fontSize:12, opacity:0.7 }}>{m.chatId}</div>
                  </div>
                  <button disabled={busy} style={styles.smallBtn} onClick={()=>doAssignMember(m)}>Выбрать</button>
                </div>
              ))}
              {members.length===0 && (<div style={{ opacity:0.7, textAlign:'center', padding:8 }}>В группе пока нет участников.</div>)}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button style={styles.btn} onClick={()=>setSubView('root')}>Назад</button>
              <button style={styles.closeBtn} onClick={closeSheet}>Закрыть</button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <button disabled={disabled} onClick={openSheet} style={{ width:'100%', height:'100%', borderRadius:999, background: disabled ? '#2a3350' : '#2563eb', color:'#fff', border:'1px solid transparent', cursor: disabled ? 'default' : 'pointer', ...style }}>{label}</button>
      {sheet ? createPortal(sheet, document.body) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid #2a3346',
    background: '#202840',
    color: '#e8eaed',
    cursor: 'pointer',
    marginBottom: 8,
    textAlign: 'center',
  },
  smallBtn: {
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid #2a3346',
    background: '#202840',
    color: '#e8eaed',
    cursor: 'pointer',
  },
  closeBtn: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid #2a3346',
    background: '#1f222b',
    color: '#e8eaed',
    cursor: 'pointer',
    marginBottom: 8,
    textAlign: 'center',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 8,
    borderRadius: 10,
    border: '1px solid #2a3346',
  },
};

