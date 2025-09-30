import StarBadge from '../StarBadge';

export type FeedTaskBadge = { text: string; bg: string; fg: string; brd: string } | null;

export type FeedTaskCardProps = {
  id: string;
  text: string;
  isEvent?: boolean;
  fromProcess?: boolean;
  badge?: FeedTaskBadge;
  dateLine?: string | null;
  deadline?: { iso: string; leftText: string; overdue?: boolean } | null;
  nextReminderAt?: string | null;
  acceptCondition?: 'NONE' | 'PHOTO' | 'APPROVAL';
  bounty?: { stars: number; status?: 'NONE'|'PLEDGED'|'PAID'|'REFUNDED'|string } | null;
  group?: { title: string; public?: boolean; telegram?: boolean; chipBg?: string } | null;
  labels?: string[];
  assignee?: { name?: string | null; meChatId?: string; assigneeChatId?: string | null; myRankIcon?: string | null } | null;
  // optional interactions used в ленте
  onEditDeadline?: (() => void) | null;
  onClickBadge?: (() => void) | null;
};

export default function FeedTaskCard({
  id,
  text,
  isEvent,
  fromProcess,
  badge,
  dateLine,
  deadline,
  nextReminderAt,
  acceptCondition = 'NONE',
  bounty,
  group,
  labels = [],
  assignee,
  onEditDeadline,
  onClickBadge,
}: FeedTaskCardProps) {
  const needsPhoto = acceptCondition === 'PHOTO';
  const needsApproval = acceptCondition === 'APPROVAL';
  const hasBounty = !!(bounty && typeof bounty.stars === 'number' && bounty.stars > 0);
  const isOverdue = !!(deadline?.overdue);
  const firstLabelTitle = (labels && labels.length > 0) ? labels[0] : null;
  const restLabelsCount = Math.max(0, (labels?.length || 0) - 1);

  return (
    <div style={{ position: 'relative' }} data-task-id={id}>

      {/* верхняя строка: слева награда (без фона), справа — группа; ниже — ярлыки */}
      {(group || hasBounty || firstLabelTitle) && (
        <div style={{ display: 'grid', gap: 2, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              {hasBounty && (<StarBadge amount={bounty!.stars} status={bounty!.status} flat />)}
            </div>
            {group && (
              <div
                style={{
                  display: 'inline-block',
                  background: group.public ? 'transparent' : (group.chipBg || '#1b2234'),
                  color: group.public ? '#16a34a' : '#fff',
                  padding: '3px 8px',
                  borderRadius: 8,
                  fontSize: 12,
                  border: group.public ? '1px solid #16a34a' : undefined,
                }}
              >
                {(group.public ? '🌍 ' : (group.telegram ? '➡️ ' : ''))}{group.title}
                {firstLabelTitle && (
                  <span style={{ marginLeft: 6, color: '#374151' }}>🏷️ {firstLabelTitle}</span>
                )}
                {restLabelsCount > 0 && (
                  <span style={{ marginLeft: 4, fontSize: 12, opacity: 0.7 }}>+{restLabelsCount}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* основной текст (внутренний блок с тенями) */}
      <div style={{ display: 'flex', alignItems: 'start', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 16,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'inherit',
              border: 'none',
              borderRadius: 12,
              padding: '8px 10px',
              boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.03), inset 1px 1px 2px rgba(16,24,40,0.08), inset -1px -1px 2px rgba(255,255,255,0.16)'
            }}
          >
            {isEvent ? '📅 ' : ''}
            {fromProcess ? '🔀 ' : ''}
            {text}
          </div>
        </div>
      </div>
      {badge && (
        <span
          title={badge.text}
          onClick={(e) => { if (onClickBadge) { e.preventDefault(); e.stopPropagation(); onClickBadge(); } }}
          style={{
            position: 'absolute',
            right: 0,
            top: -3,
            background: badge.bg,
            color: badge.fg,
            border: 'none',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 12,
            whiteSpace: 'nowrap',
            cursor: onClickBadge ? 'pointer' : 'default',
            zIndex: 1,
          }}
        >
          {badge.text}
        </span>
      )}

      {dateLine && (
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{dateLine}</div>
      )}

      {/* дедлайн */}
      {deadline && (
        onEditDeadline ? (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEditDeadline?.(); }}
            title="Изменить дедлайн"
            style={{ fontSize: 12, marginBottom: 6, color: isOverdue ? '#b91c1c' : '#1f2937', background:'transparent', border:'none', padding:0, textAlign:'left', cursor:'pointer' }}
          >
            🚩 {formatShort(deadline.iso)} • {deadline.leftText}
          </button>
        ) : (
          <div style={{ fontSize: 12, marginBottom: 6, color: isOverdue ? '#b91c1c' : '#1f2937' }}>
            🚩 {formatShort(deadline.iso)} • {deadline.leftText}
          </div>
        )
      )}

      {nextReminderAt && (
        <div style={{ fontSize: 12, marginBottom: 6, color: '#374151' }}>
          ⏰ {formatShort(nextReminderAt)}
        </div>
      )}

      {deadline?.overdue && (
        <span style={{ fontSize: 11, background:'#7f1d1d', color:'#fee2e2', border:'1px solid #dc2626', borderRadius:999, padding:'2px 6px', marginBottom:6 }}>
          ⚠️ Просрочен
        </span>
      )}

      {needsPhoto && (
        <div style={{ fontSize: 12, marginBottom: 6 }} title="Требуется фото">
          ☝️📸 Требуется фото
        </div>
      )}
      {needsApproval && (
        <div style={{ fontSize: 12, marginBottom: 6 }} title="Требуется согласование">
          ☝️🤝 Требуется согласование
        </div>
      )}


      {/* исполнитель */}
      {assignee?.name ? (
        <div style={{ fontSize: 12, opacity: 0.8, display: 'flex', gap: 10 }}>
          <span>
            👤 {assignee.myRankIcon && assignee.meChatId === assignee.assigneeChatId
              ? `${assignee.myRankIcon} ${assignee.name}`
              : assignee.name}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function formatShort(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const nn = (n: number) => String(n).padStart(2, '0');
  return `${nn(d.getDate())}.${nn(d.getMonth() + 1)} ${nn(d.getHours())}:${nn(d.getMinutes())}`;
}
