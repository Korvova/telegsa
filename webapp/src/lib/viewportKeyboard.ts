// Global VisualViewport/TWA keyboard inset handler.
// Sets CSS var --kb with current keyboard overlap height (px).

import WebApp from '@twa-dev/sdk';

(() => {
  const html = document.documentElement;
  const setKb = (px: number) => {
    const v = Math.max(0, Math.floor(px));
    html.style.setProperty('--kb', `${v}px`);
  };

  // Track if any text input is focused; only then apply kb inset
  let focusActive = false;
  const isTextInput = (t: any): boolean => {
    try {
      if (!t) return false;
      const tag = String(t.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if ((t as any).isContentEditable) return true;
    } catch {}
    return false;
  };
  document.addEventListener('focusin', (e) => {
    focusActive = isTextInput(e.target);
    update();
  }, { capture: true });
  document.addEventListener('focusout', () => {
    // Defer to allow next focused element to report
    setTimeout(() => { focusActive = isTextInput(document.activeElement); update(); }, 0);
  }, { capture: true });

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
    // Only lift when a text input is focused; ignore small bar animations
    const k1 = computeFromVV();
    const k2 = computeFromTWA();
    const raw = Math.max(k1 ?? 0, k2 ?? 0);
    const THRESHOLD = 140; // px: consider keyboard only if larger than bars
    const k = (focusActive && raw > THRESHOLD) ? raw : 0;
    setKb(k);
    try {
      const open = k > 0;
      html.classList.toggle('kb-open', open);
      window.dispatchEvent(new CustomEvent('kb-change', { detail: { open, height: k } }));
    } catch {}
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
