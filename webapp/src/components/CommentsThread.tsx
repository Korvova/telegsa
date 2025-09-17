import { useEffect, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { addComment, deleteComment, listComments, type TaskComment, getCommentLikes, likeComment, unlikeComment } from '../api';

export default function CommentsThread({
  taskId,
  meChatId,
}: {
  taskId: string;
  meChatId: string;
}) {
  const [items, setItems] = useState<TaskComment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [likes, setLikes] = useState<Record<string, { count: number; me: boolean }>>({});
  const [likeBusy, setLikeBusy] = useState<Record<string, boolean>>({});

  const scrollToBottom = () => {
    try { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }); } catch {}
  };

  const ensureVisible = () => {
    // Прокрутить список вниз и гарантированно показать инпут
    scrollToBottom();
    try { inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {}
    // Повторить после возможного появления клавиатуры/пересчёта верстки
    setTimeout(scrollToBottom, 50);
    setTimeout(scrollToBottom, 220);
    setTimeout(() => { try { inputRef.current?.scrollIntoView({ block: 'nearest' }); } catch {} }, 220);
    try { window.scrollTo({ top: document.body.scrollHeight }); } catch {}
  };

  const load = async () => {
    try {
      const r = await listComments(taskId);
      if (r.ok) setItems(r.comments || []);
    } catch {}
  };

  useEffect(() => {
    load();
    let t: any = null;
    const tick = async () => { await load(); t = setTimeout(tick, 4000); };
    t = setTimeout(tick, 4000);
    return () => clearTimeout(t);
  }, [taskId]);

  useEffect(() => {
    // автоскролл к последнему комменту
    scrollToBottom();
  }, [items.length]);

  // Загрузить лайки для новых комментариев
  useEffect(() => {
    const ids = new Set(items.map((c) => c.id));
    const need: string[] = [];
    for (const id of ids) if (!(id in likes)) need.push(id);
    if (need.length === 0) return;
    let alive = true;
    (async () => {
      for (const id of need) {
        try {
          const r = await getCommentLikes(taskId, id, meChatId);
          if (!alive) return;
          if (r?.ok) setLikes((prev) => ({ ...prev, [id]: { count: r.count || 0, me: !!r.me } }));
        } catch {}
      }
    })();
    return () => { alive = false; };
  }, [items, taskId, meChatId]);

  const send = async () => {
    const val = text.trim();
    if (!val || busy) return;
    setBusy(true);
    try {
      const r = await addComment(taskId, meChatId, val);
      if (r.ok) {
        // Сразу очищаем поле и подгружаем актуальный список, чтобы комментарий появился
        setText('');
        WebApp?.HapticFeedback?.impactOccurred?.('light');
        await load();
        // Вернуть фокус и прокрутить, чтобы инпут и последний коммент были видны
        setTimeout(() => { try { inputRef.current?.focus(); } catch {}; ensureVisible(); }, 0);
      }
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) send();
  };

  useEffect(() => {
    // Пересчёт видимой области при открытии клавиатуры
    const onResize = () => ensureVisible();
    try { window.addEventListener('resize', onResize); } catch {}
    try { (window as any).visualViewport?.addEventListener?.('resize', onResize); } catch {}
    return () => {
      try { window.removeEventListener('resize', onResize); } catch {}
      try { (window as any).visualViewport?.removeEventListener?.('resize', onResize); } catch {}
    };
  }, []);

  const remove = async (id: string) => {
    if (!confirm('Удалить комментарий?')) return;
    try {
      const r = await deleteComment(taskId, id, meChatId);
      if (r.ok) setItems(prev => prev.filter(x => x.id !== id));
    } catch {}
  };

  const toggleLike = async (commentId: string) => {
    if (likeBusy[commentId]) return;
    setLikeBusy((b) => ({ ...b, [commentId]: true }));
    try {
      const cur = likes[commentId] || { count: 0, me: false };
      if (cur.me) {
        const r = await unlikeComment(taskId, commentId, meChatId);
        if (r?.ok) setLikes((prev) => ({ ...prev, [commentId]: { count: r.count ?? Math.max(0, cur.count - 1), me: false } }));
      } else {
        const r = await likeComment(taskId, commentId, meChatId);
        if (r?.ok) setLikes((prev) => ({ ...prev, [commentId]: { count: r.count ?? cur.count + 1, me: true } }));
      }
    } catch {}
    finally {
      setLikeBusy((b) => ({ ...b, [commentId]: false }));
    }
  };

  const [badImg, setBadImg] = useState<Record<string, boolean>>({});

  return (
    <div style={wrap}>
      <div style={title}>Комментарии</div>

      <div ref={boxRef} style={listBox}>
        {items.map(c => {
          const mine = String(c.authorChatId) === String(meChatId);
          return (
            <div key={c.id} style={{ ...itemRow, background: mine ? '#182030' : '#141b26' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={avatar}>{(c.authorName || c.authorChatId).slice(0,1).toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 13, opacity: .8 }}>{c.authorName || c.authorChatId}</div>
                  <div style={{ fontSize: 12, opacity: .6 }}>{new Date(c.createdAt).toLocaleString()}</div>
                </div>
              </div>
              {(() => {
                const txt = String(c.text || '');
                const hasFile = txt.startsWith('/files/') || txt.includes('/files/');
                if (!hasFile) return (<div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{c.text}</div>);
                const src = `${(import.meta as any).env.VITE_API_BASE}${txt}`;
                if (badImg[src]) {
                  return (
                    <div style={{ marginTop: 6 }}>
                      <a href={src} target="_blank" rel="noreferrer" style={{ color: '#8aa0ff' }}>📎 Открыть файл</a>
                    </div>
                  );
                }
                return (
                  <div style={{ marginTop: 6 }}>
                    <img
                      src={src}
                      alt="Вложение"
                      style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #2a3346' }}
                      onLoad={() => { try { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }); } catch {} }}
                      onError={() => setBadImg((prev) => ({ ...prev, [src]: true }))}
                    />
                  </div>
                );
              })()}
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  style={{ ...likeBtn, opacity: likeBusy[c.id] ? 0.6 : 1 }}
                  onClick={() => toggleLike(c.id)}
                  disabled={likeBusy[c.id]}
                  title={likes[c.id]?.me ? 'Убрать лайк' : 'Нравится'}
                >
                  {likes[c.id]?.me ? '❤️' : '🤍'} {likes[c.id]?.count ?? 0}
                </button>
                {mine ? (
                  <button style={delBtn} onClick={() => remove(c.id)}>Удалить</button>
                ) : null}
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div style={{ opacity: .6, fontSize: 13, textAlign: 'center' }}>Комментариев пока нет.</div>
        )}
      </div>

      <div style={inputRow}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onFocus={ensureVisible}
          placeholder="Напишите комментарий…"
          style={input}
        />
        <button onClick={send} disabled={busy || !text.trim()} style={sendBtn}>⌲</button>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  marginTop: 16,
  background: '#1b2030',
  border: '1px solid #2a3346',
  borderRadius: 16,
  padding: 12,
};

const title: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 8,
};

const listBox: React.CSSProperties = {
  maxHeight: 260,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingRight: 4,
  marginBottom: 8,
};

const itemRow: React.CSSProperties = {
  border: '1px solid #2a3346',
  borderRadius: 12,
  padding: 10,
};

const avatar: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 14,
  background: '#223a6b', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 12, fontWeight: 700,
};

const inputRow: React.CSSProperties = { display: 'flex', gap: 8 };
const input: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  borderRadius: 12,
  background: '#121722',
  color: '#e8eaed',
  border: '1px solid #2a3346',
};
const sendBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  background: '#202840',
  color: '#e8eaed',
  border: '1px solid #2a3346',
  cursor: 'pointer',
};
const delBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 10,
  background: '#2a1a1a',
  color: '#ffd7d7',
  border: '1px solid #442626',
  cursor: 'pointer',
};
const likeBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 10,
  background: '#22283a',
  color: '#e8eaed',
  border: '1px solid #2a3346',
  cursor: 'pointer',
};
