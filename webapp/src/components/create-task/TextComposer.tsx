import React from 'react';

type Props = {
  text: string;
  setText: (v: string) => void;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  adjustTextHeight: () => void;
  firstAudio: File | null;
  audioPreviewUrl: string | null;
  sttBusy: boolean;
  onTranscribe: (lang: 'ru' | 'en') => void;
  onOpenBounty: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
  onRemoveAudio?: () => void;
  rightSlot: React.ReactNode;
  onFocus?: () => void;
};

export default function TextComposer({
  text,
  setText,
  textAreaRef,
  adjustTextHeight,
  firstAudio,
  audioPreviewUrl,
  sttBusy,
  onTranscribe,
  onOpenBounty,
  toolsOpen,
  onToggleTools,
  onRemoveAudio,
  rightSlot,
  onFocus,
}: Props) {
  const MAX_LINES = 6;
  const LINE_PX = 20;
  const MAX_HEIGHT_PX = MAX_LINES * LINE_PX + 16;

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, paddingRight: 52 }}>
      {firstAudio && !text.trim() ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <audio controls src={audioPreviewUrl ?? undefined} style={{ width: '100%', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => { onRemoveAudio?.(); }}
              title="Удалить запись"
              style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}
            >✕</button>
            <button type="button" onClick={() => onTranscribe('ru')} disabled={sttBusy} title="Транскрибировать (~A)" style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: sttBusy ? 'default' : 'pointer' }}>{sttBusy ? '…' : '~A'}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
          <div style={{ position:'relative', flex:1, minWidth:0 }}>
            <textarea
              ref={textAreaRef}
              rows={1}
              placeholder="Опиши задачу…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onInput={adjustTextHeight}
              onFocus={onFocus}
              style={{ width: '100%', boxSizing: 'border-box', background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 14, padding: '8px 12px', paddingLeft: 44, resize: 'none', minHeight: 38, maxHeight: MAX_HEIGHT_PX, lineHeight: `${LINE_PX}px`, overflowY: 'hidden', fontSize: 16 }}
            />
            <button
              type="button"
              onClick={onOpenBounty}
              title="Вознаграждение"
              style={{ position: 'absolute', left: 8, top: 8, width: 26, height: 26, borderRadius: 999, border: '1px solid #1f2937', background: '#0b1220', color: '#facc15', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >💵</button>
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, pointerEvents: 'none' }}>
        <div style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}>{rightSlot}</div>
      </div>

      {/* paperclip toggler inside input (top-right) */}
      <button
        type="button"
        onClick={onToggleTools}
        title={toolsOpen ? 'Скрыть вложения' : 'Показать вложения'}
        style={{ position: 'absolute', right: 52, top: 8, width: 28, height: 28, borderRadius: 999, border: '1px solid #1f2937', background: '#0b1220', color: '#9ca3af', cursor: 'pointer', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        📎
      </button>
    </div>
  );
}
