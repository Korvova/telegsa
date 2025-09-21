type Props = {
  kind: 'task' | 'pretask';
  count: number;
  title?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  compact?: boolean; // true = не выходить за пределы контейнера (вся геометрия внутри)
  side?: 'left' | 'right'; // сторона крепления значка
  align?: 'center' | 'top'; // вертикальное выравнивание контейнера
};

export default function EdgePreTaskBadge({ count, title, onClick, style, side = 'right', align = 'center' }: Props) {
  // Показываем стрелку, если есть связи. Для pretask тоже учитываем count.
  const hasPre = count > 0;
  const label = title || (hasPre ? 'Управление предзадачами' : 'Создать предзадачу');

  // Colors tuned for light feed cards. Works on dark too.
  const grayFill = '#d1d5db';      // gray-300
  const grayBorder = '#9ca3af';    // gray-400
  const blueFill = '#3b82f6';      // blue-500 (arrow color)
  const blueBorder = '#1d4ed8';    // blue-700 (border for active)

  const size = 18; // circle diameter
  const isLeft = side === 'left';
  const isCenter = align === 'center';

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
        top: isCenter ? '50%' : (style && (style as any).top) ? (style as any).top : 0,
        right: isLeft ? undefined : 0,
        left: isLeft ? 0 : undefined,
        transform: isCenter ? 'translateY(-50%)' : undefined,
        width: size, // белый круг без внешнего выноса
        height: size,
        cursor: onClick ? 'pointer' : 'default',
        zIndex: 3002,
        ...style,
      }}
    >
      {/* Circle */}
      <div
        style={{
          position: 'absolute',
          right: isLeft ? undefined : 0,
          left: isLeft ? 0 : undefined,
          top: '50%',
          transform: isLeft ? 'translate(-50%, -50%)' : 'translate(50%, -50%)', // центр круга лежит на кромке контейнера
          width: size,
          height: size,
          borderRadius: 999,
          background: hasPre ? '#ffffff' : grayFill,
          border: `1px solid ${hasPre ? blueBorder : grayBorder}`,
          boxShadow: '0 0 0 2px rgba(0,0,0,0.04)'
        }}
      />

      {/* Arrow emoji inside white circle */}
      {hasPre && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: isLeft ? undefined : 0,
            left: isLeft ? 0 : undefined,
            top: '50%',
            transform: (isLeft ? 'translate(-50%, -50%) translateX(1px)' : 'translate(50%, -50%) translateX(-1px)'),
            color: blueFill,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          ➜
        </span>
      )}
    </div>
  );
}
