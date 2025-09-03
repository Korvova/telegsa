//StoriesViewer.tsx

import { useEffect, useRef, useState } from 'react';
import type { StoriesBarItem, StorySlide } from './StoriesTypes';

type Props = {
  project: StoriesBarItem;
  onClose: () => void;
  onSeen: (slideIndex: number) => void; // вызываем, когда слайд «дочитали»
  autoAdvanceMs?: number;               // длительность автоперехода одного слайда
};

export default function StoriesViewer({
  project,
  onClose,
  onSeen,
  autoAdvanceMs = 5000,
}: Props) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1 для активной полоски
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedRef = useRef<boolean>(false);

  const slides = project.slides as StorySlide[];

  // автопрогресс текущего слайда
  useEffect(() => {
    // сброс
    if (timerRef.current) cancelAnimationFrame(timerRef.current);
    setProgress(0);
    startedAtRef.current = performance.now();
    pausedRef.current = false;

    const tick = (t: number) => {
      if (pausedRef.current) {
        timerRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsed = t - startedAtRef.current;
      const p = Math.min(1, elapsed / autoAdvanceMs);
      setProgress(p);
      if (p >= 1) {
        // пометить «прочитан»
        onSeen(index);
        // следующий слайд
        next();
        return;
      }
      timerRef.current = requestAnimationFrame(tick);
    };

    timerRef.current = requestAnimationFrame(tick);
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, project.projectId, autoAdvanceMs]);



const next = () => {
  setIndex((i) => {
    onSeen(i);                    // помечаем текущий как прочитанный
    if (i + 1 < slides.length) return i + 1;
    onClose();
    return i;
  });
};

const onTap = (e: React.MouseEvent) => {
  const x = e.clientX;
  const mid = window.innerWidth / 2;
  if (x < mid) {
    setIndex(i => Math.max(0, i - 1));   // ← сразу влево
  } else {
    next();                               // → вправо
  }
};


  // пауза при удержании
  const onPointerDown = () => { pausedRef.current = true; };
  const onPointerUp = () => {
    if (pausedRef.current) {
      pausedRef.current = false;
      // пересчёт старта, чтобы прогресс шёл дальше корректно
      startedAtRef.current = performance.now() - progress * autoAdvanceMs;
    }
  };

  const slide = slides[index];

  return (
    <div
      onClick={onTap}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        color: '#fff',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Верхние полоски прогресса */}
      <div style={{ display: 'flex', gap: 6, padding: 8 }}>
        {slides.map((_, i) => {
          let fill = 0;
          if (i < index) fill = 1;        // уже пройдённые — серые полностью
          if (i === index) fill = progress; // активный — анимируем
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                background: 'rgba(255,255,255,.2)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${fill * 100}%`,
                  height: '100%',
                  background: i === index ? '#94ff94' : '#9ca3af', // активный зелёный, завершённые — серые
                  transition: i === index ? 'none' : 'width 150ms linear',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Заголовок + крестик */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', gap: 10 }}>
        <div style={{ fontWeight: 700 }}>{project.title}</div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            style={{
              background: 'rgba(255,255,255,.15)',
              color: '#fff',
              border: 'none',
              padding: '6px 10px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Контент слайда */}
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 16, textAlign: 'center' }}>
        <div style={{ maxWidth: 640 }}>
          {slide.imageUrl ? (
            <img
              src={slide.imageUrl}
              alt=""
              style={{ maxWidth: '90vw', maxHeight: '70vh', objectFit: 'contain', borderRadius: 12 }}
            />
          ) : null}

          <div style={{ fontSize: 18, marginTop: 12, whiteSpace: 'pre-wrap' }}>
            <b>{slide.actorName}</b>
            {slide.text ? <> — {slide.text}</> : null}
          </div>

          {slide.taskTitle && (
            <div style={{ marginTop: 6, opacity: .8 }}>{slide.taskTitle}</div>
          )}
          {slide.comment && (
            <div
              style={{
                marginTop: 10,
                background: 'rgba(255,255,255,.1)',
                border: '1px solid rgba(255,255,255,.2)',
                borderRadius: 10,
                padding: 10,
                textAlign: 'left',
              }}
            >
              {slide.comment}
            </div>
          )}
          {slide.at && (
            <div style={{ marginTop: 10, opacity: .6, fontSize: 12 }}>{slide.at}</div>
          )}
        </div>
      </div>
    </div>
  );
}
