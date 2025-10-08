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
  const isRecurring = !!(p as any)?.recurringConfig;
  const tz = (p as any)?.timezone || null;
  const nextDateIso = (p as any)?.startAt || (p as any)?.fireAt || null;
  function calcNextRecurringLocal(cfg: any, timeZone?: string | null): Date | null {
    try {
      if (!cfg || typeof cfg !== 'object') return null;
      const pattern = String(cfg.pattern || 'daily');
      const time = String(cfg.time || '13:00');
      const [hours, minutes] = time.split(':').map((n: string) => parseInt(n, 10));
      const excludeDays: number[] = Array.isArray(cfg.excludeDays) ? cfg.excludeDays : [];
      const excludeDates: string[] = Array.isArray(cfg.excludeDates) ? cfg.excludeDates : [];
      const monthDay = cfg.monthDay ? Number(cfg.monthDay) : null;
      const weekOfMonth = (cfg.weekOfMonth != null) ? Number(cfg.weekOfMonth) : null;
      const dayOfWeek = (cfg.dayOfWeek != null) ? Number(cfg.dayOfWeek) : null;
      const now = timeZone ? new Date(new Date().toLocaleString('en-US', { timeZone })) : new Date();
      let candidate = new Date(now);
      candidate.setSeconds(0, 0);
      candidate.setHours(isNaN(hours) ? 13 : hours, isNaN(minutes) ? 0 : minutes, 0, 0);
      const dateStrOf = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${da}`;
      };
      function nextDay(d: Date) { const n = new Date(d); n.setDate(n.getDate() + 1); n.setHours(d.getHours(), d.getMinutes(), 0, 0); return n; }
      function nextMonth(d: Date) { const n = new Date(d); n.setMonth(n.getMonth() + 1); n.setHours(d.getHours(), d.getMinutes(), 0, 0); return n; }
      if (candidate <= now) candidate = (pattern === 'daily') ? nextDay(candidate) : nextMonth(candidate);
      for (let attempt = 0; attempt < 60; attempt++) {
        const ds = dateStrOf(candidate);
        if (excludeDates.includes(ds)) { candidate = (pattern === 'daily') ? nextDay(candidate) : nextMonth(candidate); continue; }
        if (pattern === 'daily') {
          const dow = candidate.getDay();
          if (excludeDays.includes(dow)) { candidate = nextDay(candidate); continue; }
          return candidate;
        }
        if (pattern === 'monthly') {
          if (monthDay) {
            const base = new Date(candidate.getFullYear(), candidate.getMonth(), 1, candidate.getHours(), candidate.getMinutes(), 0, 0);
            let target = new Date(base);
            target.setDate(Math.min(monthDay, 28));
            target.setDate(monthDay);
            if (target <= now || target.getMonth() !== base.getMonth()) {
              const nm = nextMonth(base);
              target = new Date(nm.getFullYear(), nm.getMonth(), 1, candidate.getHours(), candidate.getMinutes(), 0, 0);
              target.setDate(monthDay);
            }
            return target;
          }
          if (weekOfMonth != null && dayOfWeek != null) {
            const base = new Date(candidate.getFullYear(), candidate.getMonth(), 1, candidate.getHours(), candidate.getMinutes(), 0, 0);
            const firstDow = base.getDay();
            const offset = (dayOfWeek - firstDow + 7) % 7;
            let targetDate = 1 + offset + (weekOfMonth - 1) * 7;
            let target = new Date(base.getFullYear(), base.getMonth(), targetDate, candidate.getHours(), candidate.getMinutes(), 0, 0);
            if (target <= now || target.getMonth() !== base.getMonth()) {
              const nm = nextMonth(base);
              const fDow = new Date(nm.getFullYear(), nm.getMonth(), 1).getDay();
              const off = (dayOfWeek - fDow + 7) % 7;
              targetDate = 1 + off + (weekOfMonth - 1) * 7;
              target = new Date(nm.getFullYear(), nm.getMonth(), targetDate, candidate.getHours(), candidate.getMinutes(), 0, 0);
            }
            return target;
          }
          return nextMonth(candidate);
        }
      }
      return null;
    } catch { return null; }
  }
  function fmtRuFull(iso?: string | null, timeZone?: string | null): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const opts: Intl.DateTimeFormatOptions = {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      };
      if (timeZone) opts.timeZone = timeZone;
      const parts = new Intl.DateTimeFormat('ru-RU', opts).formatToParts(d);
      const get = (t: string) => parts.find(p => p.type === t)?.value || '';
      const dd = get('day'); const mm = get('month'); const yyyy = get('year');
      const hh = get('hour'); const min = get('minute');
      return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
    } catch { return ''; }
  }
  const recurringDateIso = (() => {
    if (nextDateIso) return String(nextDateIso);
    if (isRecurring) {
      const nd = calcNextRecurringLocal((p as any)?.recurringConfig, tz);
      if (nd) return nd.toISOString();
    }
    return '';
  })();
  const recurringParen = isRecurring && recurringDateIso ? (fmtRuFull(recurringDateIso, tz) || (()=>{
    try { const d = new Date(String(nextDateIso)); if (!Number.isNaN(d.getTime())) { const pad=(n:number)=>String(n).padStart(2,'0'); return `${pad(d.getDate())}.${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; } } catch {}; return ''; })()) : '';
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
        {isRecurring ? (
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
            {`🔂 Повторяющаяся${recurringParen ? ` (${recurringParen})` : ''}`}
          </div>
        ) : null}
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
