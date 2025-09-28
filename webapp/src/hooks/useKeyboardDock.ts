import { useEffect, useRef } from 'react';

/**
 * useKeyboardDock — «прилипает» ref‑контейнер к верхней кромке iOS‑клавиатуры.
 * Основано на стабильной логике из SettingsKeyboardTest.tsx.
 */
export default function useKeyboardDock<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  opts?: {
    openFollowMs?: number;
    closeFollowMs?: number;
    noLift?: boolean;
  }
) {
  const openFollowMs = opts?.openFollowMs ?? 600;
  const closeFollowMs = opts?.closeFollowMs ?? 0;
  const noLift = opts?.noLift ?? true;

  const rafRef = useRef<number | null>(null);
  const baseHRef = useRef<number>(0);
  const lastTopRef = useRef<number>(0);
  const lockedRef = useRef<null | { scrollY: number }>(null);
  const focusedRef = useRef<boolean>(false);

  const vv = (typeof window !== 'undefined' ? (window as any).visualViewport : undefined) as VisualViewport | undefined;

  const clearRaf = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };

  const lockScroll = (enable: boolean) => {
    if (!noLift) return;
    const docEl = document.documentElement;
    const body = document.body as HTMLBodyElement;
    if (enable) {
      if (lockedRef.current) return;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      (docEl.style as any).overscrollBehaviorY = 'contain';
      lockedRef.current = { scrollY };
    } else {
      if (!lockedRef.current) return;
      const { scrollY } = lockedRef.current;
      body.style.position = '';
      body.style.top = '';
      (docEl.style as any).overscrollBehaviorY = '';
      try { window.scrollTo(0, scrollY); } catch {}
      lockedRef.current = null;
    }
  };

  const kWithOffset = () => {
    if (!vv) return 0;
    const vh = vv.height ?? 0;
    const vt = vv.offsetTop ?? 0;
    return Math.max(0, window.innerHeight - (vh + vt));
  };

  const kTopOnly = () => {
    if (!vv) return 0;
    const vh = vv.height ?? 0;
    if (kWithOffset() > 0) {
      if (baseHRef.current === 0) baseHRef.current = vh;
    } else {
      baseHRef.current = 0;
    }
    const h = baseHRef.current || vh;
    const t = Math.max(0, window.innerHeight - h);
    lastTopRef.current = t;
    return t;
  };

  const apply = (el: T) => {
    const raw = kTopOnly();
    const t = raw;
    (el.style as any).transform = t > 0 ? `translateY(-${t}px)` : 'translateY(0)';
    lockScroll(t > 0);
    return t;
  };

  const followFor = (ms: number, el: T) => {
    const until = performance.now() + ms;
    clearRaf();
    if (ms <= 0) { apply(el); return; }
    const tick = () => {
      const t = apply(el);
      if (performance.now() < until && t > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const el = ref.current as T | null;
    if (!el || !vv) return;
    const onResizeOrScroll = () => { const ms = focusedRef.current ? openFollowMs : closeFollowMs; followFor(ms, el); };
    const onFocusIn = () => { focusedRef.current = true; followFor(openFollowMs, el); };
    const onFocusOut = () => { clearRaf(); lockScroll(false); focusedRef.current = false; (el.style as any).transform = 'translateY(0)'; setTimeout(() => apply(el), 0); setTimeout(() => apply(el), 80); setTimeout(() => apply(el), 160); };

    vv.addEventListener('resize', onResizeOrScroll);
    vv.addEventListener('scroll', onResizeOrScroll);
    window.addEventListener('orientationchange', onResizeOrScroll);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);

    followFor(closeFollowMs, el);

    return () => {
      clearRaf();
      vv.removeEventListener('resize', onResizeOrScroll);
      vv.removeEventListener('scroll', onResizeOrScroll);
      window.removeEventListener('orientationchange', onResizeOrScroll);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      lockScroll(false);
    };
  }, [ref, openFollowMs, closeFollowMs, noLift]);
}

