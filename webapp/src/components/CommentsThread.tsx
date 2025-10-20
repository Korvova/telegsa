import { useEffect, useMemo, useRef, useState } from 'react';
import { useKeyboardInsets } from '../hooks/useKeyboardInsets';
import WebApp from '@twa-dev/sdk';
import { addComment, deleteComment, listComments, type TaskComment, getCommentLikes, likeComment, unlikeComment, uploadCommentMedia } from '../api';
import RankName from './RankName';
import { useMyRankIcon } from '../hooks/useMyRankIcon';

export default function CommentsThread({
  taskId,
  meChatId,
  bg,
  border,
  color,
}: {
  taskId: string;
  meChatId: string;
  bg?: string;
  border?: string;
  color?: string;
}) {
  const [items, setItems] = useState<TaskComment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [likes, setLikes] = useState<Record<string, { count: number; me: boolean }>>({});
  const [likeBusy, setLikeBusy] = useState<Record<string, boolean>>({});
  const myRankIcon = useMyRankIcon(meChatId);

  const isiOS = useMemo(() => { try { return /iPad|iPhone|iPod/i.test(navigator.userAgent || ''); } catch { return false; } }, []);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { bottom: kbBottom } = useKeyboardInsets(true, wrapRef as any, 120);

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
    if ((!val && !pendingFile) || busy) return;
    setBusy(true);
    try {
      const r = await addComment(taskId, meChatId, val || ' ');
      if (r.ok) {
        // Если есть файл, загружаем его
        if (pendingFile && r.comment?.id) {
          try {
            await uploadCommentMedia(taskId, r.comment.id, meChatId, pendingFile);
          } catch (e) {
            console.error('Failed to upload comment media:', e);
          }
        }
        // Сразу очищаем поле и подгружаем актуальный список, чтобы комментарий появился
        setText('');
        setPendingFile(null);
        WebApp?.HapticFeedback?.impactOccurred?.('light');
        await load();
        // Вернуть фокус и прокрутить, чтобы инпут и последний коммент были видны
        setTimeout(() => { try { inputRef.current?.focus(); } catch {}; ensureVisible(); }, 0);
      } else if (String((r as any)?.error||'') === 'no_rights') {
        alert('У вас нет прав на комментарии');
      }
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на комментарии');
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) send();
  };

  useEffect(() => {
    // Пересчёт при изменении viewport — просто подтолкнуть автоскролл
    const onResize = () => ensureVisible();
    try { window.addEventListener('resize', onResize); } catch {}
    try { (window as any).visualViewport?.addEventListener?.('resize', onResize); } catch {}
    try { (WebApp as any)?.onEvent?.('viewportChanged', onResize); } catch {}
    return () => {
      try { window.removeEventListener('resize', onResize); } catch {}
      try { (window as any).visualViewport?.removeEventListener?.('resize', onResize); } catch {}
      try { (WebApp as any)?.offEvent?.('viewportChanged', onResize); } catch {}
    };
  }, []);

  const remove = async (id: string) => {
    if (!confirm('Удалить комментарий?')) return;
    try {
      const r = await deleteComment(taskId, id, meChatId);
      if (r.ok) setItems(prev => prev.filter(x => x.id !== id));
      else if (String((r as any)?.error||'')==='no_rights') alert('У вас нет прав на это действие');
    } catch (e:any) {
      const msg = String(e?.message||'');
      if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие');
    }
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

  // Функция для превращения URL в кликабельные ссылки
  const linkify = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#8aa0ff', wordBreak: 'break-all' }}>
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <div
      ref={wrapRef}
      style={{
        ...wrap,
        background: bg ?? wrap.background,
        border: border ?? wrap.border as any,
        color: color ?? undefined,
      }}
    >
      <div style={title}>Комментарии</div>

      <div ref={boxRef} style={listBox}>
        {items.map(c => {
          const mine = String(c.authorChatId) === String(meChatId);
          return (
            <div key={c.id} style={{ ...itemRow, background: mine ? 'rgba(0,0,0,.08)' : 'rgba(0,0,0,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, opacity: .8 }}>
                    <RankName chatId={c.authorChatId} name={c.authorName || c.authorChatId} meChatId={meChatId} myRankIcon={myRankIcon || null} />
                  </div>
                  <div style={{ fontSize: 12, opacity: .6 }}>{new Date(c.createdAt).toLocaleString()}</div>
                </div>
              </div>
              {(() => {
                const txt = String(c.text || '');
                const lines = txt.split('\n');
                const textLines = lines.filter(l => !l.startsWith('/files/'));
                const fileLines = lines.filter(l => l.startsWith('/files/'));

                return (
                  <>
                    {textLines.length > 0 && (
                      <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                        {linkify(textLines.join('\n'))}
                      </div>
                    )}
                    {fileLines.map((fileLine, idx) => {
                      const src = `${(import.meta as any).env.VITE_API_BASE}${fileLine}`;
                      if (badImg[src]) {
                        return (
                          <div key={idx} style={{ marginTop: 6 }}>
                            <a href={src} target="_blank" rel="noreferrer" style={{ color: '#8aa0ff' }}>📎 Открыть файл</a>
                          </div>
                        );
                      }
                      return (
                        <div key={idx} style={{ marginTop: 6 }}>
                          <img
                            src={src}
                            alt="Вложение"
                            style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #2a3346' }}
                            onLoad={() => { try { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }); } catch {} }}
                            onError={() => setBadImg((prev) => ({ ...prev, [src]: true }))}
                          />
                        </div>
                      );
                    })}
                  </>
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

      {pendingFile && (
        <div style={{ marginTop: 8, padding: 8, background: 'rgba(0,0,0,.1)', borderRadius: 8, fontSize: 12 }}>
          📎 {pendingFile.name}
          <button
            onClick={() => setPendingFile(null)}
            style={{ marginLeft: 8, background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{
        ...inputRow,
        position: 'relative',
        background: 'transparent',
        paddingBottom: isiOS ? `${kbBottom + 6}px` : '6px',
        marginTop: 8,
      }}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onFocus={ensureVisible}
          placeholder="Напишите комментарий…"
          style={input}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPendingFile(file);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          style={{ ...sendBtn, fontSize: 18 }}
          title="Прикрепить фото"
        >
          📎
        </button>
        <button onClick={send} disabled={busy || (!text.trim() && !pendingFile)} style={sendBtn}>⌲</button>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  marginTop: 16,
  background: 'transparent',
  border: '1px solid transparent',
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
  border: '1px solid rgba(0,0,0,.12)',
  borderRadius: 12,
  padding: 10,
};

// removed avatar circle with initial letter

const inputRow: React.CSSProperties = { display: 'flex', gap: 8, width: '100%' };
const input: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '10px 12px',
  borderRadius: 12,
  background: 'transparent',
  color: 'inherit',
  border: '1px solid #3a435a',
  boxSizing: 'border-box',
};
const sendBtn: React.CSSProperties = {
  padding: '10px 10px',
  borderRadius: 12,
  background: 'transparent',
  color: 'inherit',
  border: '1px solid #3a435a',
  cursor: 'pointer',
  flexShrink: 0,
  minWidth: 'auto',
  boxSizing: 'border-box',
};
const delBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 10,
  background: 'transparent',
  color: 'inherit',
  border: '1px solid #6b3030',
  cursor: 'pointer',
};
const likeBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 10,
  background: 'transparent',
  color: 'inherit',
  border: '1px solid #3a435a',
  cursor: 'pointer',
};
