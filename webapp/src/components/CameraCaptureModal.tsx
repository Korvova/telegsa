import { useEffect, useRef, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  dockBottom?: number;
};

export default function CameraCaptureModal({ open, onClose, onCapture, dockBottom = 0 }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;

    async function start() {
      setError(null);
      if (!open) return;
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, // основная камера
          audio: false,
        });
        if (stopped) {
          s.getTracks().forEach(t => t.stop());
          return;
        }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          const p = videoRef.current.play();
          if (p && typeof (p as any).catch === 'function') (p as Promise<void>).catch(() => {});
        }
      } catch (e: any) {
        // фоллбэк на фронтальную
        try {
          const s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false,
          });
          if (stopped) {
            s.getTracks().forEach(t => t.stop());
            return;
          }
          setStream(s);
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            const p = videoRef.current.play();
            if (p && typeof (p as any).catch === 'function') (p as Promise<void>).catch(() => {});
          }
        } catch (e2: any) {
          setError('Камера недоступна. Разрешите доступ к камере или попробуйте другой браузер.');
        }
      }
    }

    start();
    return () => {
      stopped = true;
      try {
        if (videoRef.current) videoRef.current.srcObject = null;
      } catch {}
      try {
        stream?.getTracks().forEach(t => t.stop());
      } catch {}
      setStream(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capture = async () => {
    if (!videoRef.current) return;
    if (busy) return;
    setBusy(true);
    try {
      const v = videoRef.current;
      if (!v.videoWidth || !v.videoHeight) {
        setError('Видео ещё не готово. Подождите секунду и попробуйте снова.');
        setBusy(false);
        return;
      }
      // делаем снимок
      const canvas = document.createElement('canvas');
      const max = 1280; // слегка уменьшим
      let w = v.videoWidth, h = v.videoHeight;
      if (w > h && w > max) { h = Math.round(h * (max / w)); w = max; }
      if (h >= w && h > max) { w = Math.round(w * (max / h)); h = max; }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas_2d_failed');
      ctx.drawImage(v, 0, 0, w, h);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob_failed')), 'image/jpeg', 0.9)
      );
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
      onClose();
    } catch (e) {
      setError('Не удалось сделать снимок. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div style={{...overlay, paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.max(0, dockBottom)}px)`}} onClick={onClose}>
      <div
        style={modal}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onMouseDownCapture={e => e.stopPropagation()}
        onPointerDownCapture={e => e.stopPropagation()}
        onTouchStartCapture={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Камера</div>
        {error ? <div style={errBox}>{error}</div> : null}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', borderRadius: 12, background: '#000' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={capture} disabled={busy} style={btnPrimary}>📷 Сфотографировать</button>
          <button onClick={onClose} disabled={busy} style={btn}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
};
const modal: React.CSSProperties = {
  width: '100%', maxWidth: 420, background: '#1b2030', color: '#e8eaed',
  border: '1px solid #2a3346', borderRadius: 16, padding: 16,
};
const btn: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 12, border: '1px solid #2a3346',
  background: '#121722', color: '#e8eaed', cursor: 'pointer', flex: 1,
};
const btnPrimary: React.CSSProperties = {
  ...btn, background: '#202840',
};
const errBox: React.CSSProperties = {
  background: '#2a1a1a', color: '#ffd7d7', border: '1px solid #442626',
  padding: 8, borderRadius: 8, marginBottom: 8, fontSize: 13,
};
