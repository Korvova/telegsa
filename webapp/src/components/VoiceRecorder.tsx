// webapp/src/components/VoiceRecorder.tsx
import React, { useEffect, useRef, useState } from 'react';

type Props = {
  maxSeconds?: number;                            // длительность записи (сек)
  onRecorded: (file: File) => void;               // колбэк с готовым файлом
  buttonStyle?: React.CSSProperties;              // стили круглой кнопки (вписывается в 36x36)
  className?: string;
};

/**
 * Кнопка записи голоса:
 * - Зажми и держи, чтобы писать. Отпустил — остановили и отдали File.
 * - Автостоп по таймеру maxSeconds.
 * - Показывает обратный отсчёт.
 */
export default function VoiceRecorder({
  maxSeconds = 30,
  onRecorded,
  buttonStyle,
  className,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(maxSeconds);
  const [err, setErr] = useState<string | null>(null);

  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);    // setInterval id
  const timeoutRef = useRef<number | null>(null); // setTimeout id
  const pressedRef = useRef(false);               // чтобы не стартовать повторно

  // подберём поддерживаемый mime
  function getMime(): string | undefined {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (const t of candidates) {
      // @ts-ignore
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) return t;
    }
    return undefined;
  }

  async function start() {
    if (recording || pressedRef.current) return;
    pressedRef.current = true;
    setErr(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Микрофон не поддерживается в этом окружении');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getMime();
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        // собрать Blob -> File
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        chunksRef.current = [];

        // имя файла — voice_<timestamp>.webm/ogg/mp4
        const ext =
          (mr.mimeType.includes('ogg') && 'ogg') ||
          (mr.mimeType.includes('mp4') && 'mp4') ||
          'webm';
        const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: blob.type });

        cleanupStream();
        setRecording(false);
        setSecondsLeft(maxSeconds);

        // отдадим наружу
        try { onRecorded(file); } catch {}
      };

      // запустить запись
      mr.start(100); // чанк каждые 100мс
      setRecording(true);
      setSecondsLeft(maxSeconds);

      // тик раз в секунду для обратного отсчёта
      tickRef.current = window.setInterval(() => {
        setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      }, 1000);

      // автозавершение
      timeoutRef.current = window.setTimeout(() => {
        stop(); // автостоп по времени
      }, maxSeconds * 1000);
    } catch (e: any) {
      pressedRef.current = false;
      setRecording(false);
      setSecondsLeft(maxSeconds);
      setErr(e?.message || 'Не удалось включить запись');
      cleanupStream();
    }
  }

  function stop() {
    if (!recording) return finishPress();
    try {
      mediaRecRef.current?.stop();
    } catch {}
    clearTimers();
    // onstop MediaRecorder сделает остальное
    finishPress();
  }

  function clearTimers() {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    if (timeoutRef.current) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }

  function cleanupStream() {
    mediaRecRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
    }
    streamRef.current = null;
    clearTimers();
  }

  function finishPress() {
    pressedRef.current = false;
  }

  // unmount cleanup
  useEffect(() => {
    return () => {
      try { mediaRecRef.current?.stop(); } catch {}
      cleanupStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // обработчики для мыши/тача (press & hold)
  const handlers = {
    onMouseDown: (e: React.MouseEvent) => { e.preventDefault(); start(); },
    onMouseUp:   (e: React.MouseEvent) => { e.preventDefault(); stop(); },
    onMouseLeave:(e: React.MouseEvent) => { e.preventDefault(); stop(); },

    onTouchStart:(e: React.TouchEvent) => { e.preventDefault(); start(); },
    onTouchEnd:  (e: React.TouchEvent) => { e.preventDefault(); stop(); },
    onTouchCancel:(e: React.TouchEvent) => { e.preventDefault(); stop(); },
  };

  return (
    <button
      type="button"
      aria-label="Удерживайте, чтобы записать голос"
      {...handlers}
      className={className}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        border: '1px solid transparent',
        background: recording ? '#b91c1c' : '#1f2a44',
        color: '#fff',
        cursor: 'pointer',
        position: 'relative',
        outline: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        ...buttonStyle,
      }}
      title={recording ? 'Запись… Отпустите, чтобы отправить' : 'Удерживайте, чтобы записать'}
    >
      {/* Иконка / индикатор */}
      {!recording ? (
        <span style={{ fontSize: 16, lineHeight: '1' }}>🎙️</span>
      ) : (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 999,
              boxShadow: '0 0 0 2px rgba(255,255,255,0.15) inset',
              animation: 'vr-pulse 1s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            {secondsLeft}s
          </span>
        </>
      )}

      {/* минимальная анимация пульса */}
      <style>{`
        @keyframes vr-pulse {
          0%   { box-shadow: 0 0 0 2px rgba(255,255,255,.15) inset; }
          50%  { box-shadow: 0 0 0 4px rgba(255,255,255,.28) inset; }
          100% { box-shadow: 0 0 0 2px rgba(255,255,255,.15) inset; }
        }
      `}</style>

      {/* тихое сообщение об ошибке (не ломаем layout) */}
      {err && (
        <span
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 11,
            opacity: 0.8,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {err}
        </span>
      )}
    </button>
  );
}
