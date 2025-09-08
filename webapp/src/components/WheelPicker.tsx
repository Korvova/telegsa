import { useEffect, useMemo, useRef } from 'react';

export type WheelItem = { id: string; label: string };

type Props = {
  items: WheelItem[];
  itemHeight?: number;    // по умолчанию 40
  visibleCount?: number;  // по умолчанию 5
  initialIndex?: number;  // опционально
  onChange?: (index: number) => void;
};

export default function WheelPicker({
  items,
  itemHeight = 40,
  visibleCount = 5,
  initialIndex = 0,
  onChange,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // текущее «целевое» целочисленное положение
  const currentIndexRef = useRef<number>(Math.max(0, Math.min(initialIndex, items.length - 1)));
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startTranslateRef = useRef(0);
  const positionsRef = useRef<{ y: number; time: number }[]>([]);
  const inertiaIdRef = useRef<number | null>(null);

  const centerOffset = useMemo(
    () => (visibleCount * itemHeight) / 2 - itemHeight / 2,
    [visibleCount, itemHeight]
  );

  // начальная установка позиции
  useEffect(() => {
    setImmediatePosition(currentIndexRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // обновить список шрифтов/selected по rawIndex
  const updateSizesAndHighlight = (rawIndex: number) => {
    const nearest = Math.round(rawIndex);
    const DIST_MAX = 3;
    const FONT_MAX = 24;
    const FONT_MIN = 14;

    if (!listRef.current) return;
    const children = listRef.current.querySelectorAll<HTMLLIElement>('li');

    children.forEach((li, idx) => {
      const dist = Math.abs(idx - rawIndex);
      const fontSize =
        dist >= DIST_MAX ? FONT_MIN : FONT_MAX - ((FONT_MAX - FONT_MIN) / DIST_MAX) * dist;
      li.style.fontSize = `${fontSize}px`;
      li.classList.toggle('selected', idx === nearest);
    });

    if (onChange) onChange(nearest);
  };

  const getCurrentTranslate = () => {
    if (!listRef.current) return 0;
    const style = window.getComputedStyle(listRef.current);
    const matrix = style.transform || (style as any).webkitTransform || (style as any).mozTransform;
    if (matrix && matrix !== 'none') {
      const vals = matrix.match(/matrix.*\((.+)\)/)![1].split(', ');
      return parseFloat(vals[5]);
    }
    return 0;
  };

  const setImmediatePosition = (index: number) => {
    if (!listRef.current) return;
    const translateY = centerOffset - index * itemHeight;
    listRef.current.style.transition = 'none';
    listRef.current.style.transform = `translateY(${translateY}px)`;
    updateSizesAndHighlight(index);
  };

  const setAnimatedSnapToIndex = (index: number) => {
    if (!listRef.current) return;
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    currentIndexRef.current = clamped;
    const translateY = centerOffset - clamped * itemHeight;
    listRef.current.style.transition = 'transform 0.3s ease-out';
    listRef.current.style.transform = `translateY(${translateY}px)`;
    updateSizesAndHighlight(clamped);
  };

  const startInertia = (initialVelocityPxPerFrame: number) => {
    let velocity = initialVelocityPxPerFrame;

    const step = () => {
      if (!listRef.current) return;
      if (Math.abs(velocity) < 0.5) {
        if (inertiaIdRef.current !== null) cancelAnimationFrame(inertiaIdRef.current);
        inertiaIdRef.current = null;
        finalizeScroll();
        return;
      }
      const currentTranslate = getCurrentTranslate();
      const newTranslate = currentTranslate + velocity;
      listRef.current.style.transform = `translateY(${newTranslate}px)`;

      const rawIndex = (centerOffset - newTranslate) / itemHeight;
      updateSizesAndHighlight(rawIndex);

      velocity *= 0.95; // трение
      inertiaIdRef.current = requestAnimationFrame(step);
    };

    inertiaIdRef.current = requestAnimationFrame(step);
  };

  const finalizeScroll = () => {
    const finalTranslate = getCurrentTranslate();
    let rawIndex = (centerOffset - finalTranslate) / itemHeight;
    let rounded = Math.round(rawIndex);
    rounded = Math.max(0, Math.min(rounded, items.length - 1));
    setAnimatedSnapToIndex(rounded);
  };

  const onDragStart = (clientY: number) => {
    if (inertiaIdRef.current !== null) {
      cancelAnimationFrame(inertiaIdRef.current);
      inertiaIdRef.current = null;
    }
    draggingRef.current = true;
    startYRef.current = clientY;
    startTranslateRef.current = getCurrentTranslate();
    positionsRef.current = [{ y: clientY, time: Date.now() }];
    if (listRef.current) listRef.current.style.transition = 'none';
  };

  const onDragMove = (clientY: number) => {
    if (!draggingRef.current || !listRef.current) return;
    positionsRef.current.push({ y: clientY, time: Date.now() });
    if (positionsRef.current.length > 5) positionsRef.current.shift();

    const deltaY = clientY - startYRef.current;
    const newTranslate = startTranslateRef.current + deltaY;
    listRef.current.style.transform = `translateY(${newTranslate}px)`;

    const rawIndex = (centerOffset - newTranslate) / itemHeight;
    updateSizesAndHighlight(rawIndex);
  };

  const onDragEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    const pos = positionsRef.current;
    if (pos.length >= 2) {
      const last = pos[pos.length - 1];
      let i = pos.length - 2;
      while (i > 0 && last.time - pos[i].time < 50) i--;
      const first = pos[i];
      const dy = last.y - first.y;
      const dt = last.time - first.time;
      if (dt > 0) {
        const v_ms = dy / dt; // px/ms
        const velocityPerFrame = v_ms * (1000 / 60);
        startInertia(velocityPerFrame);
        return;
      }
    }
    finalizeScroll();
  };

  // mouse/touch события
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      onDragStart(e.clientY);
      const onMove = (m: MouseEvent) => onDragMove(m.clientY);



const onUp = () => {
  document.removeEventListener('mousemove', onMove);
  document.removeEventListener('mouseup', onUp);
  onDragEnd();
};




      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      onDragStart(e.changedTouches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      onDragMove(e.changedTouches[0].clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      onDragEnd();
    };

    wrapper.addEventListener('mousedown', onMouseDown);
    wrapper.addEventListener('touchstart', onTouchStart, { passive: false });
    wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
    wrapper.addEventListener('touchend', onTouchEnd, { passive: false });
    wrapper.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      wrapper.removeEventListener('mousedown', onMouseDown);
      wrapper.removeEventListener('touchstart', onTouchStart as any);
      wrapper.removeEventListener('touchmove', onTouchMove as any);
      wrapper.removeEventListener('touchend', onTouchEnd as any);
      wrapper.removeEventListener('touchcancel', onTouchEnd as any);
      if (inertiaIdRef.current !== null) cancelAnimationFrame(inertiaIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerOffset, itemHeight, visibleCount, items.length]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: 220,            // пошире под названия групп
        height: visibleCount * itemHeight,
        overflow: 'hidden',
        borderRadius: 10,
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <ul
        ref={listRef}
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          transform: `translateY(${centerOffset - currentIndexRef.current * itemHeight}px)`,
          transition: 'transform 0.3s ease-out',
        }}
      >
        {items.map((it) => (
          <li
            key={it.id}
            className="picker-item"
            style={{
              height: itemHeight,
              lineHeight: `${itemHeight}px`,
              textAlign: 'center',
              fontSize: 16,
              color: '#666',
              padding: '0 8px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'font-size 0.1s ease-out',
            }}
          >
            {it.label}
          </li>
        ))}
      </ul>

      {/* градиенты сверху/снизу */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 20%),' +
            'linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 20%)',
          backgroundRepeat: 'no-repeat',
          backgroundSize: `100% ${itemHeight}px, 100% ${itemHeight}px`,
          backgroundPosition: 'top left, bottom left',
        }}
      />
      {/* подсветка центральной строки */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: itemHeight,
          transform: 'translateY(-50%)',
          backgroundColor: 'rgba(200,200,200,0.25)',
          borderRadius: 6,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
