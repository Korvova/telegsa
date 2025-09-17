import { useEffect, useRef, useState } from 'react';

type Props = {
  targetId: string;
  durationMs?: number; // hold time to complete
  startDelayMs?: number; // delay before starting ring/progress
  onComplete?: () => void;
  color?: string;
  width?: number; // stroke width
  radius?: number; // border radius of card
  cancelMovePx?: number; // threshold to cancel on move
  scrollCancelPx?: number; // window scroll delta to cancel
};

export default function LongPressOutline({
  targetId,
  durationMs = 3000,
  startDelayMs = 250,
  onComplete,
  color = '#22d3ee',
  width = 8,
  radius = 16,
  cancelMovePx = 16,
  scrollCancelPx = 3,
}: Props) {
  const [active, setActive] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const delayTimerRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const waitRef = useRef<boolean>(false);
  const scrollStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      // не блокируем скролл: passive listeners; запускаем с задержкой
      if (!e.isPrimary) return;
      const r = el.getBoundingClientRect();
      setRect(r);
      setProgress(0);
      setActive(false);
      const now = performance.now();
      const x = e.clientX ?? r.left;
      const y = e.clientY ?? r.top;
      startRef.current = { t: now, x, y };
      scrollStartRef.current = { x: window.scrollX, y: window.scrollY };
      pointerIdRef.current = e.pointerId ?? null;
      waitRef.current = true;
      if (delayTimerRef.current) window.clearTimeout(delayTimerRef.current);
      delayTimerRef.current = window.setTimeout(() => {
        // если во время ожидания уже отменили — выходим
        if (!waitRef.current) return;
        // старт анимации
        startRef.current = { t: performance.now(), x, y };
        setActive(true);
        step();
      }, Math.max(0, startDelayMs));
    };
    const onMove = (e: PointerEvent) => {
      if (!startRef.current || (!active && !waitRef.current)) return;
      const sx = startRef.current.x;
      const sy = startRef.current.y;
      const x = e.clientX ?? sx;
      const y = e.clientY ?? sy;
      const dx = Math.abs(x - sx);
      const dy = Math.abs(y - sy);
      if (dx > cancelMovePx || dy > cancelMovePx) cancel();
    };
    const onUp = () => cancel();
    const onLeave = () => cancel();

    // Attach only pointer events (cross-browser), passive to keep scroll working
    el.addEventListener('pointerdown', onDown as any, { passive: true });
    el.addEventListener('pointermove', onMove as any, { passive: true });
    el.addEventListener('pointerup', onUp as any, { passive: true });
    el.addEventListener('pointercancel', onUp as any, { passive: true });
    el.addEventListener('mouseleave', onLeave as any, { passive: true });

    const onScroll = () => {
      if (!scrollStartRef.current) return;
      if (!active && !waitRef.current) return;
      const dx = Math.abs(window.scrollX - scrollStartRef.current.x);
      const dy = Math.abs(window.scrollY - scrollStartRef.current.y);
      if (dx > scrollCancelPx || dy > scrollCancelPx) cancel();
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      el.removeEventListener('pointerdown', onDown as any);
      el.removeEventListener('pointermove', onMove as any);
      el.removeEventListener('pointerup', onUp as any);
      el.removeEventListener('pointercancel', onUp as any);
      el.removeEventListener('mouseleave', onLeave as any);
      window.removeEventListener('scroll', onScroll as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, active, cancelMovePx]);

  const cancel = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (delayTimerRef.current) window.clearTimeout(delayTimerRef.current);
    delayTimerRef.current = null;
    startRef.current = null;
    waitRef.current = false;
    scrollStartRef.current = null;
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
