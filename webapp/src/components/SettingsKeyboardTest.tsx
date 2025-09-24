// src/components/SettingsKeyboardTest.tsx
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * useKeyboardDock — «прилипает» контейнер к верхней кромке iOS-клавиатуры.
 * Ключ: closeFollowMs=0 — мгновенное скрытие при закрытии клавиатуры.
 */
function useKeyboardDock<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  opts?: {
    openFollowMs?: number; // активное «следование» при ОТКРЫТИИ клавиатуры
    closeFollowMs?: number; // при ЗАКРЫТИИ (0 — мгновенно)
    noLift?: boolean; // блокировать поднятие пальцем и скролл страницы при открытой клавиатуре
    onHide?: (reason: "outside") => void; // мгновенное скрытие по тапу вне
    onShowAbove?: () => void; // док зафиксировался над клавиатурой
    onShowBottom?: () => void; // док вернулся вниз
    onDebug?: (m: {
      inner: number;
      vvH: number;
      vvTop: number;
      kWithOffset: number;
      kHeightOnly: number;
      appliedTop: number;
      baseH: number;
      frozenTop: number;
      open: boolean;
      locked: boolean;
    }) => void;
  }
) {
  const openFollowMs = opts?.openFollowMs ?? 700;
  const closeFollowMs = opts?.closeFollowMs ?? 0;
  const noLift = opts?.noLift ?? true;
  const onHide = opts?.onHide;
  const onShowAbove = opts?.onShowAbove;
  const onShowBottom = opts?.onShowBottom;
  const onDebug = opts?.onDebug;

  const rafRef = useRef<number | null>(null);
  const baseHRef = useRef<number>(0);
  const lastTopRef = useRef<number>(0);
  const frozenTopRef = useRef<number>(0);
  const lockedRef = useRef<null | { scrollY: number }>(null);
  const focusedRef = useRef<boolean>(false);
  const suppressUntilRef = useRef<number>(0);

  const vv =
    (typeof window !== "undefined"
      ? (window as any).visualViewport
      : undefined) as VisualViewport | undefined;

  const clearRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const lockScroll = (enable: boolean) => {
    if (!noLift) return;
    const docEl = document.documentElement;
    const body = document.body;
    if (enable) {
      if (lockedRef.current) return;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      (docEl.style as any).overscrollBehaviorY = "contain";
      lockedRef.current = { scrollY };
    } else {
      if (!lockedRef.current) return;
      const { scrollY } = lockedRef.current;
      body.style.position = "";
      body.style.top = "";
      (docEl.style as any).overscrollBehaviorY = "";
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

  // верх клавиатуры считаем как window.innerHeight - min(vv.height)
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
    const vh = vv?.height || 0;
    const vt = vv?.offsetTop || 0;
    const open = Math.max(0, window.innerHeight - (vh + vt)) > 0;
    const raw = kTopOnly();
    const t = frozenTopRef.current > 0 ? frozenTopRef.current : raw;
    el.style.transform = t > 0 ? `translateY(-${t}px)` : "translateY(0)";
    lockScroll(t > 0);
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
      apply(el);
      return;
    }
    const tick = () => {
      const t = apply(el);
      if (performance.now() < until && t > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        if (lastTopRef.current > 0) frozenTopRef.current = lastTopRef.current;
        rafRef.current = null;
        try {
          if (focusedRef.current && frozenTopRef.current > 0) onShowAbove?.();
        } catch {}
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const el = ref.current as T | null;
    if (!el || !vv) return;

    const onResizeOrScroll = () => {
      const now = performance.now();
      if (!focusedRef.current && now < suppressUntilRef.current) {
        try {
          (el as any).style.display = "none";
        } catch {}
        return;
      }
      const ms = focusedRef.current ? openFollowMs : closeFollowMs;
      followFor(ms, el);
    };

    const onFocusIn = () => {
      try {
        (el as any).style.display = "";
        (el as any).style.opacity = "1";
        (el as any).style.visibility = "visible";
      } catch {}
      focusedRef.current = true;
      followFor(openFollowMs, el);
    };

    const onFocusOut = () => {
      clearRaf();
      lockScroll(false);
      focusedRef.current = false;
      frozenTopRef.current = 0;
      el.style.transform = "translateY(0)";
      const now = performance.now();
      if (now >= suppressUntilRef.current) {
        try {
          (el as any).style.opacity = "1";
          (el as any).style.visibility = "visible";
        } catch {}
        try {
          onShowBottom?.();
        } catch {}
      } else {
        try {
          (el as any).style.opacity = "0";
        } catch {}
      }
      setTimeout(() => apply(el), 0);
      setTimeout(() => apply(el), 80);
      setTimeout(() => apply(el), 160);
    };

    const instantHide = () => {
      clearRaf();
      lockScroll(false);
      focusedRef.current = false;
      frozenTopRef.current = 0;
      suppressUntilRef.current = performance.now() + 600;
      try {
        (el as any).style.opacity = "0";
        (el as any).style.visibility = "hidden";
      } catch {}
      el.style.transform = "translateY(0)";
      try {
        onHide?.("outside");
      } catch {}
      try {
        (document.activeElement as HTMLElement | null)?.blur?.();
      } catch {}
    };

    const onDocTouchStart = (e: Event) => {
      try {
        const n = e.target as Node | null;
        if (!n) return;
        const withinDock = el.contains(n);
        let insideEditable = false;
        try {
          const elNode = n as Element;
          if (elNode && (elNode as any).closest) {
            insideEditable = !!(elNode as any).closest(
              'input,textarea,select,[contenteditable="true"]'
            );
          }
        } catch {}
        if (!withinDock || (withinDock && !insideEditable)) {
          if (!focusedRef.current && !lockedRef.current) return;
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
    document.addEventListener("touchstart", onDocTouchStart as any, {
      capture: true,
    } as any);
    document.addEventListener(
      "pointerdown",
      onDocPointerDown as any,
      { capture: true } as any
    );
    document.addEventListener("mousedown", onDocMouseDown as any, {
      capture: true,
    } as any);
    document.addEventListener("click", onDocClick as any, {
      capture: true,
    } as any);

    followFor(closeFollowMs, el);

    return () => {
      clearRaf();
      vv.removeEventListener("resize", onResizeOrScroll);
      vv.removeEventListener("scroll", onResizeOrScroll);
      window.removeEventListener("orientationchange", onResizeOrScroll);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("touchstart", onDocTouchStart as any, {
        capture: true,
      } as any);
      document.removeEventListener(
        "pointerdown",
        onDocPointerDown as any,
        { capture: true } as any
      );
      document.removeEventListener("mousedown", onDocMouseDown as any, {
        capture: true,
      } as any);
      document.removeEventListener("click", onDocClick as any, {
        capture: true,
      } as any);
      lockScroll(false);
    };
  }, [ref, openFollowMs, closeFollowMs, noLift]);
}

export default function SettingsKeyboardTest({
  onBack: _onBack,
}: {
  onBack: () => void;
}) {
  const microRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  const [dbg, setDbg] = useState<string | null>(null);
  const dbgTimer = useRef<number | null>(null);
  const [tone, setTone] = useState<"dark" | "white">("dark");
  const toneTimer = useRef<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [metrics, setMetrics] = useState<
    | {
        inner: number;
        vvH: number;
        vvTop: number;
        kWithOffset: number;
        kHeightOnly: number;
        appliedTop: number;
        baseH: number;
        frozenTop: number;
        open: boolean;
        locked: boolean;
      }
    | null
  >(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bootRef = useRef<HTMLInputElement | null>(null);
  const [overlayArming, setOverlayArming] = useState(false);
  const [dbgLog, setDbgLog] = useState<string[]>([]);
  const [tapSeq, setTapSeq] = useState(0);
  const lastVvTopRef = useRef(0);

  const log = (m: string) => {
    const t = new Date();
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    const ss = String(t.getSeconds()).padStart(2, "0");
    const ms = String(t.getMilliseconds()).padStart(3, "0");
    setDbgLog((prev) => [`${hh}:${mm}:${ss}.${ms} ${m}`, ...prev].slice(0, 120));
  };

  // Жёстко изолируем системный скролл Telegram iOS (WKWebView)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = { overflow: html.style.overflow, height: html.style.height };
    const prevBody = {
      overflow: body.style.overflow,
      height: body.style.height,
      position: body.style.position,
    };
    html.style.overflow = "hidden";
    html.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.height = "100%";

    const keepTop = () => {
      try {
        window.scrollTo(0, 0);
      } catch {}
    };
    window.addEventListener("scroll", keepTop as any, { passive: true } as any);
    window.addEventListener("resize", keepTop as any);

    return () => {
      html.style.overflow = prevHtml.overflow;
      html.style.height = prevHtml.height;
      body.style.overflow = prevBody.overflow;
      body.style.height = prevBody.height;
      body.style.position = prevBody.position;
      window.removeEventListener("scroll", keepTop as any);
      window.removeEventListener("resize", keepTop as any);
    };
  }, []);

  const ensureVisible = (el: HTMLElement | null) => {
    if (!el) return;
    const scroller = pageRef.current;
    if (!scroller) return;
    try {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {}
    let c = 0;
    const scrolling = () => {
      try {
        const r = el.getBoundingClientRect();
        const s = scroller.getBoundingClientRect();
        if (r.bottom > s.bottom) scroller.scrollTop += r.bottom - s.bottom;
        if (r.top < s.top) scroller.scrollTop -= s.top - r.top;
      } catch {}
      if (c++ < 5) setTimeout(scrolling, 250);
    };
    setTimeout(scrolling, 250);
  };

  const scrollByPixels = (dy: number) => {
    const scroller = pageRef.current;
    if (scroller) {
      try {
        scroller.scrollTop += dy;
      } catch {}
      return;
    }
    try {
      window.scrollBy(0, dy);
    } catch {}
  };

  const showAndFocusInput = () => {
    try {
      const seq = tapSeq + 1;
      setTapSeq(seq);
      log(`[BTN] tap #${seq} → show panel`);
      const el = microRef.current as HTMLDivElement | null;
      if (el) {
        el.style.display = "";
        el.style.opacity = "1";
        el.style.visibility = "visible";
      }
      setHidden(false);
      setOverlayArming(true);
      log(`[BTN] arming overlay (PE off)`);
      try {
        inputRef.current?.click();
        log(`[BTN] input.click()`);
      } catch {}
      try {
        bootRef.current?.focus({ preventScroll: true } as any);
        log(`[BTN] boot.focus()`);
      } catch {}
      try {
        inputRef.current?.focus({ preventScroll: true } as any);
        log(`[BTN] input.focus()`);
      } catch {}
      try {
        const v = inputRef.current as HTMLInputElement | null;
        if (v) {
          const len = (v.value || "").length;
          v.setSelectionRange?.(len, len);
          log(`[BTN] caret set to ${len}`);
        }
      } catch {}
      ensureVisible(inputRef.current || el);
      requestAnimationFrame(() => {
        setOverlayArming(false);
        log(`[BTN] overlay PE on`);
      });
    } catch {}
  };

  const flash = (s: string) => {
    setDbg(s);
    if (dbgTimer.current) clearTimeout(dbgTimer.current);
    dbgTimer.current = window.setTimeout(() => setDbg(null), 800);
  };
  const flashWhite = () => {
    setTone("white");
    if (toneTimer.current) clearTimeout(toneTimer.current);
    toneTimer.current = window.setTimeout(() => setTone("dark"), 700);
  };

  useKeyboardDock(microRef, {
    openFollowMs: 600,
    closeFollowMs: 0,
    noLift: true,
    onHide: () => {
      setHidden(true);
      flash("HIDE (outside)");
    },
    onShowAbove: () => {
      setHidden(false);
      flash("SHOW above");
    },
    onShowBottom: () => {
      setHidden(false);
      flash("SHOW bottom");
      flashWhite();
    },
    onDebug: (m) => {
      setMetrics(m);
      lastVvTopRef.current = m?.vvTop || 0;
    },
  });

  const overlayActive = !hidden;

  return (
    <div
      id="app-scroll"
      ref={pageRef}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        WebkitOverflowScrolling: "touch" as any,
        overscrollBehavior: "none",
        height: "100dvh",
        background: "#0b1220",
        color: "#e8eaed",
      }}
    >
      {/* скрытый фокус-таргет */}
      <input
        ref={bootRef}
        aria-hidden={true}
        style={{
          position: "fixed",
          opacity: 0,
          width: 1,
          height: 1,
          bottom: 0,
          left: 0,
          pointerEvents: "none",
        }}
      />
      {dbg && (
        <div
          style={{
            position: "fixed",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#2563eb",
            color: "#fff",
            border: "1px solid #1f2937",
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 12,
            zIndex: 20000,
          }}
        >
          {dbg}
        </div>
      )}
      {metrics && (
        <div
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 60px)",
            left: 10,
            zIndex: 20000,
            background: "rgba(0,0,0,.6)",
            color: "#fff",
            border: "1px solid #1f2937",
            borderRadius: 8,
            padding: "6px 8px",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          <div>
            kb open: {metrics.open ? "yes" : "no"} | locked:{" "}
            {metrics.locked ? "yes" : "no"}
          </div>
          <div>kHeightOnly: {Math.round(metrics.kHeightOnly)} px</div>
          <div>kWithOffset: {Math.round(metrics.kWithOffset)} px</div>
          <div>appliedTop: {Math.round(metrics.appliedTop)} px</div>
          <div>
            vv.height: {Math.round(metrics.vvH)} | vv.top:{" "}
            {Math.round(metrics.vvTop)}
          </div>
        </div>
      )}
      <div style={{ padding: 12 }}>
        {Array.from({ length: 60 }).map((_, i) => (
          <p
            key={i}
            style={{ margin: "10px 0", lineHeight: 1.6, opacity: 0.95 }}
          >
            Это тестовый текст #{i + 1}. Прокручивай страницу — панель ввода
            снизу должна оставаться строго над клавиатурой на iOS, не смещаясь
            ни вверх, ни вниз, пока клавиатура открыта.
          </p>
        ))}
        <div
          style={{
            marginTop: "calc(100lvh - 400px)",
            padding: 12,
            border: "1px solid #2a3346",
            borderRadius: 12,
            background: "#111827",
          }}
        >
          <div style={{ marginBottom: 8, fontWeight: 700 }}>
            Тестовые поля (ensureVisible)
          </div>
          <p>Проверка автопрокрутки при фокусе:</p>
          <input
            defaultValue="focus me"
            onMouseDown={(e) => {
              try {
                e.currentTarget.focus({ preventScroll: true } as any);
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            onTouchStart={(e) => {
              try {
                e.currentTarget.focus({ preventScroll: true } as any);
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            onFocus={(e) => {
              ensureVisible(e.currentTarget);
              try {
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            style={{
              width: "100%",
              background: "#0b1220",
              color: "#e8eaed",
              border: "1px solid #1f2937",
              borderRadius: 8,
              padding: "8px 10px",
              marginBottom: 8,
              fontSize: 16,
            }}
          />
          <input
            defaultValue="select me"
            onMouseDown={(e) => {
              try {
                e.currentTarget.focus({ preventScroll: true } as any);
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            onTouchStart={(e) => {
              try {
                e.currentTarget.focus({ preventScroll: true } as any);
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            onFocus={(e) => {
              ensureVisible(e.currentTarget);
              try {
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            style={{
              width: "100%",
              background: "#0b1220",
              color: "#e8eaed",
              border: "1px solid #1f2937",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 16,
            }}
          />
        </div>
      </div>

      {createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            pointerEvents: overlayActive && !overlayArming ? "auto" : "none",
            isolation: "isolate",
            contain: "layout paint size",
            backfaceVisibility: "hidden",
            transform: "translateZ(0)",
          }}
          onTouchStart={(e) => {
            try {
              const t = e.target as Element | null;
              const isEditable =
                !!t && !!(t as any).closest('input,textarea,select,[contenteditable="true"]');
              if (!isEditable) {
                e.preventDefault();
                e.stopPropagation();
              }
            } catch {}
          }}
          onPointerDown={(e) => {
            try {
              const t = e.target as Element | null;
              const isEditable =
                !!t && !!(t as any).closest('input,textarea,select,[contenteditable="true"]');
              if (!isEditable) {
                e.preventDefault();
                e.stopPropagation();
              }
            } catch {}
          }}
          onMouseDown={(e) => {
            try {
              const t = e.target as Element | null;
              const isEditable =
                !!t && !!(t as any).closest('input,textarea,select,[contenteditable="true"]');
              if (!isEditable) {
                e.preventDefault();
                e.stopPropagation();
              }
            } catch {}
          }}
          onTouchMove={(e) => {
            try {
              const t = e.target as Element | null;
              const isEditable =
                !!t && !!(t as any).closest('input,textarea,select,[contenteditable="true"]');
              if (!isEditable) {
                e.preventDefault();
                e.stopPropagation();
              }
            } catch {}
          }}
          onWheel={(e) => {
            try {
              e.preventDefault();
              e.stopPropagation();
            } catch {}
          }}
        >
          <div
            ref={microRef}
            style={{
              position: "fixed",
              left: 10,
              right: 10,
              bottom: 0,
              pointerEvents: "auto",
              zIndex: 1000000,
              transform: "translate3d(0,0,0)",
              transition: "none",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              willChange: "transform",
              backfaceVisibility: "hidden" as any,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                background: tone === "white" ? "#ffffff" : "#111827",
                border:
                  tone === "white"
                    ? "1px solid #e5e7eb"
                    : "1px solid #2a3346",
                borderRadius: 12,
                padding: 8,
              }}
            >
              <input
                placeholder="Сообщение…"
                style={{
                  flex: 1,
                  background: tone === "white" ? "#ffffff" : "#0b1220",
                  color: tone === "white" ? "#111827" : "#e8eaed",
                  border:
                    tone === "white"
                      ? "1px solid #d1d5db"
                      : "1px solid #1f2937",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 16,
                }}
                ref={inputRef}
                onFocus={() => {
                  log("[INPUT] focus main");
                }}
                onBlur={() => {
                  log("[INPUT] blur main");
                }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {hidden &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: 10,
              bottom: 200,
              zIndex: 2000000,
              display: "flex",
              gap: 8,
            }}
          >
            <button
              onMouseDown={showAndFocusInput}
              onTouchStart={showAndFocusInput}
              onClick={showAndFocusInput}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "1px solid #1f2937",
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 12,
              }}
            >
              Показать поле
            </button>
            <button
              onMouseDown={() => {
                try {
                  scrollByPixels(300);
                  log("[BTN] scrollBy 300 (MD)");
                } catch {}
              }}
              onTouchStart={() => {
                try {
                  scrollByPixels(300);
                  log("[BTN] scrollBy 300 (TS)");
                } catch {}
              }}
              onClick={() => {
                try {
                  scrollByPixels(300);
                  log("[BTN] scrollBy 300 (CL)");
                } catch {}
              }}
              style={{
                background: "#10b981",
                color: "#0b1220",
                border: "1px solid #1f2937",
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 12,
              }}
            >
              Скролл 300px вниз
            </button>
          </div>,
          document.body
        )}

      <div
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 18px)",
          right: 10,
          zIndex: 2000001,
          width: 260,
          maxHeight: 220,
          overflow: "auto",
          background: "rgba(0,0,0,.6)",
          color: "#e5e7eb",
          border: "1px solid #1f2937",
          borderRadius: 8,
          padding: 8,
          fontSize: 11,
          lineHeight: 1.35,
        }}
      >
        <div style={{ marginBottom: 6, fontWeight: 700 }}>
          Log (tapSeq={tapSeq}, hidden={String(hidden)}, arming=
          {String(overlayArming)})
        </div>
        {dbgLog.slice(0, 15).map((l, i) => (
          <div key={i} style={{ whiteSpace: "pre-wrap", opacity: 0.95 }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
// src/components/SettingsKeyboardTest.tsx
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * useKeyboardDock — «прилипает» контейнер к верхней кромке iOS-клавиатуры.
 * Ключ: closeFollowMs=0 — мгновенное скрытие при закрытии клавиатуры.
 */
function useKeyboardDock<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  opts?: {
    openFollowMs?: number; // активное «следование» при ОТКРЫТИИ клавиатуры
    closeFollowMs?: number; // при ЗАКРЫТИИ (0 — мгновенно)
    noLift?: boolean; // блокировать поднятие пальцем и скролл страницы при открытой клавиатуре
    onHide?: (reason: "outside") => void; // мгновенное скрытие по тапу вне
    onShowAbove?: () => void; // док зафиксировался над клавиатурой
    onShowBottom?: () => void; // док вернулся вниз
    onDebug?: (m: {
      inner: number;
      vvH: number;
      vvTop: number;
      kWithOffset: number;
      kHeightOnly: number;
      appliedTop: number;
      baseH: number;
      frozenTop: number;
      open: boolean;
      locked: boolean;
    }) => void;
  }
) {
  const openFollowMs = opts?.openFollowMs ?? 700;
  const closeFollowMs = opts?.closeFollowMs ?? 0;
  const noLift = opts?.noLift ?? true;
  const onHide = opts?.onHide;
  const onShowAbove = opts?.onShowAbove;
  const onShowBottom = opts?.onShowBottom;
  const onDebug = opts?.onDebug;

  const rafRef = useRef<number | null>(null);
  const baseHRef = useRef<number>(0);
  const lastTopRef = useRef<number>(0);
  const frozenTopRef = useRef<number>(0);
  const lockedRef = useRef<null | { scrollY: number }>(null);
  const focusedRef = useRef<boolean>(false);
  const suppressUntilRef = useRef<number>(0);

  const vv =
    (typeof window !== "undefined"
      ? (window as any).visualViewport
      : undefined) as VisualViewport | undefined;

  const clearRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const lockScroll = (enable: boolean) => {
    if (!noLift) return;
    const docEl = document.documentElement;
    const body = document.body;
    if (enable) {
      if (lockedRef.current) return;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      (docEl.style as any).overscrollBehaviorY = "contain";
      lockedRef.current = { scrollY };
    } else {
      if (!lockedRef.current) return;
      const { scrollY } = lockedRef.current;
      body.style.position = "";
      body.style.top = "";
      (docEl.style as any).overscrollBehaviorY = "";
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

  // верх клавиатуры считаем как window.innerHeight - min(vv.height)
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
    const vh = vv?.height || 0;
    const vt = vv?.offsetTop || 0;
    const open = Math.max(0, window.innerHeight - (vh + vt)) > 0;
    const raw = kTopOnly();
    const t = frozenTopRef.current > 0 ? frozenTopRef.current : raw;
    el.style.transform = t > 0 ? `translateY(-${t}px)` : "translateY(0)";
    lockScroll(t > 0);
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
      apply(el);
      return;
    }
    const tick = () => {
      const t = apply(el);
      if (performance.now() < until && t > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        if (lastTopRef.current > 0) frozenTopRef.current = lastTopRef.current;
        rafRef.current = null;
        try {
          if (focusedRef.current && frozenTopRef.current > 0) onShowAbove?.();
        } catch {}
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const el = ref.current as T | null;
    if (!el || !vv) return;

    const onResizeOrScroll = () => {
      const now = performance.now();
      if (!focusedRef.current && now < suppressUntilRef.current) {
        try {
          (el as any).style.display = "none";
        } catch {}
        return;
      }
      const ms = focusedRef.current ? openFollowMs : closeFollowMs;
      followFor(ms, el);
    };

    const onFocusIn = () => {
      try {
        (el as any).style.display = "";
        (el as any).style.opacity = "1";
        (el as any).style.visibility = "visible";
      } catch {}
      focusedRef.current = true;
      followFor(openFollowMs, el);
    };

    const onFocusOut = () => {
      clearRaf();
      lockScroll(false);
      focusedRef.current = false;
      frozenTopRef.current = 0;
      el.style.transform = "translateY(0)";
      const now = performance.now();
      if (now >= suppressUntilRef.current) {
        try {
          (el as any).style.opacity = "1";
          (el as any).style.visibility = "visible";
        } catch {}
        try {
          onShowBottom?.();
        } catch {}
      } else {
        try {
          (el as any).style.opacity = "0";
        } catch {}
      }
      setTimeout(() => apply(el), 0);
      setTimeout(() => apply(el), 80);
      setTimeout(() => apply(el), 160);
    };

    const instantHide = () => {
      clearRaf();
      lockScroll(false);
      focusedRef.current = false;
      frozenTopRef.current = 0;
      suppressUntilRef.current = performance.now() + 600;
      try {
        (el as any).style.opacity = "0";
        (el as any).style.visibility = "hidden";
      } catch {}
      el.style.transform = "translateY(0)";
      try {
        onHide?.("outside");
      } catch {}
      try {
        (document.activeElement as HTMLElement | null)?.blur?.();
      } catch {}
    };

    const onDocTouchStart = (e: Event) => {
      try {
        const n = e.target as Node | null;
        if (!n) return;
        const withinDock = el.contains(n);
        let insideEditable = false;
        try {
          const elNode = n as Element;
          if (elNode && (elNode as any).closest) {
            insideEditable = !!(elNode as any).closest(
              'input,textarea,select,[contenteditable="true"]'
            );
          }
        } catch {}
        if (!withinDock || (withinDock && !insideEditable)) {
          if (!focusedRef.current && !lockedRef.current) return;
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
    document.addEventListener("touchstart", onDocTouchStart as any, {
      capture: true,
    } as any);
    document.addEventListener(
      "pointerdown",
      onDocPointerDown as any,
      { capture: true } as any
    );
    document.addEventListener("mousedown", onDocMouseDown as any, {
      capture: true,
    } as any);
    document.addEventListener("click", onDocClick as any, {
      capture: true,
    } as any);

    followFor(closeFollowMs, el);

    return () => {
      clearRaf();
      vv.removeEventListener("resize", onResizeOrScroll);
      vv.removeEventListener("scroll", onResizeOrScroll);
      window.removeEventListener("orientationchange", onResizeOrScroll);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("touchstart", onDocTouchStart as any, {
        capture: true,
      } as any);
      document.removeEventListener(
        "pointerdown",
        onDocPointerDown as any,
        { capture: true } as any
      );
      document.removeEventListener("mousedown", onDocMouseDown as any, {
        capture: true,
      } as any);
      document.removeEventListener("click", onDocClick as any, {
        capture: true,
      } as any);
      lockScroll(false);
    };
  }, [ref, openFollowMs, closeFollowMs, noLift]);
}

export default function SettingsKeyboardTest({
  onBack: _onBack,
}: {
  onBack: () => void;
}) {
  const microRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  const [dbg, setDbg] = useState<string | null>(null);
  const dbgTimer = useRef<number | null>(null);
  const [tone, setTone] = useState<"dark" | "white">("dark");
  const toneTimer = useRef<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [metrics, setMetrics] = useState<
    | {
        inner: number;
        vvH: number;
        vvTop: number;
        kWithOffset: number;
        kHeightOnly: number;
        appliedTop: number;
        baseH: number;
        frozenTop: number;
        open: boolean;
        locked: boolean;
      }
    | null
  >(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bootRef = useRef<HTMLInputElement | null>(null);
  const [overlayArming, setOverlayArming] = useState(false);
  const [dbgLog, setDbgLog] = useState<string[]>([]);
  const [tapSeq, setTapSeq] = useState(0);
  const lastVvTopRef = useRef(0);

  const log = (m: string) => {
    const t = new Date();
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    const ss = String(t.getSeconds()).padStart(2, "0");
    const ms = String(t.getMilliseconds()).padStart(3, "0");
    setDbgLog((prev) => [`${hh}:${mm}:${ss}.${ms} ${m}`, ...prev].slice(0, 120));
  };

  // Жёстко изолируем системный скролл Telegram iOS (WKWebView)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = { overflow: html.style.overflow, height: html.style.height };
    const prevBody = {
      overflow: body.style.overflow,
      height: body.style.height,
      position: body.style.position,
    };
    html.style.overflow = "hidden";
    html.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.height = "100%";

    const keepTop = () => {
      try {
        window.scrollTo(0, 0);
      } catch {}
    };
    window.addEventListener("scroll", keepTop as any, { passive: true } as any);
    window.addEventListener("resize", keepTop as any);

    return () => {
      html.style.overflow = prevHtml.overflow;
      html.style.height = prevHtml.height;
      body.style.overflow = prevBody.overflow;
      body.style.height = prevBody.height;
      body.style.position = prevBody.position;
      window.removeEventListener("scroll", keepTop as any);
      window.removeEventListener("resize", keepTop as any);
    };
  }, []);

  const ensureVisible = (el: HTMLElement | null) => {
    if (!el) return;
    const scroller = pageRef.current;
    if (!scroller) return;
    try {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {}
    let c = 0;
    const scrolling = () => {
      try {
        const r = el.getBoundingClientRect();
        const s = scroller.getBoundingClientRect();
        if (r.bottom > s.bottom) scroller.scrollTop += r.bottom - s.bottom;
        if (r.top < s.top) scroller.scrollTop -= s.top - r.top;
      } catch {}
      if (c++ < 5) setTimeout(scrolling, 250);
    };
    setTimeout(scrolling, 250);
  };

  const scrollByPixels = (dy: number) => {
    const scroller = pageRef.current;
    if (scroller) {
      try {
        scroller.scrollTop += dy;
      } catch {}
      return;
    }
    try {
      window.scrollBy(0, dy);
    } catch {}
  };

  const showAndFocusInput = () => {
    try {
      const seq = tapSeq + 1;
      setTapSeq(seq);
      log(`[BTN] tap #${seq} → show panel`);
      const el = microRef.current as HTMLDivElement | null;
      if (el) {
        el.style.display = "";
        el.style.opacity = "1";
        el.style.visibility = "visible";
      }
      setHidden(false);
      setOverlayArming(true);
      log(`[BTN] arming overlay (PE off)`);
      try {
        inputRef.current?.click();
        log(`[BTN] input.click()`);
      } catch {}
      try {
        bootRef.current?.focus({ preventScroll: true } as any);
        log(`[BTN] boot.focus()`);
      } catch {}
      try {
        inputRef.current?.focus({ preventScroll: true } as any);
        log(`[BTN] input.focus()`);
      } catch {}
      try {
        const v = inputRef.current as HTMLInputElement | null;
        if (v) {
          const len = (v.value || "").length;
          v.setSelectionRange?.(len, len);
          log(`[BTN] caret set to ${len}`);
        }
      } catch {}
      ensureVisible(inputRef.current || el);
      requestAnimationFrame(() => {
        setOverlayArming(false);
        log(`[BTN] overlay PE on`);
      });
    } catch {}
  };

  const flash = (s: string) => {
    setDbg(s);
    if (dbgTimer.current) clearTimeout(dbgTimer.current);
    dbgTimer.current = window.setTimeout(() => setDbg(null), 800);
  };
  const flashWhite = () => {
    setTone("white");
    if (toneTimer.current) clearTimeout(toneTimer.current);
    toneTimer.current = window.setTimeout(() => setTone("dark"), 700);
  };

  useKeyboardDock(microRef, {
    openFollowMs: 600,
    closeFollowMs: 0,
    noLift: true,
    onHide: () => {
      setHidden(true);
      flash("HIDE (outside)");
    },
    onShowAbove: () => {
      setHidden(false);
      flash("SHOW above");
    },
    onShowBottom: () => {
      setHidden(false);
      flash("SHOW bottom");
      flashWhite();
    },
    onDebug: (m) => {
      setMetrics(m);
      lastVvTopRef.current = m?.vvTop || 0;
    },
  });

  const overlayActive = !hidden;

  return (
    <div
      id="app-scroll"
      ref={pageRef}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        WebkitOverflowScrolling: "touch" as any,
        overscrollBehavior: "none",
        height: "100dvh",
        background: "#0b1220",
        color: "#e8eaed",
      }}
    >
      {/* скрытый фокус-таргет */}
      <input
        ref={bootRef}
        aria-hidden={true}
        style={{
          position: "fixed",
          opacity: 0,
          width: 1,
          height: 1,
          bottom: 0,
          left: 0,
          pointerEvents: "none",
        }}
      />
      {dbg && (
        <div
          style={{
            position: "fixed",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#2563eb",
            color: "#fff",
            border: "1px solid #1f2937",
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 12,
            zIndex: 20000,
          }}
        >
          {dbg}
        </div>
      )}
      {metrics && (
        <div
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 60px)",
            left: 10,
            zIndex: 20000,
            background: "rgba(0,0,0,.6)",
            color: "#fff",
            border: "1px solid #1f2937",
            borderRadius: 8,
            padding: "6px 8px",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          <div>
            kb open: {metrics.open ? "yes" : "no"} | locked:{" "}
            {metrics.locked ? "yes" : "no"}
          </div>
          <div>kHeightOnly: {Math.round(metrics.kHeightOnly)} px</div>
          <div>kWithOffset: {Math.round(metrics.kWithOffset)} px</div>
          <div>appliedTop: {Math.round(metrics.appliedTop)} px</div>
          <div>
            vv.height: {Math.round(metrics.vvH)} | vv.top:{" "}
            {Math.round(metrics.vvTop)}
          </div>
        </div>
      )}
      <div style={{ padding: 12 }}>
        {Array.from({ length: 60 }).map((_, i) => (
          <p
            key={i}
            style={{ margin: "10px 0", lineHeight: 1.6, opacity: 0.95 }}
          >
            Это тестовый текст #{i + 1}. Прокручивай страницу — панель ввода
            снизу должна оставаться строго над клавиатурой на iOS, не смещаясь
            ни вверх, ни вниз, пока клавиатура открыта.
          </p>
        ))}
        <div
          style={{
            marginTop: "calc(100lvh - 400px)",
            padding: 12,
            border: "1px solid #2a3346",
            borderRadius: 12,
            background: "#111827",
          }}
        >
          <div style={{ marginBottom: 8, fontWeight: 700 }}>
            Тестовые поля (ensureVisible)
          </div>
          <p>Проверка автопрокрутки при фокусе:</p>
          <input
            defaultValue="focus me"
            onMouseDown={(e) => {
              try {
                e.currentTarget.focus({ preventScroll: true } as any);
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            onTouchStart={(e) => {
              try {
                e.currentTarget.focus({ preventScroll: true } as any);
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            onFocus={(e) => {
              ensureVisible(e.currentTarget);
              try {
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            style={{
              width: "100%",
              background: "#0b1220",
              color: "#e8eaed",
              border: "1px solid #1f2937",
              borderRadius: 8,
              padding: "8px 10px",
              marginBottom: 8,
              fontSize: 16,
            }}
          />
          <input
            defaultValue="select me"
            onMouseDown={(e) => {
              try {
                e.currentTarget.focus({ preventScroll: true } as any);
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            onTouchStart={(e) => {
              try {
                e.currentTarget.focus({ preventScroll: true } as any);
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            onFocus={(e) => {
              ensureVisible(e.currentTarget);
              try {
                const len = (e.currentTarget.value || "").length;
                e.currentTarget.setSelectionRange?.(len, len);
              } catch {}
            }}
            style={{
              width: "100%",
              background: "#0b1220",
              color: "#e8eaed",
              border: "1px solid #1f2937",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 16,
            }}
          />
        </div>
      </div>

      {createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            pointerEvents: overlayActive && !overlayArming ? "auto" : "none",
            isolation: "isolate",
            contain: "layout paint size",
            backfaceVisibility: "hidden",
            transform: "translateZ(0)",
          }}
          onTouchStart={(e) => {
            try {
              const t = e.target as Element | null;
              const isEditable =
                !!t && !!(t as any).closest('input,textarea,select,[contenteditable="true"]');
              if (!isEditable) {
                e.preventDefault();
                e.stopPropagation();
              }
            } catch {}
          }}
          onPointerDown={(e) => {
            try {
              const t = e.target as Element | null;
              const isEditable =
                !!t && !!(t as any).closest('input,textarea,select,[contenteditable="true"]');
              if (!isEditable) {
                e.preventDefault();
                e.stopPropagation();
              }
            } catch {}
          }}
          onMouseDown={(e) => {
            try {
              const t = e.target as Element | null;
              const isEditable =
                !!t && !!(t as any).closest('input,textarea,select,[contenteditable="true"]');
              if (!isEditable) {
                e.preventDefault();
                e.stopPropagation();
              }
            } catch {}
          }}
          onTouchMove={(e) => {
            try {
              const t = e.target as Element | null;
              const isEditable =
                !!t && !!(t as any).closest('input,textarea,select,[contenteditable="true"]');
              if (!isEditable) {
                e.preventDefault();
                e.stopPropagation();
              }
            } catch {}
          }}
          onWheel={(e) => {
            try {
              e.preventDefault();
              e.stopPropagation();
            } catch {}
          }}
        >
          <div
            ref={microRef}
            style={{
              position: "fixed",
              left: 10,
              right: 10,
              bottom: 0,
              pointerEvents: "auto",
              zIndex: 1000000,
              transform: "translate3d(0,0,0)",
              transition: "none",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              willChange: "transform",
              backfaceVisibility: "hidden" as any,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                background: tone === "white" ? "#ffffff" : "#111827",
                border:
                  tone === "white"
                    ? "1px solid #e5e7eb"
                    : "1px solid #2a3346",
                borderRadius: 12,
                padding: 8,
              }}
            >
              <input
                placeholder="Сообщение…"
                style={{
                  flex: 1,
                  background: tone === "white" ? "#ffffff" : "#0b1220",
                  color: tone === "white" ? "#111827" : "#e8eaed",
                  border:
                    tone === "white"
                      ? "1px solid #d1d5db"
                      : "1px solid #1f2937",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 16,
                }}
                ref={inputRef}
                onFocus={() => {
                  log("[INPUT] focus main");
                }}
                onBlur={() => {
                  log("[INPUT] blur main");
                }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {hidden &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: 10,
              bottom: 200,
              zIndex: 2000000,
              display: "flex",
              gap: 8,
            }}
          >
            <button
              onMouseDown={showAndFocusInput}
              onTouchStart={showAndFocusInput}
              onClick={showAndFocusInput}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "1px solid #1f2937",
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 12,
              }}
            >
              Показать поле
            </button>
            <button
              onMouseDown={() => {
                try {
                  scrollByPixels(300);
                  log("[BTN] scrollBy 300 (MD)");
                } catch {}
              }}
              onTouchStart={() => {
                try {
                  scrollByPixels(300);
                  log("[BTN] scrollBy 300 (TS)");
                } catch {}
              }}
              onClick={() => {
                try {
                  scrollByPixels(300);
                  log("[BTN] scrollBy 300 (CL)");
                } catch {}
              }}
              style={{
                background: "#10b981",
                color: "#0b1220",
                border: "1px solid #1f2937",
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 12,
              }}
            >
              Скролл 300px вниз
            </button>
          </div>,
          document.body
        )}

      <div
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 18px)",
          right: 10,
          zIndex: 2000001,
          width: 260,
          maxHeight: 220,
          overflow: "auto",
          background: "rgba(0,0,0,.6)",
          color: "#e8eaed",
          border: "1px solid #1f2937",
          borderRadius: 8,
          padding: 8,
          fontSize: 11,
          lineHeight: 1.35,
        }}
      >
        <div style={{ marginBottom: 6, fontWeight: 700 }}>
          Log (tapSeq={tapSeq}, hidden={String(hidden)}, arming=
          {String(overlayArming)})
        </div>
        {dbgLog.slice(0, 15).map((l, i) => (
          <div key={i} style={{ whiteSpace: "pre-wrap", opacity: 0.95 }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
