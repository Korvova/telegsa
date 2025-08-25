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
} from '../api';

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
                    </div>
                    {m.assignedCount != null ? (
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Задач на участнике: {m.assignedCount}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* ✏️ только у владельца и только не-владельца можно удалить */}
                {meIsOwner && !isOwnerRow ? (
                  <button
                    onClick={() => handleRemove(m)}
                    title="Удалить участника (задачи перейдут владельцу)"
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
    </div>
  );
}
