import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createTask } from '../../api';
import { useKeyboardInsets } from '../../hooks/useKeyboardInsets';

// Use unified keyboard insets (VisualViewport + TWA viewport) to dock the panel

export default function IosQuickCreatePanel({ open, onClose, chatId, defaultGroupId, onCreated }: { open: boolean; onClose: () => void; chatId: string; defaultGroupId?: string | null; onCreated?: () => void; }) {
  const microRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const { bottom: kbBottom } = useKeyboardInsets(open, microRef as any, 80, true, false, true);
  const [kbFallback, setKbFallback] = useState(0);
  const [arming, setArming] = useState(true);

  useEffect(() => {
    if (!open) return;
    // temporary fallback lift while viewport syncs
    setKbFallback(340);
    const tf = setTimeout(() => setKbFallback(0), 1600);
    const tryFocus = () => {
      try { inputRef.current?.click(); } catch {}
      try { inputRef.current?.focus({ preventScroll: true } as any); } catch {}
    };
    tryFocus();
    const t1 = setTimeout(tryFocus, 60);
    const t2 = setTimeout(tryFocus, 240);
    // arm overlay for one frame to ignore the opening click
    setArming(true);
    requestAnimationFrame(() => setArming(false));
    return () => { clearTimeout(tf); clearTimeout(t1); clearTimeout(t2); setArming(true); };
  }, [open]);

  // accept external focus request from FAB to keep iOS gesture chain
  useEffect(() => {
    const onReq = () => {
      try {
        inputRef.current?.click();
        inputRef.current?.focus({ preventScroll: true } as any);
      } catch {}
    };
    window.addEventListener('create-task-focus', onReq as any);
    return () => window.removeEventListener('create-task-focus', onReq as any);
  }, []);

  // robust body lock while panel is visible on iOS to avoid bounce/offset issues
  useEffect(() => {
    if (!open) return;
    const body = document.body as any;
    const html = document.documentElement as any;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const prev = { pos: body.style.position, top: body.style.top, width: body.style.width };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    html.style.overscrollBehaviorY = 'contain';
    return () => {
      body.style.position = prev.pos;
      body.style.top = prev.top;
      body.style.width = prev.width;
      html.style.overscrollBehaviorY = '';
      try { window.scrollTo(0, scrollY); } catch {}
    };
  }, [open]);

  const save = async () => {
    const val = text.trim();
    if (!val || busy) return;
    setBusy(true);
    try {
      const r = await createTask(chatId, val, defaultGroupId || undefined);
      if ((r as any)?.ok !== false) {
        setText('');
        try { onCreated?.(); } catch {}
        onClose();
      }
    } catch (e) {
      try { alert('Не удалось создать задачу'); } catch {}
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const overlay = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: arming ? 'none' : 'auto', isolation: 'isolate' as any, contain: 'layout paint size' as any, backfaceVisibility: 'hidden' as any, transform: 'translateZ(0)' }}
      onClick={() => { if (!arming) onClose(); }}
      onTouchStart={(e) => {
        try { const t = e.target as Element | null; const isEditable = !!t && !!t.closest('input,textarea,select,[contenteditable="true"]'); if (!isEditable) { e.preventDefault(); e.stopPropagation(); } } catch {}
      }}
      onPointerDown={(e) => {
        try { const t = e.target as Element | null; const isEditable = !!t && !!t.closest('input,textarea,select,[contenteditable="true"]'); if (!isEditable) { e.preventDefault(); e.stopPropagation(); } } catch {}
      }}
      onMouseDown={(e) => {
        try { const t = e.target as Element | null; const isEditable = !!t && !!t.closest('input,textarea,select,[contenteditable="true"]'); if (!isEditable) { e.preventDefault(); e.stopPropagation(); } } catch {}
      }}
      onTouchMove={(e) => { try { e.preventDefault(); e.stopPropagation(); } catch {} }}
      onWheel={(e) => { try { e.preventDefault(); e.stopPropagation(); } catch {} }}
    >
      <div
        ref={microRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: 10,
          right: 10,
          bottom: 0,
          pointerEvents: 'auto',
          zIndex: 1000000,
          transform: `translate3d(0, -${Math.max(kbBottom, kbFallback)}px, 0)`,
          transition: 'none',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          willChange: 'transform',
          backfaceVisibility: 'hidden' as any,
        }}
      >
        <div
          style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#111827', border: '1px solid #2a3346', borderRadius: 12, padding: 8 }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Новая задача…"
            style={{ flex: 1, background: '#0b1220', color: '#e8eaed', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 12px', fontSize: 16 }}
          />
          <button
            disabled={!text.trim() || busy}
            onClick={() => save()}
            style={{ borderRadius: 999, padding: '10px 14px', background: '#2563eb', color: '#fff', border: '1px solid transparent', fontSize: 16, opacity: (!text.trim() || busy) ? 0.6 : 1 }}
            aria-label="Создать"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );

  try { return createPortal(overlay, document.body); } catch { return overlay; }
}
