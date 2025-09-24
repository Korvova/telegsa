import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createTask, listGroups, type Group } from '../../api';
import { useKeyboardInsets } from '../../hooks/useKeyboardInsets';
import GroupPicker from './GroupPicker';

// Use unified keyboard insets (VisualViewport + TWA viewport) to dock the panel

export default function IosQuickCreatePanel({ open, onClose, chatId, defaultGroupId, onCreated }: { open: boolean; onClose: () => void; chatId: string; defaultGroupId?: string | null; onCreated?: () => void; }) {
  const microRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bootRef = useRef<HTMLInputElement | null>(null); // hidden input to keep iOS gesture chain
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const { bottom: kbBottom } = useKeyboardInsets(open, microRef as any, 80, true, false, true);
  const [kbFallback, setKbFallback] = useState(0);
  const [arming, setArming] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  // group selection (like Android header)
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(defaultGroupId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groupTab, setGroupTab] = useState<'own' | 'member'>('own');
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // temporary fallback lift while viewport syncs
    setKbFallback(340);
    const tf = setTimeout(() => setKbFallback(0), 1600);
    const tryFocus = () => {
      try { inputRef.current?.click(); } catch {}
      try { inputRef.current?.focus({ preventScroll: true } as any); } catch {}
      try {
        const el = inputRef.current as HTMLTextAreaElement | null;
        if (el) { const len = (el.value || '').length; el.setSelectionRange?.(len, len); }
      } catch {}
    };
    tryFocus();
    const t1 = setTimeout(tryFocus, 60);
    const t2 = setTimeout(tryFocus, 240);
    // arm overlay for one frame to ignore the opening click
    setArming(true);
    requestAnimationFrame(() => setArming(false));
    return () => { clearTimeout(tf); clearTimeout(t1); clearTimeout(t2); setArming(true); };
  }, [open]);

  // load groups when panel opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const r = await listGroups(chatId);
        if ((r as any)?.ok) setGroups((r as any).groups || []);
      } catch {}
    })();
  }, [open, chatId]);

  const groupLabel = () => {
    try {
      if (!groupId) return 'Моя группа';
      const g = groups.find(g => String(g.id) === String(groupId));
      if (!g) return 'Группа';
      const isPublic = (g as any)?.isPublic === true;
      return (isPublic ? '🌍 ' : '📁 ') + (g.title || 'Группа');
    } catch { return 'Группа'; }
  };

  // accept external focus request from FAB to keep iOS gesture chain
  useEffect(() => {
    const onReq = () => {
      try {
        inputRef.current?.click();
        inputRef.current?.focus({ preventScroll: true } as any);
        const el = inputRef.current as HTMLTextAreaElement | null;
        if (el) { const len = (el.value || '').length; el.setSelectionRange?.(len, len); }
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
      const gid = groupId ?? defaultGroupId ?? undefined;
      const r = await createTask(chatId, val, gid as any);
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

  const adjustTextHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    try {
      el.style.height = 'auto';
      const maxH = 160; // px, около 4-5 строк
      const next = Math.min(maxH, el.scrollHeight);
      el.style.height = next + 'px';
    } catch {}
  };

  const refocusWithCaret = () => {
    try {
      const el = inputRef.current as HTMLTextAreaElement | null;
      if (!el) return;
      el.focus({ preventScroll: true } as any);
      const len = (el.value || '').length;
      el.setSelectionRange?.(len, len);
    } catch {}
  };

  const refocusWithCaretStrong = () => {
    try { inputRef.current?.click(); } catch {}
    try { bootRef.current?.focus({ preventScroll: true } as any); } catch {}
    refocusWithCaret();
    // schedule a couple more attempts for iOS
    setTimeout(() => refocusWithCaret(), 0);
    setTimeout(() => refocusWithCaret(), 60);
    requestAnimationFrame(() => refocusWithCaret());
  };

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
      {/* hidden focus target to rebootstrap iOS keyboard reliably */}
      <input ref={bootRef} aria-hidden={true} tabIndex={-1} style={{ position:'fixed', opacity:0, width:1, height:1, bottom:0, left:0, pointerEvents:'none' }} />

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
        {/* group picker header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Группа</div>
          <button
            onClick={() => {
              setPickerOpen(true);
              try { inputRef.current?.blur(); (document.activeElement as any)?.blur?.(); } catch {}
            }}
            title="Выбрать группу"
            style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', fontSize: 12, cursor: 'pointer' }}
          >
            <b>{groupLabel()}</b>
          </button>
        </div>
        <div
          style={{
            position: 'relative',
            background: '#111827',
            border: '1px solid #2a3346',
            borderRadius: 12,
            borderBottomLeftRadius: toolsOpen ? 0 : 12,
            borderBottomRightRadius: toolsOpen ? 0 : 12,
            padding: 8,
          }}
        >
          <div style={{ position: 'relative', flex: 1, minWidth: 0, paddingRight: 52, paddingLeft: 52 }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => { setText(e.target.value); adjustTextHeight(e.currentTarget); }}
              onInput={(e) => adjustTextHeight(e.currentTarget as HTMLTextAreaElement)}
              onFocus={(e) => adjustTextHeight(e.currentTarget)}
              placeholder="Новая задача…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#0b1220', color: '#e8eaed',
                border: '1px solid #1f2937', borderRadius: 14,
                padding: '8px 12px',
                fontSize: 16, lineHeight: '20px',
                minHeight: 38, resize: 'none' as any, overflow: 'hidden',
              }}
            />

            {/* bounty inside input (top-left) */}
            <button
              onClick={() => setToolsOpen(v => !v)}
              title="Вознаграждение"
              style={{ position: 'absolute', left: 8, top: 8, width: 26, height: 26, borderRadius: 999, border: '1px solid #1f2937', background: '#0b1220', color: '#facc15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >🥮</button>

            {/* send slot (➤) */}
            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, pointerEvents: 'none' }}>
              <div style={{ width: '100%', height: '100%', pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button
                  disabled={!text.trim() || busy}
                  onClick={() => save()}
                  style={{ width: 36, height: 36, borderRadius: 999, background: '#2563eb', color: '#fff', border: '1px solid transparent', fontSize: 16, opacity: (!text.trim() || busy) ? 0.6 : 1 }}
                  aria-label="Создать"
                >
                  ➤
                </button>
              </div>
            </div>

            {/* paperclip inside input (top-right, before send) */}
            <button
              onClick={() => setToolsOpen(v => !v)}
              title="Вложения и действия"
              style={{ position: 'absolute', right: 52, top: 8, width: 28, height: 28, borderRadius: 999, border: '1px solid #1f2937', background: '#0b1220', color: '#9ca3af' }}
            >📎</button>

            {/* robot button inside input (left overlay, symmetric to send) */}
            <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, pointerEvents: 'none' }}>
              <div style={{ width: '100%', height: '100%', pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button
                  onClick={() => setToolsOpen(v => !v)}
                  title="Роботы"
                  style={{ width: 36, height: 36, borderRadius: 999, background: '#2563eb', color: '#fff', border: '1px solid transparent', fontSize: 16 }}
                  aria-label="Роботы"
                >
                  🤖
                </button>
              </div>
            </div>
          </div>
        </div>
        {toolsOpen && (
          <div
            style={{
              // без зазора к верхнему блоку
              marginTop: 0,
              background: '#0f1422',
              border: '1px solid #2a3346',
              // убираем двойную границу и скругление сверху — прилипает вплотную
              borderTopWidth: 0,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 12,
              padding: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
              <button title="📑 Документ" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed' }}>📑</button>
              <button title="🖼️ Галерея" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed' }}>🖼️</button>
              <button title="📸 Камера" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed' }}>📸</button>
              <button title="🚩 Ярлык" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed' }}>🚩</button>
              <button title="☝️ Упоминание" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed' }}>☝️</button>
              <button title="⏰ Напоминание" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed' }}>⏰</button>
              <button title="🔘 Предзадача" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed' }}>🔘</button>
            </div>
          </div>
        )}
        {/* GroupPicker modal */}
        <GroupPicker
          open={pickerOpen}
          groupTab={groupTab}
          setGroupTab={setGroupTab}
          ownGroups={(groups || []).filter((g:any)=>g?.kind==='own') as any}
          memberGroups={(groups || []).filter((g:any)=>g?.kind==='member') as any}
          groupId={groupId}
          setGroupId={(id) => setGroupId(id)}
          selectedLabelId={selectedLabelId}
          setSelectedLabelId={(id) => setSelectedLabelId(id)}
          onClose={() => {
            // try to restore caret immediately and with retries
            try { refocusWithCaretStrong(); } catch {}
            setPickerOpen(false);
          }}
          onApply={() => {
            // try to restore caret immediately and with retries
            try { refocusWithCaretStrong(); } catch {}
            setPickerOpen(false);
          }}
          dockBottom={Math.max(kbBottom, kbFallback)}
        />
      </div>
    </div>
  );

  try { return createPortal(overlay, document.body); } catch { return overlay; }
}
