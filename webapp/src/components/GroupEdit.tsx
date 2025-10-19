// src/components/GroupEdit.tsx
import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { getGroupLabels, createGroupLabel, updateGroupLabel, deleteGroupLabel, type GroupLabel } from '../api';

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
  const [descOpen, setDescOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);

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
            onClick={() => setDescOpen(true)}
            disabled={!isOwner || busy}
            title="Описание группы"
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: '#202840',
              color: '#e8eaed',
              border: '1px solid #2a3346',
              cursor: isOwner && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            Описание группы
          </button>

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
            onClick={() => setLabelsOpen(true)}
            disabled={!isOwner || busy}
            title="Ярлыки группы"
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: '#202840',
              color: '#e8eaed',
              border: '1px solid #2a3346',
              cursor: isOwner && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            🏷️ Ярлыки
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

      {labelsOpen && (
        <GroupLabelsModal groupId={group.id} chatId={chatId} onClose={() => setLabelsOpen(false)} />
      )}

      {descOpen && (
        <GroupDescriptionModal groupId={group.id} chatId={chatId} onClose={() => setDescOpen(false)} />
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
            <div style={{ marginTop:6, fontSize:12, opacity:.85 }}>Дополнительно: изменения задачи (по умолчанию разрешены; снимите галочку, чтобы запретить для всех, кроме владельца)</div>
            <div style={{ display:'grid', gap:6, fontSize:13 }}>
              {['assignee','text','labels','accept','expenses','deadline','reminders','watchers','comments','delete'].map((k)=> (
                <label key={k}>
                  <input
                    type="checkbox"
                    // если undefined — считаем «разрешено» (галочка стоит)
                    checked={(defaults.edit ? (defaults.edit as any)[k] !== false : true)}
                    onChange={(e)=>{
                      const allow = e.target.checked;
                      setDefaults(d=>{
                        const cur = (d as any) || {};
                        const edit = { ...(cur.edit || {}) };
                        edit[k] = allow ? true : false; // true/false сохраняем явно
                        return { ...cur, edit } as any;
                      });
                    }}
                  /> {labelForEdit(k)}
                </label>
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
    case 'comments': return 'Оставлять комментарии';
    case 'delete': return 'Удалять задачи';
    default: return k;
  }
}

function GroupDescriptionModal({ groupId, chatId, onClose }: { groupId: string; chatId: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const MAX = 28000;

  const load = async () => {
    if (loaded || busy) return;
    setBusy(true);
    try {
      const api = await import('../api');
      const r = await api.getGroupDescription(groupId);
      if (r?.ok) setValue(r.description || '');
      setLoaded(true);
    } catch (e: any) { setErr(e?.message || 'Ошибка загрузки'); }
    finally { setBusy(false); }
  };
  if (!loaded && !busy) { void load(); }

  const save = async () => {
    setBusy(true);
    try {
      const api = await import('../api');
      const text = (value || '').slice(0, MAX);
      const r = await api.setGroupDescription({ groupId, byChatId: chatId, description: text });
      if (!r?.ok) throw new Error('save_failed');
      onClose();
    } catch (e: any) { setErr(e?.message || 'Ошибка сохранения'); }
    finally { setBusy(false); }
  };

  const left = MAX - (value?.length || 0);

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ width:'min(680px,94vw)', background:'#1b2030', border:'1px solid #2a3346', borderRadius:16, padding:16, color:'#e8eaed' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontWeight:700 }}>Описание группы</div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#9ca3af', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>
        {err ? (<div style={{ color:'#fecaca', marginBottom:8 }}>{err}</div>) : null}
        <div style={{ fontSize:12, opacity:.85, marginBottom:6 }}>Расскажите, зачем эта группа, адреса, ссылки и прочие данные.</div>
        <textarea
          value={value}
          onChange={(e)=>{ const v = e.target.value.slice(0, MAX); setValue(v); }}
          rows={12}
          placeholder="Описание группы (до 28 000 символов)"
          style={{ width:'90%', minHeight: 200, resize:'vertical', padding:'10px 12px', borderRadius:12, border:'1px solid #2a3346', background:'#121722', color:'#e8eaed' }}
        />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8, fontSize:12, opacity:.85 }}>
          <div>Осталось символов: {left >= 0 ? left : 0}</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} disabled={busy} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed' }}>Отмена</button>
            <button onClick={save} disabled={busy} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid transparent', background:'#2563eb', color:'#fff', opacity: busy?0.6:1 }}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupLabelsModal({ groupId, chatId, onClose }: { groupId: string; chatId: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [labels, setLabels] = useState<GroupLabel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    loadLabels();
  }, [groupId]);

  const loadLabels = async () => {
    setBusy(true);
    try {
      const result = await getGroupLabels(groupId);
      setLabels(result);
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки ярлыков');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (label: GroupLabel) => {
    setEditingId(label.id);
    setEditingTitle(label.title);
  };

  const saveEdit = async () => {
    if (!editingId || !editingTitle.trim()) return;
    setBusy(true);
    try {
      const updated = await updateGroupLabel(groupId, editingId, { chatId, title: editingTitle.trim() });
      setLabels(labels.map((l) => (l.id === updated.id ? updated : l)));
      setEditingId(null);
      setEditingTitle('');
    } catch (e: any) {
      setError(e?.message || 'Не удалось переименовать');
    } finally {
      setBusy(false);
    }
  };

  const removeLabel = async (labelId: string) => {
    if (!confirm('Удалить ярлык? Он будет удалён со всех задач.')) return;
    setBusy(true);
    try {
      await deleteGroupLabel(groupId, labelId, chatId);
      setLabels(labels.filter((l) => l.id !== labelId));
      if (editingId === labelId) {
        setEditingId(null);
        setEditingTitle('');
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить');
    } finally {
      setBusy(false);
    }
  };

  const createLabel = async () => {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      const created = await createGroupLabel(groupId, { chatId, title: newTitle.trim() });
      setLabels([...labels, created].sort((a, b) => a.order - b.order));
      setNewTitle('');
      setCreating(false);
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.5)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 92vw)',
          maxHeight: '80vh',
          overflow: 'auto',
          background: '#1b2030',
          border: '1px solid #2a3346',
          borderRadius: 16,
          padding: 16,
          color: '#e8eaed',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>🏷️ Ярлыки группы</div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{ color: '#fecaca', marginBottom: 12, padding: 8, background: '#3a1f1f', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 12 }}>
          Создавайте ярлыки для организации задач в группе. Ярлыки можно присваивать задачам.
        </div>

        {/* Список ярлыков */}
        <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          {labels.map((label) => (
            <div
              key={label.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 10,
                background: '#121722',
                border: '1px solid #2a3346',
                borderRadius: 10,
              }}
            >
              {editingId === label.id ? (
                <>
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') {
                        setEditingId(null);
                        setEditingTitle('');
                      }
                    }}
                    autoFocus
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: '#0b1220',
                      color: '#e8eaed',
                      border: '1px solid #2a3346',
                    }}
                  />
                  <button
                    onClick={saveEdit}
                    disabled={busy}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      cursor: busy ? 'default' : 'pointer',
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditingTitle('');
                    }}
                    disabled={busy}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: '#374151',
                      color: '#e8eaed',
                      border: 'none',
                      cursor: busy ? 'default' : 'pointer',
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 14 }}>🏷️ {label.title}</span>
                  <button
                    onClick={() => startEdit(label)}
                    disabled={busy}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: '#202840',
                      color: '#e8eaed',
                      border: '1px solid #2a3346',
                      cursor: busy ? 'default' : 'pointer',
                      fontSize: 12,
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => removeLabel(label.id)}
                    disabled={busy}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: '#3a1f1f',
                      color: '#ffd7d7',
                      border: '1px solid #472a2a',
                      cursor: busy ? 'default' : 'pointer',
                      fontSize: 12,
                    }}
                  >
                    🗑️
                  </button>
                </>
              )}
            </div>
          ))}

          {labels.length === 0 && !creating && (
            <div style={{ textAlign: 'center', padding: 20, opacity: 0.6, fontSize: 14 }}>
              Ярлыков пока нет. Создайте первый ярлык!
            </div>
          )}
        </div>

        {/* Создание нового ярлыка */}
        {creating ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createLabel();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setNewTitle('');
                }
              }}
              placeholder="Название ярлыка"
              autoFocus
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 10,
                background: '#121722',
                color: '#e8eaed',
                border: '1px solid #2a3346',
              }}
            />
            <button
              onClick={createLabel}
              disabled={busy || !newTitle.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                cursor: busy || !newTitle.trim() ? 'default' : 'pointer',
                opacity: busy || !newTitle.trim() ? 0.6 : 1,
              }}
            >
              Создать
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setNewTitle('');
              }}
              disabled={busy}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                background: '#374151',
                color: '#e8eaed',
                border: 'none',
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              Отмена
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            disabled={busy}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 10,
              background: '#203025',
              color: '#b7ffb7',
              border: '1px solid #2a4a2a',
              cursor: busy ? 'default' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            + Создать ярлык
          </button>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              background: '#202840',
              color: '#e8eaed',
              border: '1px solid #2a3346',
              cursor: 'pointer',
            }}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
