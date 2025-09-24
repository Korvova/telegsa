import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createTask, listGroups, uploadTaskMedia, transcribeVoice, type Group } from '../../api';
import VoiceRecorder from '../VoiceRecorder';
import useAudioPreview from './hooks/useAudioPreview';
import { useKeyboardInsets } from '../../hooks/useKeyboardInsets';
import GroupPicker from './GroupPicker';
import CameraCaptureModal from '../CameraCaptureModal';

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
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const { url: voiceUrl } = useAudioPreview(voiceFile);
  const [sttBusy, setSttBusy] = useState(false);
  const [uploadProg, setUploadProg] = useState<{ done: number; total: number } | null>(null);
  // attachments (docs, gallery, camera)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileAnyRef = useRef<HTMLInputElement | null>(null);
  const filePhotoRef = useRef<HTMLInputElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
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
      focusEditableEnd();
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
  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter(Boolean) as File[];
    if (!arr.length) return;
    setPendingFiles(prev => [...prev, ...arr]);
    // Keep keyboard up
    try { setTimeout(() => ensureCaretFocus(), 0); } catch {}
  };
  const openCamera = () => setCameraOpen(true);

  // Handlers to trigger file pickers in capture phase (bypass overlay preventDefault on iOS)
  const firePickAny = (e?: any) => { try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch {} try { fileAnyRef.current?.click(); } catch {} };
  const firePickPhoto = (e?: any) => { try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch {} try { filePhotoRef.current?.click(); } catch {} };

  // accept external focus request from FAB to keep iOS gesture chain
  useEffect(() => {
    const onReq = () => {
      try {
        focusEditableEnd();
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
    if ((val.length === 0 && !voiceFile && pendingFiles.length === 0) || busy) return;
    setBusy(true);
    setUploadProg(null);
    try {
      const gid = groupId ?? defaultGroupId ?? undefined;
      const baseText = val || 'Голосовое сообщение';
      const r = await createTask(chatId, baseText, gid as any);
      if ((r as any)?.ok !== false) {
        const newTaskId = (r as any)?.task?.id || '';
        if (newTaskId) {
          // Upload sequentially like Android modal
          const queue: File[] = [];
          if (voiceFile) queue.push(voiceFile);
          if (pendingFiles.length) queue.push(...pendingFiles);
          setUploadProg({ done: 0, total: queue.length });
          let done = 0;
          for (const raw of queue) {
            let f = raw;
            if (isHeicLike(f)) { f = await convertHeicToJpeg(f); }
            if (isImageLike(f)) { f = await downscaleImageToMax(f, 2560, 0.9); }
            // retry up to 2 attempts
            let ok = false; let lastErr: any = null;
            for (let attempt = 0; attempt < 2 && !ok; attempt++) {
              try { await uploadTaskMedia(newTaskId, chatId, f); ok = true; } catch (e) { lastErr = e; }
            }
            if (!ok) { try { console.warn('[ios-panel] file upload failed', f?.name, lastErr); } catch {} }
            done += 1; setUploadProg({ done, total: queue.length });
          }
        }
        setText('');
        setVoiceFile(null);
        setPendingFiles([]);
        try { onCreated?.(); } catch {}
        onClose();
      }
    } catch (e) {
      try { alert('Не удалось создать задачу'); } catch {}
    } finally {
      setBusy(false);
    }
  };

  // Simple caret helper to keep iOS keyboard up when starting mic
  const ensureCaretFocus = () => {
    try {
      // tap hidden input first to preserve gesture chain
      bootRef.current?.focus({ preventScroll: true } as any);
    } catch {}
    try {
      const el = inputRef.current as HTMLTextAreaElement | null;
      if (el) {
        el.focus({ preventScroll: true } as any);
        const len = (el.value || '').length; el.setSelectionRange?.(len, len);
      }
    } catch {}
  };

  // STT animation label (А./А../А...)
  const [sttTick, setSttTick] = useState(0);
  useEffect(() => {
    if (!sttBusy) return;
    const t = setInterval(() => setSttTick((n) => (n + 1) % 3), 500);
    return () => clearInterval(t);
  }, [sttBusy]);
  const sttLabel = (() => 'А' + '.'.repeat((sttTick % 3) + 1))();

  const handleTranscribe = async (lang: 'ru' | 'en' = 'ru') => {
    if (!voiceFile || sttBusy) return;
    setSttBusy(true);
    try {
      const r = await transcribeVoice(voiceFile, lang);
      if ((r as any)?.ok && typeof (r as any).text === 'string') {
        const recognized = String((r as any).text || '').trim();
        if (recognized) {
          setText((prev) => (prev.trim() ? `${prev}\n${recognized}` : recognized));
          setTimeout(() => ensureCaretFocus(), 0);
        }
      } else {
        alert((r as any)?.error || 'Не удалось распознать речь');
      }
    } catch (e: any) {
      try { alert(e?.message || 'Ошибка распознавания'); } catch {}
    } finally {
      setSttBusy(false);
    }
  };

  // Convert HEIC/HEIF images to JPEG for better backend compatibility
  const isHeicLike = (f: File) => {
    const t = String(f.type || '').toLowerCase();
    const n = String(f.name || '').toLowerCase();
    return t.includes('image/heic') || t.includes('image/heif') || /\.(heic|heif)$/.test(n);
  };
  const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src; });
  async function convertHeicToJpeg(file: File): Promise<File> {
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader(); fr.onload = () => resolve(String(fr.result || '')); fr.onerror = reject; fr.readAsDataURL(file);
      });
      const img = await loadImage(dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width; canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d'); if (!ctx) return file;
      ctx.drawImage(img, 0, 0);
      const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob_failed')), 'image/jpeg', 0.92));
      const base = (file.name || 'photo').replace(/\.(heic|heif)$/i, '');
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    } catch { return file; }
  }

  const isImageLike = (f: File) => String(f.type || '').toLowerCase().startsWith('image/') && !/image\/(gif)/i.test(f.type || '');
  async function downscaleImageToMax(file: File, maxEdge = 2560, quality = 0.9): Promise<File> {
    try {
      const dataUrl: string = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result || '')); fr.onerror = reject; fr.readAsDataURL(file); });
      const img = await loadImage(dataUrl);
      let w = img.naturalWidth || img.width; let h = img.naturalHeight || img.height;
      const scale = Math.max(w, h) > maxEdge ? (maxEdge / Math.max(w, h)) : 1;
      // Also compress very large files even if under maxEdge
      if (scale >= 1 && file.size <= 6 * 1024 * 1024) return file;
      const nw = Math.round(w * scale); const nh = Math.round(h * scale);
      const canvas = document.createElement('canvas'); canvas.width = nw; canvas.height = nh;
      const ctx = canvas.getContext('2d'); if (!ctx) return file; ctx.drawImage(img, 0, 0, nw, nh);
      const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob_failed')), 'image/jpeg', quality));
      const base = (file.name || 'image').replace(/\.(jpeg|jpg|png|gif|webp|heic|heif)$/i, '');
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    } catch { return file; }
  }


  const removePendingAt = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  if (!open) return null;

  // For contentEditable we rely on natural height; keep helper no-op
  const adjustTextHeight = (_el: HTMLElement | null) => {};

  const focusEditableEnd = () => {
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
    focusEditableEnd();
    // schedule a couple more attempts for iOS
    setTimeout(() => focusEditableEnd(), 0);
    setTimeout(() => focusEditableEnd(), 60);
    requestAnimationFrame(() => focusEditableEnd());
  };

  const overlay = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: arming ? 'none' : 'auto', isolation: 'isolate' as any, contain: 'layout paint size' as any, backfaceVisibility: 'hidden' as any, transform: 'translateZ(0)' }}
      onClick={() => { if (!arming && !busy) onClose(); }}
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
                // like Android composer: compact left inset with leading 💰 inside field
                padding: '8px 12px', paddingLeft: 30,
                fontSize: 16, lineHeight: '20px',
                minHeight: 38, resize: 'none' as any, overflow: 'hidden',
              }}
            />

            {/* bounty inside input (top-left) */}
            <button
              onClick={() => setToolsOpen(v => !v)}
              title="Вознаграждение"
              style={{ position: 'absolute', left: 55, top: 8, width: 26, height: 26, borderRadius: 999, border: '1px solid #1f2937', background: '#0b1220', color: '#facc15', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
            >💰</button>

            {/* send slot (➤) or mic (🎙️) when no text */}
            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, pointerEvents: 'none' }}>
              <div style={{ width: '100%', height: '100%', pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {(text.trim().length > 0 || !!voiceFile || pendingFiles.length > 0) ? (
                  <button
                    disabled={busy}
                    onClick={() => save()}
                    style={{ width: 36, height: 36, borderRadius: 999, background: '#2563eb', color: '#fff', border: '1px solid transparent', fontSize: 16, opacity: busy ? 0.6 : 1 }}
                    aria-label="Создать"
                  >
                    ➤
                  </button>
                ) : (
                  <div onMouseDownCapture={ensureCaretFocus} onTouchStartCapture={ensureCaretFocus} style={{ width:'100%', height:'100%' }}>
                    <VoiceRecorder maxSeconds={30} buttonStyle={{ width:'100%', height:'100%' }} onRecorded={(file) => { setVoiceFile(file); setTimeout(() => ensureCaretFocus(), 0); }} />
                  </div>
                )}
              </div>
            </div>

            {/* paperclip inside input (top-right, before send) */}
            <button
              onClick={() => setToolsOpen(v => !v)}
              title="Вложения и действия"
              style={{ position: 'absolute', right: 52, top: 8, width: 28, height: 28, borderRadius: 999, border: '1px solid #1f2937', background: '#0b1220', color: '#9ca3af' }}
            >📎</button>

            {/* robot button inside input (left overlay, symmetric to send) */}
            <div style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, pointerEvents: 'none', zIndex: 1 }}>
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
          {/* voice attachment row */}
          {voiceFile && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
              {voiceUrl ? (
                <audio src={voiceUrl} controls style={{ height: 28, maxWidth: '70%' }} />
              ) : (
                <div style={{ fontSize: 12, opacity: 0.85, flex: 1, minWidth: 0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{voiceFile.name || 'voice'}</div>
              )}
              <button
                onClick={() => handleTranscribe('ru')}
                disabled={sttBusy}
                title="Распознать речь"
                style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', fontSize: 12, cursor: 'pointer' }}
              >
                {sttBusy ? sttLabel : '~А'}
              </button>
              <button
                onClick={() => setVoiceFile(null)}
                title="Убрать голосовой файл"
                style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', fontSize: 14, cursor: 'pointer' }}
              >✕</button>
            </div>
          )}
          {/* file chips (documents/photos) inside dark panel */}
          {pendingFiles.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop: voiceFile ? 6 : 8 }}>
              {pendingFiles.map((f, idx) => (
                <div key={`${idx}-${f.name}-${f.size}`} style={{ display:'inline-flex', alignItems:'center', gap:8, maxWidth:'100%', background:'#0b1220', color:'#e8eaed', border:'1px solid #2a3346', borderRadius:999, padding:'4px 10px' }}>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth: 200 }}>{f.name || 'файл'}</span>
                  <button
                    onClick={() => removePendingAt(idx)}
                    title="Убрать файл"
                    style={{ background:'transparent', border:'none', color:'#e8eaed', cursor:'pointer', fontSize:14, lineHeight:1 }}
                  >✕</button>
                </div>
              ))}
              {uploadProg && uploadProg.total > 0 ? (
                <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.9 }}>
                  Загружаю {uploadProg.done}/{uploadProg.total}…
                </div>
              ) : null}
            </div>
          )}
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
              <button onMouseDownCapture={firePickAny} onTouchStartCapture={firePickAny} onClick={firePickAny} title="📑 Документ" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', cursor:'pointer' }}>📑</button>
              <button onMouseDownCapture={firePickPhoto} onTouchStartCapture={firePickPhoto} onClick={firePickPhoto} title="🖼️ Галерея" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', cursor:'pointer' }}>🖼️</button>
              <button onClick={openCamera} title="📸 Камера" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed', cursor:'pointer' }}>📸</button>
              <button title="🚩 Ярлык" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed' }}>🚩</button>
              <button title="☝️ Упоминание" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed' }}>☝️</button>
              <button title="⏰ Напоминание" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed' }}>⏰</button>
              <button title="🔘 Предзадача" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a3346', background: '#121a32', color: '#e8eaed' }}>🔘</button>
            </div>
          </div>
        )}
        {/* hidden pickers always mounted to avoid iOS unmount race */}
        <input ref={fileAnyRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />
        <input ref={filePhotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />

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
        <CameraCaptureModal
          open={cameraOpen}
          onClose={() => { setCameraOpen(false); ensureCaretFocus(); }}
          onCapture={(file) => { setPendingFiles(prev => [...prev, file]); ensureCaretFocus(); }}
        />
      </div>
    </div>
  );

  try { return createPortal(overlay, document.body); } catch { return overlay; }
}
