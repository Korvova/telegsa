import React from 'react';
import { createGroup } from '../api';

const EMOJIS = [
  '📁','🗂️','🧩','🚀','⚙️','🛠️','🧠','📝','🎯','🏗️','🧪','📊','💡','📈','🧰','🕹️','🛡️','🧵','📦','🗃️',
  '🌟','🔥','✨','⚡','🌈','🦾','🛰️','🔧','🔩','🧱'
];

export default function CreateGroupModal({
  open,
  chatId,
  onClose,
  onCreated,
}: {
  open: boolean;
  chatId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [icon, setIcon] = React.useState<string>(EMOJIS[0]);

  React.useEffect(() => {
    if (open) {
      setTitle('');
      setBusy(false);
      setIcon(EMOJIS[0]);
    }
  }, [open]);

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && !!icon;

  const submit = async () => {
    if (!canSubmit || busy) return;
    try {
      setBusy(true);
      const full = `${icon} ${title.trim()}`;
      const r = await createGroup(chatId, full);
      if (!(r as any)?.ok) throw new Error('create_failed');
      onCreated();
      onClose();
    } catch (e: any) {
      alert(e?.message || 'Не удалось создать проект');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:2500 }}
    >
      <div onClick={(e)=>e.stopPropagation()} style={{ width:'min(520px, 92vw)', background:'#1b2030', border:'1px solid #2a3346', borderRadius:16, padding:16, color:'#e8eaed' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontWeight:700, fontSize:16 }}>Создать проект</div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#9ca3af', fontSize:18, cursor:'pointer' }} aria-label="Закрыть">✕</button>
        </div>

        <label style={{ display:'block', fontSize:13, opacity:.85, marginBottom:6 }}>Название проекта</label>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
          <div title="Иконка проекта" style={{ width:36, height:36, borderRadius:10, border:'1px solid #2a3346', background:'#121722', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
            {icon}
          </div>
          <input
            value={title}
            onChange={(e)=>setTitle(e.target.value)}
            placeholder="Например: Сайт компании"
            style={{ flex:1, padding:'10px 12px', borderRadius:12, background:'#121722', color:'#e8eaed', border:'1px solid #2a3346' }}
          />
        </div>

        <div style={{ fontSize:13, opacity:.85, margin:'6px 0' }}>Иконка проекта</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(8, 1fr)', gap:6, marginBottom:12 }}>
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setIcon(e)}
              title={e}
              style={{
                height:36,
                borderRadius:8,
                border: icon===e ? '2px solid #facc15' : '1px solid #2a3346',
                background:'#121722',
                color:'#e8eaed',
                display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'pointer',
              }}
            >{e}</button>
          ))}
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onClose} style={{ padding:'10px 14px', borderRadius:12, background:'#121a32', color:'#e8eaed', border:'1px solid #2a3346' }}>Отмена</button>
          <button onClick={submit} disabled={!canSubmit || busy} style={{ padding:'10px 14px', borderRadius:12, background:'#facc15', color:'#111827', border:'1px solid #856a0e', fontWeight:700, opacity: (!canSubmit||busy)?0.7:1 }}>
            {busy ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

