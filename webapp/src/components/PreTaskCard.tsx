import type { PreTaskDTO } from '../api';

export default function PreTaskCard({ p, onOpen, onEdit, nameByChat, groupTitle, footer, tone = 'normal', emphasis = false, style, myChatId, myRankIcon }: { p: PreTaskDTO; onOpen: (p: PreTaskDTO) => void; onEdit?: (p: PreTaskDTO) => void; nameByChat?: Record<string, string> | Map<string,string>; groupTitle?: string | null; footer?: React.ReactNode; tone?: 'normal' | 'subtle'; emphasis?: boolean; style?: React.CSSProperties; myChatId?: string; myRankIcon?: string | null; }) {
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
  const cardBg = isSubtle ? '#0f172a' : '#eef2ff';
  const cardBrd = isSubtle ? (emphasis ? '#e5e7eb' : '#2a3346') : '#e5e7eb';
  const cardFg = isSubtle ? '#e8eaed' : '#0f1216';

  return (
    <button
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
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width: 8, background: '#2563eb', borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }} />
      <button
        onClick={(e)=>{ e.stopPropagation(); onEdit?.(p); }}
        title="Редактировать предзадачу"
        style={{ position:'absolute', left:-6, top:10, width: 16, height: 16, borderRadius: 999, background: '#3b82f6', boxShadow:`0 0 0 2px ${cardBg}`, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:10, lineHeight:1 }}
      >{cnt > 0 ? cnt : ''}</button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, marginBottom: 6 }}>{p.text}</div>
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
      {/* Right edge badge for pretask */}
      <div style={{ position:'absolute', right: -6, top: 10, width: 22, height: 22, borderRadius: 999, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span title="Связи предзадачи">⚫</span>
      </div>
    </button>
  );
}
