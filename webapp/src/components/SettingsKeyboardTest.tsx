// src/components/SettingsKeyboardTest.tsx
import React, { useEffect, useRef, useState } from "react";

/**
 * useKeyboardDock — «прилипает» контейнер к верхней кромке iOS-клавиатуры.
 * Отличие: моментальное скрытие при закрытии клавиатуры (closeFollowMs=0),
 * без «подвисаний» на 300–900 мс.
 */
function useKeyboardDock<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  opts?: {
    openFollowMs?: number;   // сколько активно «следовать» во время ОТКРЫТИЯ клавиатуры
    closeFollowMs?: number;  // во время ЗАКРЫТИЯ (по умолчанию 0 — мгновенно)
    noLift?: boolean;        // блокировать поднятие пальцем и скролл страницы при открытой клавиатуре
    onHide?: (reason: 'outside') => void; // уведомление о мгновенном скрытии по тапу вне
    onShowAbove?: () => void;             // показался над клавиатурой
    onShowBottom?: () => void;            // показался внизу
    onDebug?: (m: { inner: number; vvH: number; vvTop: number; kWithOffset: number; kHeightOnly: number; appliedTop: number; baseH: number; frozenTop: number; open: boolean; locked: boolean }) => void;
  }
) {
  const openFollowMs = opts?.openFollowMs ?? 700;
  const closeFollowMs = opts?.closeFollowMs ?? 0; // ключ к мгновенному исчезновению
  const noLift = opts?.noLift ?? true;
  const onHide = opts?.onHide;
  const onShowAbove = opts?.onShowAbove;
  const onShowBottom = opts?.onShowBottom;
  const onDebug = opts?.onDebug;

  const rafRef = useRef<number | null>(null);
  const baseHRef = useRef<number>(0);     // минимальная vv.height пока клавиатура открыта
  const lastTopRef = useRef<number>(0);   // последний top клавиатуры
  const frozenTopRef = useRef<number>(0); // зафиксированный top на время активной клавиатуры
  const lockedRef = useRef<null | { scrollY: number }>(null);
  const focusedRef = useRef<boolean>(false); // есть ли фокус в инпуте
  const suppressUntilRef = useRef<number>(0); // подавить автопоказ снизу/промежуточные перерисовки

  const vv = (typeof window !== "undefined" ? (window as any).visualViewport : undefined) as VisualViewport | undefined;

  const clearRaf = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };

  const lockScroll = (enable: boolean) => {
    if (!noLift) return;
    const docEl = document.documentElement;
    const body = document.body;
    if (enable) {
      if (lockedRef.current) return;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      (docEl.style as any).overscrollBehaviorY = "contain";
      lockedRef.current = { scrollY };
    } else {
      if (!lockedRef.current) return;
      const { scrollY } = lockedRef.current;
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      (docEl.style as any).overscrollBehaviorY = "";
      // сразу возвращаем скролл (без анимации)
      window.scrollTo(0, scrollY);
      lockedRef.current = null;
    }
  };

  const kWithOffset = () => {
    if (!vv) return 0;
    const vh = vv.height ?? 0;
    const vt = vv.offsetTop ?? 0;
    return Math.max(0, window.innerHeight - (vh + vt));
  };

  // верх клавиатуры: window.innerHeight - min(vv.height) (игнорим offsetTop)
  const kTopOnly = () => {
    if (!vv) return 0;
    const vh = vv.height ?? 0;
    if (kWithOffset() > 0) {
      if (baseHRef.current === 0) baseHRef.current = vh;
    } else {
      baseHRef.current = 0; // клавиатура скрылась
    }
    const h = baseHRef.current || vh;
    const t = Math.max(0, window.innerHeight - h);
    lastTopRef.current = t;
    return t;
  };

  const apply = (el: T) => {
    const vh = vv?.height || 0;
    const vt = vv?.offsetTop || 0;
    const open = Math.max(0, window.innerHeight - (vh + vt)) > 0;
    const raw = kTopOnly();
    const t = frozenTopRef.current > 0 ? frozenTopRef.current : raw;
    el.style.transform = t > 0 ? `translateY(-${t}px)` : "translateY(0)";
    // лочим/анлочим скролл моментально в зависимости от состояния
    lockScroll(focusedRef.current);
    try {
      onDebug?.({
        inner: window.innerHeight,
        vvH: vh,
        vvTop: vt,
        kWithOffset: Math.max(0, window.innerHeight - (vh + vt)),
        kHeightOnly: Math.max(0, window.innerHeight - vh),
        appliedTop: t,
        baseH: baseHRef.current || vh,
        frozenTop: frozenTopRef.current || 0,
        open,
        locked: !!lockedRef.current,
      });
    } catch {}
    return t;
  };

  const followFor = (ms: number, el: T) => {
    const until = performance.now() + ms;
    clearRaf();
    if (ms <= 0) {
      // мгновенно применяем и выходим
      apply(el);
      return;
    }
    const tick = () => {
      const t = apply(el);
      if (performance.now() < until && t > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // зафиксируем достигнутый top до закрытия клавиатуры
        if (lastTopRef.current > 0) frozenTopRef.current = lastTopRef.current;
        rafRef.current = null;
        // если фокус активен и док зафиксирован над клавиатурой — сообщим
        try { if (focusedRef.current && frozenTopRef.current > 0) onShowAbove?.(); } catch {}
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const el = ref.current as T | null;
    if (!el || !vv) return;

    // Не перехватываем тачи, чтобы не мешать фокусу инпута; поднимание предотвращаем заморозкой скролла
    const onResizeOrScroll = () => {
      // если фокус внутри — даём сопровождение; иначе — мгновенно скрываем/держим внизу
      const now = performance.now();
      if (!focusedRef.current && now < suppressUntilRef.current) {
        // во время подавления — не пытаемся что‑то показать; держим скрытым
        try { (el as any).style.display = 'none'; } catch {}
        return;
      }
      const ms = focusedRef.current ? openFollowMs : closeFollowMs;
      followFor(ms, el);
    };

    const onFocusIn = () => {
      // открытие — можно дать чуть «сопровождения»
      try { (el as any).style.display = ''; (el as any).style.opacity = '1'; (el as any).style.visibility = 'visible'; } catch {}
      focusedRef.current = true;
      // Предсказать верх клавиатуры мгновенно, чтобы панель не появлялась с лагом
      const vh = vv?.height || 0;
      const predicted = (lastTopRef.current > 0) ? lastTopRef.current : Math.max(0, window.innerHeight - (vh || 0)) || 340;
      el.style.transform = predicted > 0 ? `translateY(-${predicted}px)` : 'translateY(0)';
      // Явно залочим скролл на время ввода
      lockScroll(true);
      followFor(openFollowMs, el);
    };

    const onFocusOut = () => {
      // закрытие — сразу убрать док без ожидания
      clearRaf();
      lockScroll(false);
      focusedRef.current = false;
      frozenTopRef.current = 0;
      el.style.transform = "translateY(0)";
      const now = performance.now();
      if (now >= suppressUntilRef.current) {
        // вернуть отображение панели внизу
        try { (el as any).style.display = ""; (el as any).style.opacity = "1"; (el as any).style.visibility = "visible"; } catch {}
        try { onShowBottom?.(); } catch {}
      } else {
        // держим скрытым до окончания подавления
        try { (el as any).style.display = "none"; } catch {}
      }
      // iOS иногда обновляет viewport чуть позже — сделаем пару быстрых повторов
      setTimeout(() => apply(el), 0);
      setTimeout(() => apply(el), 80);
      setTimeout(() => apply(el), 160);
    };

    // Мгновенное скрытие по тапу вне дока (до blur), чтобы не было задержки ~500мс
    const instantHide = () => {
      clearRaf();
      lockScroll(false);
      focusedRef.current = false;
      frozenTopRef.current = 0;
      suppressUntilRef.current = performance.now() + 600; // подавим автопоказ снизу на короткое время
      try {
        (el as any).style.display = 'none';
        (el as any).style.opacity = '0';
        (el as any).style.visibility = 'hidden';
      } catch {}
      el.style.transform = 'translateY(0)';
      try { onHide?.('outside'); } catch {}
      try { (document.activeElement as HTMLElement | null)?.blur?.(); } catch {}
    };

    const onDocTouchStart = (e: Event) => {
      try {
        const n = e.target as Node | null;
        if (!n) return;
        const withinDock = el.contains(n);
        let insideEditable = false;
        try {
          const elNode = n as Element;
          if (elNode && elNode.closest) {
            insideEditable = !!elNode.closest('input,textarea,select,[contenteditable="true"]');
          }
        } catch {}
        // Скрываем если тап снаружи панели ИЛИ внутри панели, но не по полю ввода
        if (!withinDock || (withinDock && !insideEditable)) {
          if (!focusedRef.current && !lockedRef.current) return; // не активны
          instantHide();
        }
      } catch {}
    };
    const onDocPointerDown = onDocTouchStart;
    const onDocMouseDown = onDocTouchStart;
    const onDocClick = onDocTouchStart;

    vv.addEventListener("resize", onResizeOrScroll);
    vv.addEventListener("scroll", onResizeOrScroll);
    window.addEventListener("orientationchange", onResizeOrScroll);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("touchstart", onDocTouchStart, { capture: true } as any);
    document.addEventListener("pointerdown", onDocPointerDown as any, { capture: true } as any);
    document.addEventListener("mousedown", onDocMouseDown as any, { capture: true } as any);
    document.addEventListener("click", onDocClick as any, { capture: true } as any);

    // старт
    followFor(closeFollowMs, el); // если клава закрыта — сразу 0; если открыта — применится

    return () => {
      clearRaf();
      vv.removeEventListener("resize", onResizeOrScroll);
      vv.removeEventListener("scroll", onResizeOrScroll);
      window.removeEventListener("orientationchange", onResizeOrScroll);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("touchstart", onDocTouchStart as any, { capture: true } as any);
      document.removeEventListener("pointerdown", onDocPointerDown as any, { capture: true } as any);
      document.removeEventListener("mousedown", onDocMouseDown as any, { capture: true } as any);
      document.removeEventListener("click", onDocClick as any, { capture: true } as any);
      lockScroll(false);
    };
  }, [ref, openFollowMs, closeFollowMs, noLift]);
}

