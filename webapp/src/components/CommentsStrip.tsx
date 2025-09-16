type Props = {
  count: number;
  onClick?: () => void;
  style?: React.CSSProperties;
};

export default function CommentsStrip({ count, onClick, style }: Props) {
  if (!count || count <= 0) return null;
  const baseStyle: React.CSSProperties = {
    display: 'block',
    boxSizing: 'border-box',
    width: '100%',
    textAlign: 'left',
    padding: '6px 10px',
    borderRadius: 0,
    border: '1px solid #c7d2fe',
    background: '#eef2ff',
    color: '#1e3a8a',
    fontSize: 12,
    cursor: onClick ? 'pointer' : 'default',
  };
  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick && onClick();
      }}
      style={{ ...baseStyle, ...(style || {}) }}
      title="Комментарии"
    >
      💬 ({count}) комментарии →
    </div>
  );
}
