// src/components/GroupEdit.tsx
import { useState } from 'react';
import WebApp from '@twa-dev/sdk';

type Group = {
  id: string;
  title: string;
  ownerChatId: string;
  kind?: 'own' | 'member';
  isPublic?: boolean;
};

type Props = {
  group: Group;
  chatId: string; // текущий пользователь
  onClose: () => void;
  onRenamed: (newTitle: string) => void;
  onDeleted: () => void;
};

export default function GroupEdit({ group, chatId, onClose, onRenamed, onDeleted }: Props) {
  const isOwner = String(group.ownerChatId) === String(chatId) || group.kind === 'own';
  const [title, setTitle] = useState(group.title);
  const [busy, setBusy] = useState(false);
  const [isPublic, setIsPublic] = useState(!!group.isPublic);
  const [permOpen, setPermOpen] = useState(false);

  const save = async () => {
    if (!isOwner) return;
    const val = title.trim();
    if (!val) return;
    setBusy(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, title: val }),
      }).then((r) => r.json());
      if (!r?.ok) throw new Error(r?.error || 'save_failed');
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onRenamed(val);
      onClose();
    } catch (e) {
      console.error('[GroupEdit] save error', e);
      alert('Не удалось сохранить новое имя группы');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!isOwner) return;
    const sure1 = confirm('Удалить группу? ВНИМАНИЕ: будут удалены ВСЕ задачи этой группы.');
    if (!sure1) return;
    const sure2 = confirm('Точно удалить? Действие необратимо.');
    if (!sure2) return;

    setBusy(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/groups/${group.id}?chatId=${encodeURIComponent(chatId)}`, {
        method: 'DELETE',
      }).then((r) => r.json());
      if (!r?.ok) throw new Error(r?.error || 'delete_failed');
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onDeleted();
      onClose();
    } catch (e) {
      console.error('[GroupEdit] delete error', e);
      alert('Не удалось удалить группу');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setBusy(false);
    }
  };

  const togglePublic = async () => {
    if (!isOwner || busy) return;
    const makePublic = !isPublic;
    if (makePublic) {
      const ok = confirm('Внимание!\nТочно сделать группу публичной?\n\nВсе задачи группы будут общедоступны.');
      if (!ok) return;
    } else {
      const ok = confirm('Скрыть группу из публичного доступа? Подписчики будут отписаны автоматически.');
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/groups/${group.id}/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, public: makePublic }),
      }).then((r) => r.json());
      if (!r?.ok) throw new Error(r?.error || 'toggle_failed');
      setIsPublic(!!r.group?.isPublic);
      alert(r.group?.isPublic ? 'Группа стала публичной.' : 'Группа стала приватной.');
    } catch (e) {
      console.error('[GroupEdit] toggle public error', e);
      alert('Не удалось изменить публичность');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 92vw)',
          background: '#1b2030',
          border: '1px solid #2a3346',
          borderRadius: 16,
          padding: 16,
          color: '#e8eaed',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 16 }}>Редактирование группы</div>

        <label style={{ display: 'block', fontSize: 13, opacity: 0.85, marginBottom: 6 }}>Название группы</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!isOwner || busy}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 12,
            background: '#121722',
            color: '#e8eaed',
            border: '1px solid #2a3346',
            marginBottom: 12,
          }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={save}
            disabled={!isOwner || busy || !title.trim()}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: '#202840',
              color: '#e8eaed',
              border: '1px solid #2a3346',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Сохранить
          </button>

          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: '#1a2030',
              color: '#e8eaed',
              border: '1px solid #2a3346',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Отмена
          </button>

          <div style={{ flex: 1 }} />

          <button
            onClick={() => setPermOpen(true)}
            disabled={!isOwner || busy}
            title="Права группы"
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: '#202840',
              color: '#e8eaed',
              border: '1px solid #2a3346',
              cursor: isOwner && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            Права
          </button>

          <button
            onClick={togglePublic}
            disabled={!isOwner || busy}
            title={isOwner ? (isPublic ? 'Сделать приватной' : 'Сделать публичной') : 'Только владелец'}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: isPublic ? '#20311a' : '#203025',
              color: '#b7ffb7',
              border: '1px solid #2a4a2a',
              cursor: isOwner && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            {isPublic ? 'Сделать приватной' : 'Сделать публичной 🌍'}
          </button>

          <button
            onClick={remove}
            disabled={!isOwner || busy}
            title={isOwner ? 'Удалить группу (без возврата)' : 'Удалять может только владелец'}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: isOwner ? '#3a1f1f' : '#2a2a2a',
              color: '#ffd7d7',
              border: '1px solid #472a2a',
              cursor: isOwner && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            Удалить группу
          </button>
      </div>

      {!isOwner && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          Редактировать и удалять группу может только её владелец.
        </div>
      )}

      {permOpen && (
        <PermissionsModal groupId={group.id} chatId={chatId} onClose={() => setPermOpen(false)} />
      )}
    </div>
  </div>
);
}

function PermissionsModal({ groupId, chatId, onClose }: { groupId: string; chatId: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [defaults, setDefaults] = useState<{ viewOwnOnly: boolean; changeStatusAny: boolean; canCreateTasks: boolean; edit: any } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/groups/${groupId}/permissions`).then(r=>r.json());
      if (!r?.ok) throw new Error(r?.error || 'load_failed');
      setDefaults(r.permissions || { viewOwnOnly:false, changeStatusAny:true, canCreateTasks:true, edit:null });
    } catch (e:any) {
      setError(e?.message || 'Ошибка загрузки');
    } finally { setBusy(false); }
  };
  if (defaults === null && !busy) { void load(); }

  const save = async () => {
    if (!defaults) return;
    setBusy(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/groups/${groupId}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, permissions: defaults }),
      }).then(r=>r.json());
      if (!r?.ok) throw new Error(r?.error || 'save_failed');
      onClose();
    } catch (e:any) { setError(e?.message || 'Ошибка сохранения'); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ width:'min(520px,92vw)', background:'#1b2030', border:'1px solid #2a3346', borderRadius:16, padding:16, color:'#e8eaed' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontWeight:700 }}>Права группы</div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#9ca3af', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>
        {error ? (<div style={{ color:'#fecaca', marginBottom:8 }}>{error}</div>) : null}
        {!defaults ? (
          <div style={{ opacity:.8 }}>Загрузка…</div>
        ) : (
          <div style={{ display:'grid', gap:10 }}>
            <label><input type="checkbox" checked={defaults.viewOwnOnly} onChange={(e)=>setDefaults(d=>({ ...(d as any), viewOwnOnly: e.target.checked }))} /> Могут видеть только свои задачи</label>
            <label><input type="checkbox" checked={defaults.changeStatusAny} onChange={(e)=>setDefaults(d=>({ ...(d as any), changeStatusAny: e.target.checked }))} /> Могут менять статус задач</label>
            <label><input type="checkbox" checked={defaults.canCreateTasks} onChange={(e)=>setDefaults(d=>({ ...(d as any), canCreateTasks: e.target.checked }))} /> Могут ставить задачи в группе</label>
            <div style={{ marginTop:6, fontSize:12, opacity:.85 }}>Дополнительно: изменения задачи</div>
            <div style={{ display:'grid', gap:6, fontSize:13 }}>
              {['assignee','text','labels','accept','expenses','deadline','reminders','watchers','delete'].map((k)=> (
                <label key={k}><input type="checkbox" checked={!!(defaults.edit?.[k])} onChange={(e)=>setDefaults(d=>({ ...(d as any), edit: { ...((d as any).edit||{}), [k]: e.target.checked } }))} /> {labelForEdit(k)}</label>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
              <button onClick={onClose} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отмена</button>
              <button onClick={save} disabled={busy} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid transparent', background:'#2563eb', color:'#fff', opacity: busy?0.6:1 }}>Сохранить</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function labelForEdit(k: string) {
  switch (k) {
    case 'assignee': return 'Изменять ответственного';
    case 'text': return 'Изменять текст';
    case 'labels': return 'Изменять ярлыки';
    case 'accept': return 'Изменять условия приёма';
    case 'expenses': return 'Изменять затраты';
    case 'deadline': return 'Изменять дедлайн';
    case 'reminders': return 'Изменять напоминания';
    case 'watchers': return 'Добавлять наблюдателей';
    case 'delete': return 'Удалять задачи';
    default: return k;
  }
}
