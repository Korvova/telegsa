import { useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { fetchBoard, moveTask, reopenTask } from '../api';

export type StageKey = 'Inbox' | 'Doing' | 'Done' | 'Cancel' | 'Approval' | 'Wait';

const ORDER: StageKey[] = ['Inbox', 'Doing', 'Done', 'Cancel', 'Approval', 'Wait'];

type Props = {
  taskId: string;
  type?: 'TASK' | 'EVENT';
  currentPhase?: StageKey | string;
  groupId: string | null;
  meChatId: string;
  onPhaseChanged?: (next: StageKey) => void;
  onRequestComplete?: () => void;
};

export default function StageCarousel({ taskId, /*type = 'TASK',*/ currentPhase, groupId, meChatId, onPhaseChanged, onRequestComplete }: Props) {
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null); // кратковременная подпись после клика

  useEffect(() => {
    if (!meChatId) return;
    let alive = true;
    fetchBoard(meChatId, groupId ?? undefined)
      .then((r) => {
        if (!alive || !r?.ok) return;
        const map: Record<string, string> = {};
        for (const c of r.columns) map[c.name] = c.id;
        setColMap(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [meChatId, groupId]);

  const stages: StageKey[] = useMemo(() => ORDER.filter((s) => !!colMap[s]), [colMap]);
  const active: StageKey | undefined = (ORDER as string[]).includes(String(currentPhase)) ? (currentPhase as StageKey) : undefined;

  function computeInitialIndex(): number {
    // Предлагаем наиболее уместное быстрое действие
    // 1) Если задача завершена — по умолчанию «В РАБОТУ»
    if (active === 'Done' && stages.includes('Doing')) return stages.indexOf('Doing');
    // 2) Если задача в «Новое» / «Отмена» / «Ждёт» — также предлагаем «В РАБОТУ»
    if ((active === 'Inbox' || active === 'Cancel' || active === 'Wait') && stages.includes('Doing')) return stages.indexOf('Doing');
    // 3) Иначе, если доступно «Завершить» — показываем его
    if (stages.includes('Done')) return stages.indexOf('Done');
    if (active) return Math.max(0, stages.indexOf(active));
    return 0;
  }

  const [idx, setIdx] = useState<number>(computeInitialIndex());

  useEffect(() => {
    setIdx(computeInitialIndex());
  }, [stages.length, active]);

  if (!stages.length) return null;

  const cur = stages[idx] || stages[0];
  // индексы соседей (подписи скрыты)

  async function handlePick(target: StageKey) {
    if (busy) return;
    if (!colMap[target]) return;
    if (target === 'Done') {
      // мгновенная обратная связь
      flashFeedback(target);
      onRequestComplete?.();
      return;
    }
    try {
      setBusy(true);
      // если были в Done — открыть снова
      if (active === 'Done') {
        await reopenTask(taskId);
      }
      await moveTask(taskId, colMap[target], 0, meChatId);
      onPhaseChanged?.(target);
      try { WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch {}
      flashFeedback(target);
    } catch (e: any) {
      const msg = String(e?.message || '');
      const status = Number((e?.response && (e.response as any).status) || (/\b403\b/.test(msg) ? 403 : 0));
      if (status === 403 || /no_rights/.test(msg)) alert('У вас нет прав на это действие');
      else alert('Не удалось сменить стадию');
    } finally {
      setBusy(false);
    }
  }

  function flashFeedback(s: StageKey) {
    const txt = feedbackOf(s);
    if (!txt) return;
    try { setFlash(txt); setTimeout(() => setFlash(null), 1200); } catch {}
  }

  const title = flash || labelOf(cur);
  // боковые подписи скрыты по просьбе — оставляем только стрелки

  // Цвета центра по стадиям
  const centerStyle = styleForStage(cur);

  return (
    <div style={wrap}>
      <div style={leftWrap}>
        <button disabled={busy} onClick={() => setIdx((i) => (i - 1 + stages.length) % stages.length)} title="Назад" style={arrowBtn}>
          {'<'}
        </button>
      </div>

      <button disabled={busy} onClick={() => handlePick(cur)} style={{ ...centerBtnBase, ...centerStyle }}>
        {title}
      </button>

      <div style={rightWrap}>
        <button disabled={busy} onClick={() => setIdx((i) => (i + 1) % stages.length)} title="Вперёд" style={arrowBtn}>
          {'>'}
        </button>
      </div>
    </div>
  );
}

function labelOf(s: StageKey): string {
  switch (s) {
    case 'Inbox': return 'В НОВОЕ';
    case 'Doing': return 'В РАБОТУ';
    case 'Done': return 'ЗАВЕРШИТЬ';
    case 'Cancel': return 'ОТМЕНА';
    case 'Approval': return 'НА СОГЛАСОВАНИИ';
    case 'Wait': return 'ЖДЁТ';
    // default: unreachable
  }
}

function feedbackOf(s: StageKey): string | null {
  switch (s) {
    case 'Inbox': return '🌱 Новое';
    case 'Doing': return '🔨 В работе';
    case 'Done': return '✔ Завершено';
    case 'Cancel': return '❌ Отмена';
    case 'Approval': return '👉👈 Согласов';
    case 'Wait': return '🥶 Ждёт';
  }
  return null;
}

const wrap: React.CSSProperties = {
  margin: '10px 0 8px',
  padding: 0,
  borderRadius: 14,
  border: 'none',
  background: 'transparent',
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  alignItems: 'center',
  gap: 8,
};

const leftWrap: React.CSSProperties = { display:'flex', alignItems:'center', justifyContent:'flex-start', gap: 6, minWidth: 0 };
const rightWrap: React.CSSProperties = { display:'flex', alignItems:'center', justifyContent:'flex-end', gap: 6, minWidth: 0 };

// side label style (unused, left intentionally blank)

// side labels removed

const arrowBtn: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 10,
  border: '1px solid #2a3346',
  background: '#121722',
  color: '#e8eaed',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: '16px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
};

const centerBtnBase: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 16,
  cursor: 'pointer',
  fontSize: 15,
  letterSpacing: 0.2,
  textShadow: '0 1px 2px rgba(0,0,0,.35)',
  whiteSpace: 'nowrap',
};

function styleForStage(s: StageKey): React.CSSProperties {
  switch (s) {
    case 'Inbox': // Светлый пастельный серый (приятный, без синевы)
      return {
        background: 'linear-gradient(135deg, #22262f, #3b424e)',
        border: '1px solid #596273',
        color: '#eaeef5',
        boxShadow: '0 10px 28px rgba(148,163,184,.22), inset 0 0 20px rgba(255,255,255,.07)'
      };
    case 'Doing': // Пастельный синий (мягче, менее «синюшный»)
      return {
        background: 'linear-gradient(135deg, #2c3f5b, #5b7ea9)',
        border: '1px solid #3e5a85',
        color: '#eef4ff',
        boxShadow: '0 8px 24px rgba(91,126,169,.30), inset 0 0 18px rgba(255,255,255,.05)'
      };
    case 'Done': // Зелёный
      return {
        background: 'linear-gradient(135deg, #1d3b2a, #2a7a4a)',
        border: '1px solid #2b5f44',
        color: '#eaffea',
        boxShadow: '0 10px 28px rgba(16,185,129,.35), inset 0 0 22px rgba(255,255,255,.06)'
      };
    case 'Cancel': // Красный
      return {
        background: 'linear-gradient(135deg, #3a1f1f, #7a2a2a)',
        border: '1px solid #5a2b2b',
        color: '#ffd7d7',
        boxShadow: '0 10px 28px rgba(244,63,94,.25), inset 0 0 22px rgba(255,255,255,.05)'
      };
    case 'Approval': // Жёлтый
      return {
        background: 'linear-gradient(135deg, #3a2a10, #a6791a)',
        border: '1px solid #6a4a20',
        color: '#fff4cc',
        boxShadow: '0 10px 28px rgba(250,204,21,.25), inset 0 0 22px rgba(255,255,255,.05)'
      };
    case 'Wait': // Голубой
      return {
        background: 'linear-gradient(135deg, #102a3a, #2a6aa4)',
        border: '1px solid #274864',
        color: '#e6f7ff',
        boxShadow: '0 10px 28px rgba(56,189,248,.25), inset 0 0 22px rgba(255,255,255,.05)'
      };
  }
}
