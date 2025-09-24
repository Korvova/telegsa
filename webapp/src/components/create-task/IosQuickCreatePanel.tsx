import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createTask } from '../../api';

// Minimal keyboard-dock hook derived from SettingsKeyboardTest
function useKeyboardDock<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  opts?: {
    openFollowMs?: number;
    closeFollowMs?: number;
    onHide?: () => void;
  }
) {
  const openFollowMs = opts?.openFollowMs ?? 600;
  const closeFollowMs = opts?.closeFollowMs ?? 0;
  const onHide = opts?.onHide;

  const rafRef = useRef<number | null>(null);
  const baseHRef = useRef<number>(0);
  const lastTopRef = useRef<number>(0);
  const frozenTopRef = useRef<number>(0);
  const focusedRef = useRef<boolean>(false);

  const vv = (typeof window !== 'undefined' ? (window as any).visualViewport : undefined) as VisualViewport | undefined;

  const clearRaf = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };

  const kWithOffset = () => {
    if (!vv) return 0;
    const vh = vv.height ?? 0;
    const vt = vv.offsetTop ?? 0;
    return Math.max(0, window.innerHeight - (vh + vt));
  };
  const kTopOnly = () => {
    if (!vv) return 0;
    const vh = vv.height ?? 0;
    if (kWithOffset() > 0) { if (baseHRef.current === 0) baseHRef.current = vh; } else { baseHRef.current = 0; }
    const h = baseHRef.current || vh;
    const t = Math.max(0, window.innerHeight - h);
    lastTopRef.current = t;
    return t;
  };

  const apply = (el: T) => {
    const raw = kTopOnly();
    const t = frozenTopRef.current > 0 ? frozenTopRef.current : raw;
    el.style.transform = t > 0 ? `translateY(-${t}px)` : 'translateY(0)';
    return t;
  };
  const followFor = (ms: number, el: T) => {
    const until = performance.now() + ms;
    clearRaf();
    if (ms <= 0) { apply(el); return; }
    const tick = () => {
      const t = apply(el);
      if (performance.now() < until && t > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        if (lastTopRef.current > 0) frozenTopRef.current = lastTopRef.current;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const el = ref.current as T | null;
    if (!el || !vv) return;

    const onResizeOrScroll = () => { followFor(focusedRef.current ? openFollowMs : closeFollowMs, el); };

    const onFocusIn = () => { try { (el as any).style.display = ''; (el as any).style.opacity = '1'; (el as any).style.visibility = 'visible'; } catch {}; focusedRef.current = true; followFor(openFollowMs, el); };
    const onFocusOut = () => { clearRaf(); focusedRef.current = false; frozenTopRef.current = 0; el.style.transform = 'translateY(0)'; setTimeout(() => apply(el), 0); setTimeout(() => apply(el), 80); setTimeout(() => apply(el), 160); };

    const instantHide = () => { clearRaf(); focusedRef.current = false; frozenTopRef.current = 0; try { onHide?.(); } catch {}; try { (document.activeElement as any)?.blur?.(); } catch {}; };
    const onDocTouchStart = (e: Event) => {
      try {
        const n = e.target as Node | null; if (!n) return;
        const withinDock = el.contains(n);
        let insideEditable = false;
        try { const elNode = n as Element; if (elNode && (elNode as any).closest) insideEditable = !!(elNode as any).closest('input,textarea,select,[contenteditable="true"]'); } catch {}
        if (!withinDock || (withinDock && !insideEditable)) { instantHide(); }
      } catch {}
    };

    vv.addEventListener('resize', onResizeOrScroll);
    vv.addEventListener('scroll', onResizeOrScroll);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('touchstart', onDocTouchStart as any, { capture: true } as any);
    followFor(closeFollowMs, el);
    return () => {
      clearRaf();
      vv.removeEventListener('resize', onResizeOrScroll);
      vv.removeEventListener('scroll', onResizeOrScroll);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('touchstart', onDocTouchStart as any, { capture: true } as any);
    };
  }, [ref, openFollowMs, closeFollowMs]);
}

export default function IosQuickCreatePanel({ open, onClose, chatId, defaultGroupId, onCreated }: { open: boolean; onClose: () => void; chatId: string; defaultGroupId?: string | null; onCreated?: () => void; }) {
  const microRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useKeyboardDock(microRef, { onHide: () => { try { onClose(); } catch {} } });

  useEffect(() => {
    if (!open) return;
    try { inputRef.current?.focus({ preventScroll: true } as any); } catch {}
    const t = setTimeout(() => { try { inputRef.current?.focus({ preventScroll: true } as any); } catch {} }, 60);
    return () => clearTimeout(t);
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
      style={{ position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: 'auto' }}
      onClick={() => onClose()}
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
          transform: 'translate3d(0,0,0)',
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

