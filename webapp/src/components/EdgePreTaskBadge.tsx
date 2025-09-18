type Props = {
  kind: 'task' | 'pretask';
  count: number;
  title?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
};

export default function EdgePreTaskBadge({ kind, count, title, onClick, style }: Props) {
  const isTask = kind === 'task';
  const hasPre = isTask && count > 0;
  const label = title || (hasPre ? 'Управление предзадачами' : 'Создать предзадачу');

  // Colors tuned for light feed cards. Works on dark too.
  const grayFill = '#d1d5db';      // gray-300
  const grayBorder = '#9ca3af';    // gray-400
  const blueFill = '#3b82f6';      // blue-500
  const blueBorder = '#1d4ed8';    // blue-700

  const size = 18; // circle diameter
  const arrowW = 10; // width of the arrow wedge

  return (
    <div
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      role="button"
      style={{
        position: 'absolute',
        top: '50%',
        right: -arrowW, // let the arrow protrude outside card
        transform: 'translateY(-50%)',
        width: size + arrowW,
        height: size,
        cursor: onClick ? 'pointer' : 'default',
        zIndex: 3,
        ...style,
      }}
    >
      {/* Circle */}
      <div
        style={{
          position: 'absolute',
          right: arrowW - 2, // slightly overlap with card edge
          top: 0,
          width: size,
          height: size,
          borderRadius: 999,
          background: hasPre ? blueFill : grayFill,
          border: `1px solid ${hasPre ? blueBorder : grayBorder}`,
          boxShadow: '0 0 0 2px rgba(0,0,0,0.04)'
        }}
      />

      {/* Arrow wedge (only when there are pre-tasks) */}
      {hasPre && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: size / 2 - 7,
            width: 0,
            height: 0,
            borderTop: '7px solid transparent',
            borderBottom: '7px solid transparent',
            borderLeft: `10px solid ${blueFill}`,
            filter: 'drop-shadow(0 0 0 rgba(0,0,0,0.06))',
          }}
        />
      )}
    </div>
  );
}
