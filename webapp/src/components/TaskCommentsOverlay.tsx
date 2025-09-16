import { useEffect, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { addComment, listComments, type TaskComment } from '../api';

type Props = {
  open: boolean;
  onClose: () => void;
  taskId: string;
  taskText: string;
  meChatId: string;
};

export default function TaskCommentsOverlay({ open, onClose, taskId, taskText, meChatId }: Props) {
  const [items, setItems] = useState<TaskComment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await listComments(taskId);
        if (alive && r?.ok) setItems(r.comments || []);
      } catch {}
    };
    load();
    let t: any = null;
    const tick = async () => { await load(); t = setTimeout(tick, 4000); };
    t = setTimeout(tick, 4000);
    return () => { alive = false; clearTimeout(t); };
  }, [open, taskId]);

  useEffect(() => {
    if (!open) return;
    try { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); } catch {}
  }, [open, items.length]);

  const ensureVisible = () => {
    try { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); } catch {}
    try { inputRef.current?.scrollIntoView({ block: 'nearest' }); } catch {}
    setTimeout(() => { try { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); } catch {} }, 220);
  };

  const send = async () => {
    const val = text.trim();
    if (!val || busy) return;
    setBusy(true);
    try {
      const r = await addComment(taskId, meChatId, val);
      if (r?.ok) {
        setText('');
        WebApp?.HapticFeedback?.impactOccurred?.('light');
        // перечитать список
        try { const rr = await listComments(taskId); if (rr?.ok) setItems(rr.comments || []); } catch {}
        setTimeout(() => { try { inputRef.current?.focus(); } catch {}; ensureVisible(); }, 0);
      }
    } finally { setBusy(false); }
  };

  if (!open) return null;

  return (
    <div
      className="comments-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#0f1216', display: 'flex', flexDirection: 'column' }}
    >
      {/* Header: pinned task card */}
      <div style={{ padding: 10, borderBottom: '1px solid #2a3346', background: '#0f1216', position: 'sticky', top: 0, zIndex: 1 }}>
        <div style={{ background: '#121722', border: '1px solid #2a3346', borderRadius: 16, padding: 12, color: '#e8eaed' }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Задача</div>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{taskText}</div>
        </div>
      </div>

      {/* Comments list */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((c) => {
          const mine = String(c.authorChatId) === String(meChatId);
          return (
            <div key={c.id} style={{ border: '1px solid #2a3346', background: mine ? '#182030' : '#141b26', color: '#e8eaed', borderRadius: 12, padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: '#223a6b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                  {(c.authorName || c.authorChatId).slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>{c.authorName || c.authorChatId}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>{new Date(c.createdAt).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div style={{ opacity: 0.6, fontSize: 13, textAlign: 'center', color: '#e8eaed' }}>Комментариев пока нет.</div>
        )}
        <div style={{ height: 12 }} />
      </div>

      {/* Composer fixed bottom */}
      <div style={{ position: 'sticky', bottom: 0, background: '#0f1216', padding: 10, borderTop: '1px solid #2a3346' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onClose}
            title="Назад"
            style={{ padding: '10px 12px', borderRadius: 12, background: '#121722', color: '#e8eaed', border: '1px solid #2a3346', cursor: 'pointer' }}
          >
            ←
          </button>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={ensureVisible}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(); }}
            placeholder="Напишите комментарий…"
            style={{ flex: 1, padding: '10px 12px', borderRadius: 12, background: '#121722', color: '#e8eaed', border: '1px solid #2a3346' }}
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            style={{ padding: '10px 14px', borderRadius: 12, background: '#202840', color: '#e8eaed', border: '1px solid #2a3346', cursor: busy || !text.trim() ? 'default' : 'pointer', opacity: busy || !text.trim() ? 0.6 : 1 }}
            title="Отправить"
          >
            ⌲
          </button>
        </div>
      </div>
    </div>
  );
}

