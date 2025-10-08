// src/components/GroupMembers.tsx
import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { Group } from '../api';
import {
  getGroupMembers,
  createGroupInvite,
  removeGroupMember,
  leaveGroup,
  type GroupMember,
  getGroupMemberDescription,
  setGroupMemberDescription,
  getGroupMemberPerms,
  setGroupMemberPerms,
} from '../api';
import OverlayModal from './OverlayModal';

type Props = {
  group: Group;
  chatId: string;
  isOwner: boolean;
  onChanged?: () => void;           // дернуть, если что-то поменяли (перегрузить списки)
  onLeftGroup?: () => void;         // если текущий пользователь вышел из группы
};

export default function GroupMembers({ group, chatId, isOwner, onChanged, onLeftGroup }: Props) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [owner, setOwner] = useState<GroupMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editTarget, setEditTarget] = useState<GroupMember | null>(null);
  const [descDraft, setDescDraft] = useState<string>('');
  const [savingDesc, setSavingDesc] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [permLoading, setPermLoading] = useState(false);
  const [permDraft, setPermDraft] = useState<any>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await getGroupMembers(group.id);
      if (!r.ok) throw new Error('load_error');
      setOwner(r.owner || null);
      setMembers(r.members || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки участников');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [group.id]);

  const handleInvite = async () => {
    try {
      setBusy(true);
      // Отправляем инвайт в группу: backend должен вернуть link/shareText (как для задач)
      const r = await createGroupInvite({ chatId, groupId: group.id });
      if (!r?.ok || !r?.link) throw new Error('invite_error');

      const text =
        r.shareText ||
        `Вас приглашают в группу «${group.title}». Нажмите, чтобы принять.`;
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent(text)}`;

      WebApp?.openTelegramLink?.(shareUrl);

      WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch (e) {
      console.error('[GROUP INVITE] error', e);
      alert('Не удалось создать приглашение');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (member: GroupMember) => {
    if (!isOwner) return;
    if (String(member.chatId) === String(owner?.chatId)) return; // владельца нельзя удалять
    // два подтверждения, как просил
    if (!confirm(`Удалить участника «${member.name || member.chatId}» из группы?`)) return;
    if (!confirm('Внимание: все задачи этого участника в группе перейдут владельцу. Продолжить?')) return;

    try {
      setBusy(true);
   const r = await removeGroupMember(group.id, String(member.chatId), chatId);

      if (!r.ok) throw new Error('remove_error');
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      await reload();
      onChanged?.();
    } catch (e) {
      console.error('[GROUP REMOVE MEMBER] error', e);
      alert('Не удалось удалить участника');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (isOwner) return; // владелец не может «выйти», только удалить группу
    if (!confirm('Выйти из группы? Все задачи на вас перейдут владельцу.')) return;

    try {
      setBusy(true);
      const r = await leaveGroup(group.id, chatId);
      if (!r.ok) throw new Error('leave_error');
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onLeftGroup?.();   // родитель сбросит в список групп
    } catch (e) {
      console.error('[GROUP LEAVE] error', e);
      alert('Не удалось выйти из группы');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setBusy(false);
    }
  };

  const meIsOwner = isOwner;

  const openEdit = async (m: GroupMember) => {
    try {
      setEditTarget(m);
      setDescDraft('');
      // Подтянем текущее описание (если есть)
      const r = await getGroupMemberDescription(group.id, String(m.chatId));
      if (r?.ok) setDescDraft(String(r.description || ''));
      // Подтянем права участника
      setPermLoading(true);
      try {
        const pr = await getGroupMemberPerms(group.id, String(m.chatId));
        setPermDraft(pr?.overrides || {});
      } catch {}
      finally { setPermLoading(false); }
    } catch {}
  };

  const saveDescription = async () => {
    if (!editTarget) return;
    try {
      setSavingDesc(true);
      const r = await setGroupMemberDescription({
        groupId: group.id,
        memberChatId: String(editTarget.chatId),
        byChatId: String(chatId),
        description: descDraft,
      });
      if (!r?.ok) throw new Error('save_failed');
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      // оставляем окно управления участником открытым
      setDescOpen(false);
      await reload();
      onChanged?.();
    } catch (e) {
      console.error('[GROUP MEMBER] save description error', e);
      alert('Не удалось сохранить описание');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setSavingDesc(false);
    }
  };

  const savePerms = async () => {
    if (!editTarget) return;
    try {
      await setGroupMemberPerms(group.id, chatId, String(editTarget.chatId || ''), permDraft || {});
      alert('Права сохранены');
      setPermOpen(false);
    } catch {
      alert('Не удалось сохранить права');
    }
  };

  return (
    <div
      style={{
        padding: 16,
        background: '#1b2030',
        border: '1px solid #2a3346',
        borderRadius: 16,
        minHeight: 240,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Участники группы</div>
        {meIsOwner ? (
          <button
            onClick={handleInvite}
            disabled={busy}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #2a3346',
              background: '#202840',
              color: '#e8eaed',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Пригласить в группу
          </button>
        ) : null}
      </div>

      {loading ? <div>Загрузка…</div> : null}
      {error ? <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div> : null}

      {/* Владелец */}
      {owner ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: '1px solid #2a3346',
            background: '#121722',
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Владелец</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>👑</span>
            <div style={{ fontWeight: 600 }}>{owner.name || owner.chatId}</div>
          </div>
        </div>
      ) : null}

      {/* Список участников */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {members.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Участников пока нет.</div>
        ) : (
          members.map((m) => {
            const isOwnerRow = String(m.chatId) === String(owner?.chatId);
            const isMe = String(m.chatId) === String(chatId);
            return (
              <div
                key={String(m.chatId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #2a3346',
                  background: '#0f141f',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>{isOwnerRow ? '👑' : '👤'}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {m.name || m.chatId} {isMe ? <span style={{ opacity: 0.6, fontWeight: 400 }}>(это вы)</span> : null}
                      {m.hasDescription ? <span title="Есть описание" style={{ marginLeft: 6 }}>📜</span> : null}
                    </div>
                    {m.assignedCount != null ? (
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Задач на участнике: {m.assignedCount}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* ✏️ только у владельца; не показываем для строки-плейсхолдера приглашений */}
                {meIsOwner && !isOwnerRow && m.role !== 'invited' ? (
                  <button
                    onClick={() => openEdit(m)}
                    title="Управление участником"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#8aa0ff',
                      cursor: 'pointer',
                      fontSize: 16,
                      padding: 2,
                      lineHeight: 1,
                    }}
                  >
                    ✏️
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Кнопка «выйти из группы» — только не владельцу */}
      {!meIsOwner ? (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={handleLeave}
            disabled={busy}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #472a2a',
              background: '#3a1f1f',
              color: '#ffd7d7',
              cursor: busy ? 'default' : 'pointer',
              width: '100%',
            }}
          >
            Выйти из группы
          </button>
        </div>
      ) : null}

      {/* Модалка управления участником: удалить / описание / права (заглушка) */}
      <OverlayModal open={!!editTarget} onClose={() => setEditTarget(null)}>
        <div style={{ display:'grid', gap:12 }}>
          <div style={{ fontWeight:700, fontSize:16 }}>Участник: {editTarget?.name || editTarget?.chatId}</div>

          <div>
            <div style={{ fontSize:13, opacity:.8, marginBottom:6 }}>Действия</div>
            <div style={{ display:'grid', gap:8 }}>
              <button
                onClick={() => setDescOpen(true)}
                style={{ padding:'8px 10px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', cursor:'pointer', textAlign:'left' }}
              >
                📜 Описание участника
              </button>
              <button
                onClick={() => setPermOpen(true)}
                style={{ padding:'8px 10px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', cursor:'pointer', textAlign:'left' }}
              >
                🛡️ Права
              </button>
              <button
                onClick={() => { if (editTarget) handleRemove(editTarget); }}
                style={{ padding:'8px 10px', borderRadius:10, border:'1px solid #472a2a', background:'#3a1f1f', color:'#ffd7d7', cursor:'pointer', textAlign:'left' }}
              >
                Удалить участника из группы
              </button>
            </div>
          </div>

          {/* Права перенесены в отдельную модалку */}
        </div>
      </OverlayModal>

      {/* Отдельная модалка для редактирования описания */}
      <OverlayModal open={!!editTarget && descOpen} onClose={() => setDescOpen(false)}>
        <div style={{ display:'grid', gap:12 }}>
          <div style={{ fontWeight:700, fontSize:16 }}>Описание: {editTarget?.name || editTarget?.chatId}</div>
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            placeholder="Кто он, что умеет, заметки по роли в этой группе…"
            style={{ width:'100%', maxWidth:'100%', boxSizing:'border-box', minWidth:0, minHeight:120, padding:'10px 12px', borderRadius:12, border:'1px solid #2a3346', background:'#121722', color:'#e8eaed' }}
          />
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={() => setDescOpen(false)} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'transparent', color:'#9fb1ff', cursor:'pointer' }}>Отмена</button>
            <button onClick={saveDescription} disabled={savingDesc} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', cursor: savingDesc ? 'default' : 'pointer' }}>Сохранить</button>
          </div>
        </div>
      </OverlayModal>

      {/* Отдельная модалка для прав участника */}
      <OverlayModal open={!!editTarget && permOpen} onClose={() => setPermOpen(false)}>
        <div style={{ display:'grid', gap:12 }}>
          <div style={{ fontWeight:700, fontSize:16 }}>Права: {editTarget?.name || editTarget?.chatId}</div>
          {permLoading ? (
            <div style={{ opacity:.7 }}>Загрузка…</div>
          ) : (
            <div style={{ display:'grid', gap:6, fontSize:13 }}>
              <label><input type="checkbox" checked={!!permDraft?.canCreateTasks} onChange={(e)=>setPermDraft((d:any)=>({ ...(d||{}), canCreateTasks: e.target.checked }))} /> Может ставить задачи в группе</label>
              <label><input type="checkbox" checked={!!permDraft?.changeStatusAny} onChange={(e)=>setPermDraft((d:any)=>({ ...(d||{}), changeStatusAny: e.target.checked }))} /> Может менять статус любых задач</label>
              <label><input type="checkbox" checked={permDraft?.viewOwnOnly===false} onChange={(e)=>setPermDraft((d:any)=>({ ...(d||{}), viewOwnOnly: e.target.checked ? false : undefined }))} /> Видеть все задачи (снять ограничение)</label>
              <div style={{ marginTop:6, opacity:.85 }}>Изменение деталей задачи:</div>
              {['assignee','text','labels','accept','expenses','deadline','reminders','watchers','comments','delete'].map((k)=> (
                <label key={k}><input type="checkbox" checked={!!(permDraft?.edit?.[k])} onChange={(e)=>setPermDraft((d:any)=>({ ...(d||{}), edit: { ...((d as any)?.edit||{}), [k]: e.target.checked } }))} /> {labelForEdit(k)}</label>
              ))}
              <div style={{ display:'flex', gap:8, marginTop:8, justifyContent:'flex-end' }}>
                <button onClick={() => setPermOpen(false)} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'transparent', color:'#9fb1ff', cursor:'pointer' }}>Отмена</button>
                <button onClick={savePerms} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2a3346', background:'#202840', color:'#e8eaed', cursor:'pointer' }}>Сохранить</button>
              </div>
            </div>
          )}
        </div>
      </OverlayModal>
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
