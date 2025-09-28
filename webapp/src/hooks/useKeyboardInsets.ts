import { useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';

function isTextInput(el: any): boolean {
  try {
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if ((el as any).isContentEditable) return true;
  } catch {}
  return false;
}

export function useKeyboardInsets(
  enabled: boolean,
  scope?: React.RefObject<HTMLElement>,
  threshold = 140,
  strict = false,
  includeOffset = false,
  stable = false,
  useTWA = true,
) {
  const isiOS = useMemo(() => {
    try { return /iPad|iPhone|iPod/i.test(navigator.userAgent || ''); } catch { return false; }
  }, []);

  const [bottom, setBottom] = useState(0);
  const [stableBottom, setStableBottom] = useState(0);

  useEffect(() => {
    if (!enabled || !isiOS) { setBottom(0); return; }
    const vv: any = (window as any).visualViewport || null;

    let focusActive = false;
    const updateFocus = () => {
      try {
        const ae = document.activeElement as any;
        focusActive = !!(ae && isTextInput(ae) && (!scope?.current || scope.current.contains(ae)));
      } catch { focusActive = false; }
    };

    const compute = () => {
      // Raw keyboard occlusion height by VisualViewport and TWA viewport
      const vvH = vv?.height || window.innerHeight;
      const vvTop = vv?.offsetTop || 0;
      // choose mode: height only vs height+offset (closer to InputAccessory behavior)
      const kHeightOnly = Math.max(0, window.innerHeight - vvH);
      const kHeightWithOffset = Math.max(0, window.innerHeight - (vvH + vvTop));
      const k1 = includeOffset ? kHeightWithOffset : kHeightOnly;
      let k2 = 0;
      if (useTWA) {
        try {
          const waH = (WebApp as any)?.viewportHeight || (WebApp as any)?.viewportStableHeight || 0;
          if (waH) k2 = Math.max(0, window.innerHeight - Number(waH));
        } catch {}
      }
      const raw = Math.max(k1, k2);
      let next = strict ? raw : ((focusActive && raw > threshold) ? raw : 0);
      // Stable mode: while keyboard is open, never go below the maximum seen value
      if (stable) {
        if (next > 0) {
          setStableBottom((prev) => (next > prev ? next : prev));
          next = Math.max(next, stableBottom);
        } else {
          setStableBottom(0);
        }
      }
      setBottom(next);
      try { document.documentElement.style.setProperty('--kb', `${next}px`); } catch {}
    };

    const onResize = () => { updateFocus(); compute(); };
    const onFocus = () => { updateFocus(); compute(); };

    updateFocus(); compute();
    vv?.addEventListener?.('resize', onResize);
    vv?.addEventListener?.('scroll', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('focusin', onFocus, { capture: true });
    document.addEventListener('focusout', onFocus, { capture: true });
    try { (WebApp as any)?.onEvent?.('viewportChanged', onResize); } catch {}

    return () => {
      vv?.removeEventListener?.('resize', onResize);
      vv?.removeEventListener?.('scroll', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('focusin', onFocus, { capture: true } as any);
      document.removeEventListener('focusout', onFocus, { capture: true } as any);
      try { (WebApp as any)?.offEvent?.('viewportChanged', onResize); } catch {}
    };
  }, [enabled, scope, threshold, isiOS, strict, includeOffset, stable, stableBottom, useTWA]);

  return { bottom };
}
