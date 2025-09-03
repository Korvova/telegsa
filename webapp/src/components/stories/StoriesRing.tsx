import React from 'react';

export type StorySegment = {
  id: string;       // id события
  unread: boolean;  // true — зелёная дуга, false — серая
};

type Props = {
  size?: number;          // диаметр пикселей (внешний)
  thickness?: number;     // толщина обводки
  gapDeg?: number;        // угол зазора между дугами (в градусах)
  segments: StorySegment[]; // 1..20 сегментов
  onClick?: () => void;
  children?: React.ReactNode; // содержимое в центре (аватар/инициалы)
};

/**
 * Круг с N дугами. Каждая дуга — отдельное событие:
 * unread=true — зелёная, прочитано — серая.
 */
export default function StoriesRing({
  size = 64,
  thickness = 5,
  gapDeg = 4,
  segments,
  onClick,
  children,
}: Props) {
  const N = Math.max(0, Math.min(20, segments.length));
  const center = size / 2;
  const radius = center - thickness / 2;

  const polarToXY = (cx: number, cy: number, r: number, angleDeg: number) => {
    const a = (angleDeg - 90) * (Math.PI / 180); // -90 чтобы 0° был сверху
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  // рисуем дугу от startDeg до endDeg (по часовой)
  const arcPath = (startDeg: number, endDeg: number) => {
    const start = polarToXY(center, center, radius, startDeg);
    const end = polarToXY(center, center, radius, endDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  // базовый круг подложки (тонкая серая линия)
  const baseCircle = (
    <circle
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke="#2a3346"
      strokeWidth={thickness}
      opacity={0.5}
    />
  );

  const segAngle = N ? 360 / N : 0;
  const gap = Math.min(gapDeg, Math.max(0, segAngle * 0.35)); // не даём зазору «съесть» весь сегмент

  return (
    <div
      onClick={onClick}
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'inline-block',
        cursor: onClick ? 'pointer' : 'default',
      }}
      title="Истории проекта"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {baseCircle}
        {segments.map((s, i) => {
          const a0 = i * segAngle + gap / 2;
          const a1 = (i + 1) * segAngle - gap / 2;
          const d = arcPath(a0, a1);
          const stroke = s.unread ? '#22c55e' /* зелёный */ : '#64748b' /* серый */;
          return (
            <path
              key={s.id || i}
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={thickness}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* центр под аватар/инициалы/иконку */}
      {children && (
        <div
          style={{
            position: 'absolute',
            inset: thickness,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
            background: '#121722',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
