import { useRef } from 'react';
import type { PreTaskDTO } from '../api';
import EdgePreTaskBadge from './EdgePreTaskBadge';
import LongPressOutline from './LongPressOutline';

export default function PreTaskCard({ p, onOpen, onEdit, nameByChat, groupTitle, footer, tone = 'normal', emphasis = false, style, myChatId, myRankIcon, feedStyle = false, doneTarget = false, rightCount = 0, onOpenProcess, hideRightBadge = false }: { p: PreTaskDTO; onOpen: (p: PreTaskDTO) => void; onEdit?: (p: PreTaskDTO) => void; nameByChat?: Record<string, string> | Map<string,string>; groupTitle?: string | null; footer?: React.ReactNode; tone?: 'normal' | 'subtle'; emphasis?: boolean; style?: React.CSSProperties; myChatId?: string; myRankIcon?: string | null; feedStyle?: boolean; doneTarget?: boolean; rightCount?: number; onOpenProcess?: () => void; hideRightBadge?: boolean; }) {
  void onEdit; // preserve prop for callers, but not used (left badge opens process)
  const modeText = (() => {
    if (p.triggerMode === 'AFTER_ALL_DONE') return 'Сразу';
    if (p.triggerMode === 'DATE_PLUS') return `📅 ко времени: ${p.startAt ? new Date(p.startAt).toLocaleString() : ''}`;
    if (p.triggerMode === 'DELAY_AFTER') return `⏰ через ${typeof p.delayMinutes==='number' ? p.delayMinutes : ''} мин`;
    return '🚫 после отмены';
  })();
  const getName = (cid?: string | null) => {
    if (!cid) return '';
    const map = nameByChat instanceof Map ? nameByChat : new Map(Object.entries(nameByChat || {}));
    return map.get(String(cid)) || String(cid);
  };
  const cnt = Array.isArray((p as any).links) ? (p as any).links.length : 0;
  const isSubtle = tone === 'subtle';
  const isFired = String(p.status || '') === 'FIRED';
  // Palette
  const firedBg = '#e0f2fe';  // sky-100
  const firedBrd = '#bae6fd'; // sky-200
  const firedFg = '#0c4a6e';  // cyan-900-ish
  const firedAccent = '#38bdf8'; // cyan-400
  const subtleBg = 'rgba(152, 153, 157, 0.78)';
  const subtleBrd = emphasis ? '#e5e7eb' : '#2a3346';
  const subtleFg = '#e8eaed';
  const normalBg = '#eef2ff';
  const normalBrd = '#e5e7eb';
  const normalFg = '#0f1216';

  const useFiredLight = feedStyle && isFired; // только в ленте делаем голубые
  const cardBg = useFiredLight ? firedBg : (isSubtle ? subtleBg : normalBg);
  const cardBrd = useFiredLight ? firedBrd : (isSubtle ? subtleBrd : normalBrd);
  const cardFg = useFiredLight ? firedFg : (isSubtle ? subtleFg : normalFg);

  const localIdRef = useRef<string>('');
  if (!localIdRef.current) localIdRef.current = `pretask-card-${String(p.id)}-${Math.random().toString(36).slice(2,7)}`;
  const anchorId = localIdRef.current;
  return (
    <button
      id={anchorId}
      onClick={() => onOpen(p)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
        gap: 8,
        border: `1px solid ${cardBrd}`,
        background: cardBg,
        color: cardFg,
        borderRadius: 16,
        padding: 12,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        ...(style || {}),
      }}
      title={p.text}
    >
      <LongPressOutline
        targetId={anchorId}
        durationMs={1000}
        radius={16}
        onComplete={() => { try { onEdit?.(p); } catch {} }}
      />
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width: 8, background: useFiredLight ? firedAccent : '#2563eb', borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }} />
      {/* Left edge badge: replace blue count circle with arrow badge */}
      <EdgePreTaskBadge
        kind="pretask"
        count={cnt}
        side="left"
        align="center"
        style={{ left: -6 }}
        onClick={() => { onOpenProcess?.(); }}
        title="Связи предзадачи"
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, marginBottom: 6, textDecoration: (isFired && doneTarget) ? 'line-through' as const : undefined }}>
          {isFired ? (<span title="Запущена" style={{ marginRight: 6, color: useFiredLight ? firedFg : '#60a5fa' }}>⌯⌲</span>) : null}
          {p.text}
        </div>
        {isSubtle ? (
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>#{String(p.id || '').slice(0, 6)}</div>
        ) : null}
        {groupTitle ? (
          <div style={{
            display: 'inline-block',
            background: '#475569',
            color: '#fff',
            padding: '3px 8px',
            borderRadius: 8,
            fontSize: 12,
            marginBottom: 6,
          }}>{groupTitle}</div>
        ) : null}
        <div style={{ fontSize: 12, opacity: .9, display: 'grid', gap: 4 }}>
          <div>Режим: {modeText}</div>
          <div>
            Ответственный: {String(p.creatorChatId || '') === String(myChatId || '') && (myRankIcon || '') ? `${myRankIcon} ` : ''}{getName(p.creatorChatId)}
          </div>
          <div>Ждёт: {getName(p.plannedAssigneeChatId) || 'не выбран'}</div>
        </div>
        {footer ? (
          <div style={{ marginTop: 6 }}>{footer}</div>
        ) : null}
      </div>
      {/* Right edge badge for pretask (open process canvas) */}
      {!hideRightBadge && (
        <EdgePreTaskBadge
          kind="pretask"
          count={rightCount}
          side="right"
          align="center"
          style={{ right: -6 }}
          onClick={() => { onOpenProcess?.(); }}
          title={rightCount > 0 ? 'Открыть связи' : 'Нет дочерних предзадач'}
        />
      )}
    </button>
  );
}
