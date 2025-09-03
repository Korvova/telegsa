import { useEffect, useRef } from 'react';
import type { StorySegment } from './StoriesTypes'; // общий тип, локальный НЕ объявляем

type Props = {
  size?: number;          // внешний диаметр
  stroke?: number;        // толщина
  segments: StorySegment[]; // массив сегментов (1..20)
  /** подпись в центре (мы передаём первые 4 символа названия проекта) */
  centerLabel?: string;
};

export default function StoriesRing({
  size = 64,
  stroke = 6,
  segments,
  centerLabel = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const W = size;
    const H = size;

    // канвас с учётом DPR — чтобы было чётко
    cvs.width = W * dpr;
    cvs.height = H * dpr;
    cvs.style.width = `${W}px`;
    cvs.style.height = `${H}px`;

    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // масштаб под DPR

    // геометрия кольца
    const cx = W / 2;
    const cy = H / 2;
    const r = (Math.min(W, H) - stroke) / 2;

    // цвета
    const colBg = '#2a3346';    // фоновая «тонкая» окружность под сегменты
    const colSeen = '#9aa3b2';  // просмотренный сегмент (серый)
    const colUnseen = '#22c55e';// не просмотренный (зелёный)
    const colProgress = '#22c55e';

    // тонкая подложка
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = colBg;
    ctx.lineWidth = stroke;
    ctx.lineCap = 'round';
    ctx.stroke();

    const n = Math.max(1, Math.min(20, segments.length || 1));

    // разрезаем круг на n частей и делаем «зазор» между дугами
    const full = Math.PI * 2;
    const gapAngle = Math.PI / 60; // ~3°
    const slice = full / n;
    const arc = Math.max(0, slice - gapAngle); // собственно рисуемая часть

    // рисуем каждый сегмент:
    for (let i = 0; i < n; i++) {
      const seg = segments[i] || {};
      const start = -Math.PI / 2 + i * slice + gapAngle / 2;
      const end = start + arc;

      // цвет сегмента — серый если seen, иначе зелёный
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, end);
      ctx.strokeStyle = seg.seen ? colSeen : colUnseen;
      ctx.lineWidth = stroke;
      ctx.lineCap = 'round';
      ctx.stroke();

      // если есть прогресс — поверх «закрасим» долю прогресса (только для активного)
      if (!seg.seen && typeof seg.progress === 'number' && seg.progress > 0) {
        const pEnd = start + arc * Math.min(1, Math.max(0, seg.progress));
        ctx.beginPath();
        ctx.arc(cx, cy, r, start, pEnd);
        ctx.strokeStyle = colProgress;
        ctx.lineWidth = stroke;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
  }, [size, stroke, JSON.stringify(segments)]);

  // Текст в центре — первые 4 символа
  const label = (centerLabel || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <canvas ref={canvasRef} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.max(10, Math.floor(size * 0.22)),
          color: '#e5e7eb',
          textAlign: 'center',
          lineHeight: 1.1,
          letterSpacing: 0.2,
          fontWeight: 600,
          width: size - 8,
          margin: '0 auto',
          pointerEvents: 'none',
        }}
        title={centerLabel}
      >
        {label || '•'}
      </div>
    </div>
  );
}
