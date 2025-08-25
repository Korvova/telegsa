// src/TaskView.tsx
import { useEffect, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { Task } from './api';
import { listGroups } from './api';
import {
  getTask,
  getTaskWithGroup,
  updateTask,
  completeTask,
  reopenTask,
  deleteTask,
  createInvite,
  forwardTask,
  prepareShareMessage,
} from './api';

type Props = {
  taskId: string;
  onClose: (groupId?: string | null) => void;
  onChanged: () => void;
};

export default function TaskView({ taskId, onClose, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<Task | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<string | undefined>(undefined);
  const isDone = phase === 'Done';

  // 🔹 заголовок группы
  const [groupTitle, setGroupTitle] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  // куда вернуться при закрытии (источник истины остаётся ref)
  const groupIdRef = useRef<string | null | undefined>(undefined);

  // мягкий «тик» для перезапуска поллинга при надобности
  const [refreshTick, setRefreshTick] = useState(0);

  /* --- системная кнопка "Назад" --- */
  useEffect(() => {
    const onceRef = { done: false, t: 0 as any };

    const handle = () => {
      if (onceRef.done) return;
      onceRef.done = true;
      clearTimeout(onceRef.t);
      onceRef.t = setTimeout(() => (onceRef.done = false), 300);
      onClose(groupIdRef.current);
    };

    try {
      WebApp?.BackButton?.show?.();
    } catch {}
    WebApp?.onEvent?.('backButtonClicked', handle);
    WebApp?.BackButton?.onClick?.(handle);

    return () => {
      WebApp?.offEvent?.('backButtonClicked', handle);
      WebApp?.BackButton?.offClick?.(handle);
      try {
        WebApp?.BackButton?.hide?.();
      } catch {}
    };
  }, [onClose]);

  /* --- загрузка задачи + группы/фазы --- */
  useEffect(() => {
    let ignore = false;
    setLoading(true);

    getTask(taskId)
      .then(async (tResp) => {
        if (ignore) return;
        setTask(tResp.task);
        setText(tResp.task.text);
        try {
          const gResp = await getTaskWithGroup(taskId);
          groupIdRef.current = gResp?.groupId ?? null;
          setGroupId(groupIdRef.current);            // 🔹 реактивно
          setPhase(gResp?.phase);
        } catch {
          const gid = new URLSearchParams(location.search).get('group');
          groupIdRef.current = gid || null;
          setGroupId(groupIdRef.current);            // 🔹 реактивно
          setPhase(undefined);
        }
      })
      .catch(() => {
        const gid = new URLSearchParams(location.search).get('group');
        groupIdRef.current = gid || null;
        setGroupId(groupIdRef.current);              // 🔹 реактивно
        setTask(null);
      })
      .finally(() => !ignore && setLoading(false));

    return () => {
      ignore = true;
    };
  }, [taskId]);

  /* --- название группы по groupId --- */
  useEffect(() => {
    if (!groupId) {
      setGroupTitle(null);
      return;
    }
    const me =
      WebApp?.initDataUnsafe?.user?.id ||
      new URLSearchParams(location.search).get('from');
    if (!me) return;

    listGroups(String(me))
      .then((r) => {
        if (r.ok) {
          const g = r.groups.find((x: any) => x.id === groupId);
          setGroupTitle(g ? g.title : null);
        }
      })
      .catch(() => {});
  }, [groupId]);

  /* --- мягкий поллинг, пока карточка открыта (обновление ответственного и т.п.) --- */
  useEffect(() => {
    let t: any = null;
    let alive = true;

    const tick = async () => {
      try {
        const r = await getTask(taskId);
        if (!alive) return;
        setTask(r.task);
        if (typeof (r as any)?.phase === 'string') setPhase((r as any).phase);
      } catch {}
      t = setTimeout(tick, 4000);
    };

    t = setTimeout(tick, 4000);
    return () => { alive = false; clearTimeout(t); };
  }, [taskId, refreshTick]);

  /* --- действия --- */
  const save = async () => {
    const val = text.trim();
    if (!val) return;
    setSaving(true);
    try {
      await updateTask(taskId, val);
      onChanged?.();
      WebApp?.HapticFeedback?.impactOccurred?.('light');
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async () => {
    setSaving(true);
    try {
      if (isDone) {
        await reopenTask(taskId);
        setPhase('Doing');
      } else {
        await completeTask(taskId);
        setPhase('Done');
      }
      onChanged?.();
      WebApp?.HapticFeedback?.impactOccurred?.('medium');
    } catch (e: any) {
      setError(e?.message || 'Ошибка операции');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить задачу? Действие необратимо.')) return;
    try {
      const resp = await deleteTask(taskId);
      const gid = (resp && 'groupId' in resp) ? (resp as any).groupId : groupIdRef.current;
      onChanged?.();
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      onClose(gid ?? undefined);
    } catch (e) {
      console.error('[DELETE] error', e);
      alert('Не удалось удалить задачу');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    }
  };

  const handleInviteAssignee = async () => {
    try {
      const me =
        WebApp?.initDataUnsafe?.user?.id ||
        new URLSearchParams(location.search).get('from');

      const r = await createInvite({
        chatId: String(me || ''),
        type: 'task',
        taskId,
      });

      if (!r?.ok || !r?.link) throw new Error('invite_error');

      const text = r.shareText || 'Вас назначают ответственным за задачу';
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent(text)}`;

      WebApp?.openTelegramLink?.(shareUrl);

      // 🔁 быстрый поллинг в течение ~15 сек, чтобы моментально показать назначение
      const started = Date.now();
      const fastPull = async () => {
        try {
          const t = await getTask(taskId);
          setTask(t.task);
          if (t.task?.assigneeChatId) return;
        } catch {}
        if (Date.now() - started < 15000) {
          setTimeout(fastPull, 1500);
        } else {
          setRefreshTick((x) => x + 1);
        }
      };
      fastPull();

      WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch (e) {
      console.error('[INVITE] error', e);
      alert('Не удалось создать приглашение');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    }
  };

  const handleForward = async () => {
    try {
      const raw = prompt(
        'Введи chat_id пользователя (число). Важно: пользователь должен нажать Start у бота.'
      );
      const to = (raw || '').trim();
      if (!to) return;

      const r = await forwardTask(taskId, to);
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      alert(
        r?.method === 'forward'
          ? 'Переслано исходное сообщение (без кнопки — это ограничение forward).'
          : 'Отправлено новое сообщение с кнопкой “Открыть”.'
      );
    } catch (e) {
      console.error('[FORWARD] error', e);
      alert('Не удалось отправить. Проверь, что пользователь начал диалог с ботом.');
      WebApp?.HapticFeedback?.notificationOccurred?.('error');
    }
  };

  const handleShare = async () => {
    try {
      const TG: any = (window as any).Telegram?.WebApp || WebApp;

      const meId = TG?.initDataUnsafe?.user?.id;
      if (!meId) {
        WebApp?.HapticFeedback?.notificationOccurred?.('error');
        return alert('Не найден user.id из Telegram WebApp. Открой через Telegram.');
      }

      // теперь сервер создаёт TASK-инвайт и кладёт assign__<id>__<token> в кнопку
      const { ok, preparedMessageId } = await prepareShareMessage(taskId, {
        userId: meId,
        allowGroups: true,
        withButton: true,
      });

      if (!ok || !preparedMessageId) {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
          window.location.href
        )}&text=${encodeURIComponent('Открой мою задачу')}`;
        WebApp?.openTelegramLink?.(shareUrl);
        return;
      }

      if (typeof TG?.shareMessage === 'function') {
        TG.shareMessage(preparedMessageId, (success: boolean) => {
          WebApp?.HapticFeedback?.notificationOccurred?.(success ? 'success' : 'warning');
        });
      } else {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
          window.location.href
        )}&text=${encodeURIComponent('Открой мою задачу')}`;
        WebApp?.openTelegramLink?.(shareUrl);
      }
    } catch (e) {
      console.error('[SHARE] error', e);
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
        window.location.href
      )}&text=${encodeURIComponent('Открой мою задачу')}`;
      WebApp?.openTelegramLink?.(shareUrl);
    }
  };

  /* --- UI --- */
  if (loading) return <div style={{ padding: 16 }}>Загрузка…</div>;
  if (error) return <div style={{ padding: 16, color: 'crimson' }}>{error}</div>;

  // Заголовок с «назад» и названием группы (мелким шрифтом)
  const Header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <button
        onClick={() => onClose(groupIdRef.current)}
        style={{ background: 'transparent', color: '#8aa0ff', border: 'none', cursor: 'pointer', fontSize: 13 }}
      >
        ← Назад
      </button>
      {groupTitle && (
        <span style={{ fontSize: 13, opacity: 0.8 }}>{groupTitle}</span>
      )}
    </div>
  );

  if (!task) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1216', color: '#e8eaed', padding: 16 }}>
        {Header}

        <div style={{ background: '#1b2030', border: '1px solid #2a3346', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Задача уже удалена</div>
          <div style={{ opacity: 0.8, marginBottom: 16 }}>Этой задачи больше нет. Можешь вернуться в доску.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => onClose(null)}
              style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
            >
              Моя доска
            </button>
            {groupIdRef.current ? (
              <button
                onClick={() => onClose(groupIdRef.current)}
                style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #2a3346', background: '#1f2e4a', color: '#e8eaed' }}
              >
                Открыть группу
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1216', color: '#e8eaed', padding: 16 }}>
      {Header}

      <div
        style={{
          background: isDone ? '#15251a' : '#1b2030',
          border: `1px solid ${isDone ? '#2c4a34' : '#2a3346'}`,
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>ID: {task.id}</div>
        <label style={{ display: 'block', fontSize: 14, opacity: 0.85, marginBottom: 8 }}>Текст задачи</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          style={{
            width: '95%',
            background: '#121722',
            color: '#e8eaed',
            border: '1px solid #2a3346',
            borderRadius: 12,
            padding: 10,
            resize: 'vertical',
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            onClick={save}
            disabled={saving || !text.trim()}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #2a3346',
              background: '#202840',
              color: '#e8eaed',
              cursor: 'pointer',
            }}
          >
            Сохранить
          </button>

          <button
            onClick={toggleDone}
            disabled={saving}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #2a3346',
              background: isDone ? '#3a2b1f' : '#234324',
              color: isDone ? '#ffe7c7' : '#d7ffd7',
              cursor: 'pointer',
            }}
          >
            {isDone ? 'Возобновить → Doing' : 'Завершить → Done'}
          </button>

          <button
            onClick={handleDelete}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #472a2a',
              background: '#3a1f1f',
              color: '#ffd7d7',
              cursor: 'pointer',
            }}
          >
            Удалить задачу
          </button>

          {/* Постановщик */}
          {(task as any).creatorName ? (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid #2a3346',
                background: '#1a2030',
                color: '#e8eaed',
                display: 'inline-flex',
                gap: 8,
                alignItems: 'center',
              }}
              title="Постановщик задачи"
            >
              <span style={{ opacity: 0.8 }}>Постановщик:</span>
              <strong>{(task as any).creatorName}</strong>
            </div>
          ) : null}

          {/* Ответственный */}
          {task.assigneeChatId ? (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid #2a3346',
                background: '#15251a',
                color: '#d7ffd7',
                display: 'inline-flex',
                gap: 8,
                alignItems: 'center',
              }}
              title="Ответственный по задаче"
            >
              <span style={{ opacity: 0.8 }}>Ответственный:</span>
              <strong>{task.assigneeName || task.assigneeChatId}</strong>
            </div>
          ) : (
            <button
              onClick={handleInviteAssignee}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid #2a3346',
                background: '#204028',
                color: '#d7ffd7',
                cursor: 'pointer',
              }}
            >
              Ответственный → пригласить
            </button>
          )}

          {/* Пригласить через forward */}
          <button
            onClick={handleForward}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #2a3346',
              background: '#203040',
              color: '#e8f2ff',
              cursor: 'pointer',
            }}
          >
            Пригласить (forward)
          </button>

          {/* Поделиться (встроенный диалог) */}
          <button
            onClick={handleShare}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #2a3346',
              background: '#202840',
              color: '#e8eaed',
              cursor: 'pointer',
            }}
          >
            Поделиться
          </button>
        </div>
      </div>
    </div>
  );
}
