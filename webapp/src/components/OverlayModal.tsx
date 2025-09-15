// webapp/src/components/OverlayModal.tsx
import { useEffect, type ReactNode } from 'react';
import ReactDOM from 'react-dom';

export default function OverlayModal({
  open,
  onClose,
  children,
  maxWidth = 600,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f1422', color: '#e8eaed', border: '1px solid #2a3346', borderRadius: 16, padding: 16,
          width: '100%', maxWidth, boxShadow: '0 16px 48px rgba(0,0,0,.5)'
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

