import { useEffect, useRef, useState } from 'react';

type Props = {
  targetId: string;
  durationMs?: number; // hold time to complete
  onComplete?: () => void;
  color?: string;
  width?: number; // stroke width
  radius?: number; // border radius of card
  cancelMovePx?: number; // threshold to cancel on move
};

export default function LongPressOutline({
  targetId,
  durationMs = 3000,
  onComplete,
  color = '#22d3ee',
  width = 8,
  radius = 16,
  cancelMovePx = 10,
}: Props) {
  const [active, setActive] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;

    const onDown = (e: any) => {
      try { e.preventDefault(); } catch {}
      const isPrimary = e.isPrimary !== false; // treat mouse/touch as primary
      if (!isPrimary) return;
      const r = el.getBoundingClientRect();
      setRect(r);
      setProgress(0);
      setActive(true);
      const t = performance.now();
      const x = (e.touches ? e.touches[0]?.clientX : e.clientX) ?? r.left;
      const y = (e.touches ? e.touches[0]?.clientY : e.clientY) ?? r.top;
      startRef.current = { t, x, y };
      pointerIdRef.current = e.pointerId ?? null;
      step();
    };
    const onMove = (e: any) => {
      if (!startRef.current || !active) return;
      const x = (e.touches ? e.touches[0]?.clientX : e.clientX) ?? startRef.current.x;
      const y = (e.touches ? e.touches[0]?.clientY : e.clientY) ?? startRef.current.y;
      const dx = Math.abs(x - startRef.current.x);
      const dy = Math.abs(y - startRef.current.y);
      if (dx > cancelMovePx || dy > cancelMovePx) cancel();
    };
    const onUp = () => cancel();
    const onLeave = () => cancel();

    // Attach listeners (pointer + mouse + touch for safety)
    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerup', onUp, { passive: true });
    el.addEventListener('pointercancel', onUp, { passive: true });
    el.addEventListener('mouseleave', onLeave, { passive: true });
    el.addEventListener('touchstart', onDown, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onUp, { passive: true });
    el.addEventListener('touchcancel', onUp, { passive: true });
    el.addEventListener('mousedown', onDown, { passive: false });
    el.addEventListener('mousemove', onMove, { passive: true });
    el.addEventListener('mouseup', onUp, { passive: true });

    return () => {
      el.removeEventListener('pointerdown', onDown as any);
      el.removeEventListener('pointermove', onMove as any);
      el.removeEventListener('pointerup', onUp as any);
      el.removeEventListener('pointercancel', onUp as any);
      el.removeEventListener('mouseleave', onLeave as any);
      el.removeEventListener('touchstart', onDown as any);
      el.removeEventListener('touchmove', onMove as any);
      el.removeEventListener('touchend', onUp as any);
      el.removeEventListener('touchcancel', onUp as any);
      el.removeEventListener('mousedown', onDown as any);
      el.removeEventListener('mousemove', onMove as any);
      el.removeEventListener('mouseup', onUp as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const cancel = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setActive(false);
    setProgress(0);
  };

  const step = () => {
    if (!startRef.current) return;
    const elapsed = performance.now() - startRef.current.t;
    const p = Math.min(1, elapsed / durationMs);
    setProgress(p);
    // keep overlay aligned if page scrolls a bit while holding
    try {
      const el = document.getElementById(targetId);
      if (el) setRect(el.getBoundingClientRect());
    } catch {}
    if (p >= 1) {
      const done = onComplete;
      cancel();
      if (done) done();
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  };

  if (!active || !rect) return null;

  // SVG stroke-dash animation around rect
  const w = Math.max(0, rect.width);
  const h = Math.max(0, rect.height);
  const rr = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  const perimeter = 2 * (w + h - 2 * rr) + 2 * Math.PI * rr; // approx for rounded rect
  const visible = perimeter * progress;
  const hidden = Math.max(0.0001, perimeter - visible);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 3,
        pointerEvents: 'none',
      }}
    >
      <svg
        width={rect.width}
        height={rect.height}
        style={{ display: 'block', filter: `drop-shadow(0 0 10px ${color}) drop-shadow(0 0 22px ${color})` }}
      >
        <rect
          x={width / 2}
          y={width / 2}
          width={Math.max(0, rect.width - width)}
          height={Math.max(0, rect.height - width)}
          rx={rr}
          ry={rr}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeDasharray={`${visible} ${hidden}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
