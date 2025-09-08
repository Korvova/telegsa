import { useEffect, useMemo, useRef } from 'react';

export type LabelOption = { id: string; title: string };

type Props = {
  open: boolean;
  labels: LabelOption[];           // список ярлыков текущей группы
  value: string | null;            // выбранный labelId или null = “Все ярлыки”
  onPick: (labelId: string | null) => void;
  onClose: () => void;
  title?: string;

  /** где показывать колесо: 'center' — по центру; 'top' — ближе к верху (см. topOffset) */
  placement?: 'center' | 'top';
  /** отступ сверху в px, если placement='top' */
  topOffset?: number;
};

export default function LabelFilterWheel({
  open,
  labels,
  value,
  onPick,
  onClose,
  title = 'Фильтр по ярлыку',
  placement = 'center',
  topOffset = 96,
}: Props) {
  if (!open) return null;

  const items = useMemo<LabelOption[]>(
    () => [{ id: '__ALL__', title: 'Все ярлыки' }, ...labels],
    [labels]
  );

  const railRef = useRef<HTMLDivElement | null>(null);

  // подсветка/скейл по расстоянию от центра
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      el.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((btn) => {
        const r = btn.getBoundingClientRect();
        const c = r.left + r.width / 2;
        const dx = Math.abs(c - center);
        const k = Math.max(0, 1 - dx / (rect.width * 0.8)); // 0..1
        const scale = 0.86 + k * 0.24;
        const op = 0.55 + k * 0.45;
        btn.style.transform = `scale(${scale})`;
        btn.style.opacity = String(op);
      });
    };

    update();
    const onScroll = () => requestAnimationFrame(update);
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [labels, open]);

  // проскроллить к выбранному при открытии
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const idx = Math.max(
      0,
      items.findIndex((it) => (value ? it.id === value : it.id === '__ALL__'))
    );
    const target = el.querySelectorAll<HTMLElement>('[data-item]')[idx];
    if (target) {
      const r1 = target.getBoundingClientRect();
      const r0 = el.getBoundingClientRect();
      el.scrollLeft += (r1.left + r1.width / 2) - (r0.left + r0.width / 2);
      setTimeout(() => el.dispatchEvent(new Event('scroll')), 0);
    }
  }, [open, items, value]);

  const pick = (id: string) => {
    onPick(id === '__ALL__' ? null : id);
    onClose();
  };

  const stop = (e: any) => e.stopPropagation();

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.5)',
        zIndex: 3000,
        display: 'flex',
        alignItems: placement === 'center' ? 'center' : 'flex-start',
        justifyContent: 'center',
        paddingTop: placement === 'top' ? `${topOffset}px` : 0,
        transition: 'background 200ms ease',
      }}
    >
      <div
        onClick={stop}
        style={{
          width: 'min(640px, 92vw)',
          background: '#0f1216',
          color: '#e8eaed',
          border: '1px solid #2a3346',
          borderRadius: 16,
          padding: '12px 12px 18px',
          margin: 16,
          boxShadow: '0 12px 36px rgba(0,0,0,.35)',
          transform: 'translateY(10px) scale(.98)',
          animation: 'lfw-pop 200ms cubic-bezier(.2,.9,.2,1) forwards',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 700 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8aa0ff',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <div
          ref={railRef}
          style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            padding: '8px 4px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {items.map((it) => {
            const isActive = value ? it.id === value : it.id === '__ALL__';
            return (
              <button
                key={it.id}
                data-item
                onClick={() => pick(it.id)}
                style={{
                  scrollSnapAlign: 'center',
                  flex: '0 0 auto',
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: `1px solid ${isActive ? '#8aa0ff' : '#2a3346'}`,
                  background: isActive ? '#1b2030' : '#121722',
                  color: '#e8eaed',
                  transform: 'scale(0.9)',
                  transition:
                    'transform 180ms ease, opacity 180ms ease, border-color 180ms ease, background 180ms ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {it.id === '__ALL__' ? 'Все ярлыки' : `🏷️ ${it.title}`}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes lfw-pop {
          from { opacity: 0; transform: translateY(16px) scale(.98) }
          to   { opacity: 1; transform: translateY(0)    scale(1) }
        }
      `}</style>
    </div>
  );
}