export default function SettingsKeyboardTest({ onBack: _onBack }: { onBack: () => void }) {
  const microRef = useRef<HTMLDivElement | null>(null);
  const [dbg, setDbg] = useState<string | null>(null);
  const dbgTimer = useRef<number | null>(null);
  const [tone, setTone] = useState<'dark' | 'white'>('dark');
  const toneTimer = useRef<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [metrics, setMetrics] = useState<{ inner: number; vvH: number; vvTop: number; kWithOffset: number; kHeightOnly: number; appliedTop: number; baseH: number; frozenTop: number; open: boolean; locked: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const flash = (s: string) => {
    setDbg(s);
    if (dbgTimer.current) clearTimeout(dbgTimer.current);
    dbgTimer.current = window.setTimeout(() => setDbg(null), 800);
  };
  const flashWhite = () => {
    setTone('white');
    if (toneTimer.current) clearTimeout(toneTimer.current);
    toneTimer.current = window.setTimeout(() => setTone('dark'), 700);
  };
  // Строгая фиксация: блокируем подложку при открытой клавиатуре, чтобы док не «улетал» вверх
  useKeyboardDock(microRef, {
    openFollowMs: 600,
    closeFollowMs: 0,
    noLift: true,
    onHide: () => { setHidden(true); flash('HIDE (outside)'); /* hide instantly, no color flash */ },
    onShowAbove: () => { setHidden(false); flash('SHOW above'); },
    onShowBottom: () => { setHidden(false); flash('SHOW bottom'); flashWhite(); },
    onDebug: (m) => setMetrics(m),
  });

  return (
    <div style={{ minHeight: "100svh", background: "#0b1220", color: "#e8eaed" }}>
      {dbg && (
        <div style={{ position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', background: '#2563eb', color: '#fff', border: '1px solid #1f2937', borderRadius: 999, padding: '4px 10px', fontSize: 12, zIndex: 20000 }}>
          {dbg}
        </div>
      )}
      {metrics && (
        <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 60px)', left: 10, zIndex: 20000, background: 'rgba(0,0,0,.6)', color: '#fff', border: '1px solid #1f2937', borderRadius: 8, padding: '6px 8px', fontSize: 12, lineHeight: 1.4 }}>
          <div>kb open: {metrics.open ? 'yes' : 'no'} | locked: {metrics.locked ? 'yes' : 'no'}</div>
          <div>kHeightOnly: {Math.round(metrics.kHeightOnly)} px</div>
          <div>kWithOffset: {Math.round(metrics.kWithOffset)} px</div>
          <div>appliedTop: {Math.round(metrics.appliedTop)} px</div>
          <div>vv.height: {Math.round(metrics.vvH)} | vv.top: {Math.round(metrics.vvTop)}</div>
        </div>
      )}
      <div style={{ padding: 12 }}>
        {Array.from({ length: 60 }).map((_, i) => (
          <p key={i} style={{ margin: "10px 0", lineHeight: 1.6, opacity: 0.95 }}>
            Это тестовый текст #{i + 1}. Прокручивай страницу — панель ввода снизу
            должна оставаться строго над клавиатурой на iOS, не смещаясь ни вверх,
            ни вниз, пока клавиатура открыта.
          </p>
        ))}
      </div>
      <div
        ref={microRef}
        style={{
          position: "fixed",
          left: 10,
          right: 10,
          bottom: 0,
          zIndex: 10000,
          transform: "translate3d(0,0,0)",
          transition: "none",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          willChange: "transform",
          backfaceVisibility: "hidden" as any,
          // touchAction не задаём, чтобы не мешать фокусу инпута на iOS
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            background: tone === 'white' ? '#ffffff' : '#111827',
            border: tone === 'white' ? '1px solid #e5e7eb' : '1px solid #2a3346',
            borderRadius: 12,
            padding: 8,
          }}
        >
          <input
            placeholder="Сообщение…"
            style={{
              flex: 1,
              background: tone === 'white' ? '#ffffff' : '#0b1220',
              color: tone === 'white' ? '#111827' : '#e8eaed',
              border: tone === 'white' ? '1px solid #d1d5db' : '1px solid #1f2937',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 16,
            }}
            ref={inputRef}
          />
        </div>
      </div>
      {hidden && (
        <button
          onClick={() => {
            try {
              const el = microRef.current as HTMLDivElement | null;
              if (el) { el.style.display = ''; el.style.opacity = '1'; el.style.visibility = 'visible'; }
              setHidden(false);
              setTimeout(() => { try { inputRef.current?.focus({ preventScroll: true } as any); } catch {} }, 0);
            } catch {}
          }}
          style={{ position: 'fixed', left: 10, bottom: 10, zIndex: 20001, background: '#2563eb', color: '#fff', border: '1px solid #1f2937', borderRadius: 999, padding: '8px 12px', fontSize: 12 }}
        >
          Показать поле
        </button>
      )}
    </div>
  );
}
