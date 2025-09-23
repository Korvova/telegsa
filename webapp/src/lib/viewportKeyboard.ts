// Global VisualViewport/TWA keyboard inset handler.
// Sets CSS var --kb with current keyboard overlap height (px).

import WebApp from '@twa-dev/sdk';

(() => {
  const html = document.documentElement;
  const setKb = (px: number) => {
    const v = Math.max(0, Math.floor(px));
    html.style.setProperty('--kb', `${v}px`);
  };

  const computeFromVV = () => {
    try {
      const vv = (window as any).visualViewport;
      if (!vv) return null as number | null;
      // Use only height delta. offsetTop can change on page scroll and should not affect kb inset.
      const k = Math.max(0, window.innerHeight - (vv.height || 0));
      return k;
    } catch { return null; }
  };

  const computeFromTWA = () => {
    try {
      const h = (WebApp as any)?.viewportHeight || (WebApp as any)?.viewportStableHeight;
      if (!h) return null as number | null;
      const k = Math.max(0, window.innerHeight - Number(h));
      return k;
    } catch { return null; }
  };

  const update = () => {
    const k1 = computeFromVV();
    const k2 = computeFromTWA();
    const k = Math.max(k1 ?? 0, k2 ?? 0);
    setKb(k);
  };

  try {
    const vv = (window as any).visualViewport;
    vv?.addEventListener?.('resize', update);
  } catch {}
  try { (WebApp as any)?.onEvent?.('viewportChanged', update); } catch {}
  window.addEventListener('orientationchange', update);
  window.addEventListener('resize', update);

  // Initial
  update();
})();
