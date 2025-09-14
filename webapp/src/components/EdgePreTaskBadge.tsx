type Props = {
  kind: 'task' | 'pretask';
  count: number;
  title?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
};

export default function EdgePreTaskBadge({ kind, count, title, onClick, style }: Props) {
  const isTask = kind === 'task';
  const isEmpty = isTask && count <= 0;
  const icon = isEmpty ? '🔘' : '⚫';
  const label = title || (isEmpty ? 'Создать предзадачу' : 'Управление предзадачами');
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
        right: -2,
        top: 8,
        width: 28,
        height: 28,
        borderRadius: 999,
        background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        padding: 0,
        zIndex: 3,
        ...style,
      }}
    >
      <span style={{ fontSize: 18, pointerEvents: 'none' }}>{icon}</span>
      {!isEmpty && count > 0 ? (
        <span
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            minWidth: 16,
            height: 16,
            borderRadius: 999,
            background: '#111827',
            color: '#fff',
            border: '1px solid #374151',
            fontSize: 10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 2px',
            pointerEvents: 'none',
          }}
        >
          {count}
        </span>
      ) : null}
    </div>
  );
}
