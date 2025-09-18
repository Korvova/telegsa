import { useEffect, useRef, useState } from 'react';

type Props = {
  anchorId: string;
  count: number;
  onClick?: () => void;
};

export default function EdgePreTaskBadgePortal({ anchorId, count, onClick }: Props) {
  const [pos, setPos] = useState<{ left: number; top: number; visible: boolean }>({ left: 0, top: 0, visible: false });
  const rafRef = useRef<number | null>(null);

  const size = 18;
  const arrow = 10;
  const hasPre = count > 0;

  const update = () => {
    const el = document.getElementById(anchorId);
    if (!el) { setPos(p => ({ ...p, visible: false })); return; }
    const r = el.getBoundingClientRect();
    const left = Math.round(r.right - size/2);
    const top  = Math.round(r.top + r.height/2 - size/2);
    setPos({ left, top, visible: true });
  };

  useEffect(() => {
    const step = () => { update(); rafRef.current = requestAnimationFrame(step); };
    rafRef.current = requestAnimationFrame(step);
    const onResize = () => update();
    const onScroll = () => update();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [anchorId]);

  if (!pos.visible) return null;

  const grayFill = '#d1d5db';
  const grayBorder = '#9ca3af';
  const blueFill = '#3b82f6';
  const blueBorder = '#1d4ed8';

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: size + arrow,
        height: size,
        zIndex: 4000, // поверх всего UI в ленте
        pointerEvents: 'none',
      }}
    >
      <div
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }}
        role="button"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: onClick ? 'pointer' : 'default' }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            borderRadius: 999,
            background: hasPre ? blueFill : grayFill,
            border: `1px solid ${hasPre ? blueBorder : grayBorder}`,
            boxShadow: '0 0 0 2px rgba(0,0,0,0.04)'
          }}
        />
        {hasPre && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: size/2 - 7,
              width: 0,
              height: 0,
              borderTop: '7px solid transparent',
              borderBottom: '7px solid transparent',
              borderLeft: `10px solid ${blueFill}`,
            }}
          />
        )}
      </div>
    </div>
  );
}

