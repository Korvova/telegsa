// webapp/src/components/Achievements.tsx
import { useEffect, useMemo, useState } from 'react';
import type { TaskFeedItem } from '../api';
import { getMyRating, type RatingStats } from '../api';
import OverlayModal from './OverlayModal';
import AchievementsRulesModal from './AchievementsRulesModal';

type AchStats = {
  acorns: number; // 🌰 posted by me
  seedlings: number; // 🌱 done by me where creator = me
  seedlingsRemainder: number; // 🌱 after converting to 🦅
  eaglesBase: number; // 🦅 done by others where creator = me
  eagles: number; // 🦅 after conversions and penalties
  eaglesFromSeedlings: number; // 🦅 gained from 🌱/100
  phoenix: number; // 🐦‍🔥 from 🦅 >= 100 (floor)
  loadBlack: number; // ⚫ tasks assigned to me by others (active)
  loadRed: number; // 🔴 units = ⚫/100 if > 100
  loadRedInt: number; // integer part for penalty
  rockets: number; // 🚀 done by me when creator != me
  rocketsAfterPenalty: number; // 🚀 after 💣 penalty
  bombs: number; // 💣 overdue count (assigned to me, active)
};

function phaseIsDone(status: string | undefined) {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s === 'done' || s === 'готово' || s === 'готов';
}
function phaseIsCancel(status: string | undefined) {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s === 'cancel' || s === 'отмена' || s === 'отменено' || s === 'отменена';
}

export function computeAchievements(items: TaskFeedItem[], meChatId: string): AchStats {
  const now = Date.now();

  const me = String(meChatId || '');
  let acorns = 0;
  let seedlings = 0;
  let eaglesBase = 0;
  let rockets = 0;
  let loadBlack = 0;
  let bombs = 0;

  for (const t of items) {
    const isDone = phaseIsDone(t.status);
    const isCancel = phaseIsCancel(t.status);
    const active = !isDone && !isCancel;
    const creator = String(t.creatorChatId || '');
    const assignee = t.assigneeChatId ? String(t.assigneeChatId) : '';

    if (creator === me) acorns++;

    if (isDone && creator === me && assignee === me) seedlings++;

    if (isDone && creator === me && assignee && assignee !== me) eaglesBase++;

    if (isDone && assignee === me && creator && creator !== me) rockets++;

    if (active && assignee === me && creator !== me) loadBlack++;

    if (active && assignee === me && t.deadlineAt) {
      const ts = Date.parse(String(t.deadlineAt));
      if (!Number.isNaN(ts) && ts < now) bombs++;
    }
  }

  // Convert 🌱 to 🦅
  const eaglesFromSeedlings = Math.floor(seedlings / 100);
  const seedlingsRemainder = seedlings % 100;
  let eagles = eaglesBase + eaglesFromSeedlings;

  // Load penalty: integer part of 🔴 subtracts from 🦅
  const loadRed = loadBlack > 100 ? loadBlack / 100 : 0;
  const loadRedInt = Math.floor(loadRed);
  eagles = Math.max(0, eagles - loadRedInt);

  // Overdue penalty: subtract 💣 from 🦅 and 🚀
  eagles = Math.max(0, eagles - bombs);
  const rocketsAfterPenalty = Math.max(0, rockets - bombs);

  // Phoenix conversion (only for display): if >=100, convert fully to 🐦‍🔥 units
  const phoenix = eagles >= 100 ? Math.floor(eagles / 100) : 0;

  return {
    acorns,
    seedlings,
    seedlingsRemainder,
    eaglesBase,
    eagles,
    eaglesFromSeedlings,
    phoenix,
    loadBlack,
    loadRed,
    loadRedInt,
    rockets,
    rocketsAfterPenalty,
    bombs,
  };
}

// Rank mapping by 🦅 score
export type RankDef = { threshold: number; icon: string; title: string; perks?: string[] };

export const RANKS: RankDef[] = [
  { threshold: 0, icon: '🐜', title: 'Муравей' },
  { threshold: 10, icon: '🐟', title: 'Рыба', perks: ['Возможность отправлять голосовые сообщения.'] },
  { threshold: 500, icon: '🦂', title: 'Скорпион', perks: ['Дедлайны задач', 'Комиссия 6% вместо 8% за вознаграждения'] },
  { threshold: 800, icon: '🐿️', title: 'Белка', perks: ['Напоминания задач', 'Комиссия 5% вместо 6%'] },
  { threshold: 1100, icon: '🐱', title: 'Кот', perks: ['1 бесплатный публичный проект'] },
  { threshold: 1400, icon: '🐶', title: 'Собака', perks: ['Скидка 20% на тарифы'] },
  { threshold: 1900, icon: '🐺', title: 'Волк', perks: ['Комиссия 4% вместо 5%', 'Скидка 30% на тарифы', '1 предзадача'] },
  { threshold: 2400, icon: '🐻', title: 'Медведь', perks: ['Комиссия 3% вместо 4%', 'Скидка 40% на тарифы', '3 предзадачи', 'Неограниченные ярлыки'] },
  { threshold: 3700, icon: '🦅', title: 'Орёл', perks: ['Подписки на задачи', 'Фото и согласование (условие: фото + согласование)', 'Скидка 50% на тарифы'] },
  { threshold: 4600, icon: '🐎', title: 'Лошадь', perks: ['Добавлять Фото+согласование, Документ+согласование'] },
  { threshold: 5700, icon: '🐉', title: 'Дракон', perks: ['Визуальные БП с предзадачами до 5'] },
  { threshold: 7000, icon: '🦈', title: 'Акула', perks: ['Комиссия 2% вместо 3%', '100 предзадач', 'Скидка 50% на тарифы'] },
  { threshold: 8500, icon: '🐘', title: 'Слон', perks: ['Комиссия 2% вместо 3%', '10 000 предзадач', 'Скидка 60% на тарифы'] },
  { threshold: 10300, icon: '🦖', title: 'Тирекс', perks: ['Чекеры погоды и перезапуска процессов (бесплатно)'] },
  { threshold: 12500, icon: '🐯', title: 'Тигр', perks: ['Комиссия 1% вместо 2%', 'Скидка 70% на тарифы', '3 бесплатные публичные группы', 'Доступ к ИИ для автоматизации БП'] },
  { threshold: 20000, icon: '🦁', title: 'Лев', perks: ['Комиссия 0% за вознаграждения', 'Скидка 80% на тарифы', 'Ранний доступ к обновлениям', 'Персональный чат с поддержкой'] },
];

export function pickRank(eaglesScore: number): { current: RankDef; next: RankDef | null } {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (eaglesScore >= r.threshold) current = r; else break;
  }
  const idx = RANKS.findIndex((r) => r.threshold === current.threshold);
  const next = idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
  return { current, next };
}

export function AchievementsBar({ items, meChatId }: { items: TaskFeedItem[]; meChatId: string }) {
  const [serverStats, setServerStats] = useState<RatingStats | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!meChatId) return;
        const r = await getMyRating(meChatId);
        if (alive && r?.ok && r.stats) setServerStats(r.stats as RatingStats);
      } catch {}
    })();
    return () => { alive = false; };
  }, [meChatId, items.length]);

  const local = useMemo(() => computeAchievements(items, meChatId), [items, meChatId]);
  const stats: AchStats = serverStats ? {
    acorns: serverStats.acorns,
    seedlings: serverStats.seedlings,
    seedlingsRemainder: serverStats.seedlingsRemainder,
    eaglesBase: serverStats.eaglesBase,
    eagles: serverStats.eagles,
    eaglesFromSeedlings: serverStats.eaglesFromSeedlings,
    phoenix: serverStats.phoenix,
    loadBlack: serverStats.loadBlack,
    loadRed: serverStats.loadRed,
    loadRedInt: serverStats.loadRedInt,
    rockets: serverStats.rockets,
    rocketsAfterPenalty: serverStats.rocketsAfterPenalty,
    bombs: serverStats.bombs,
  } : local;
  const [open, setOpen] = useState(false);

  const parts: string[] = [];
  if (stats.acorns > 0) parts.push(`${stats.acorns}🌰`);
  if (stats.seedlingsRemainder > 0) parts.push(`${stats.seedlingsRemainder}🌱`);

  if (stats.phoenix > 0) parts.push(`${stats.phoenix} 🐦‍🔥`);
  else if (stats.eagles > 0) parts.push(`${stats.eagles} 🦅`);

  if (stats.loadBlack > 0) {
    if (stats.loadBlack > 100) parts.push(`${(stats.loadBlack / 100).toFixed(1)}🔴`);
    else parts.push(`${stats.loadBlack} ⚫`);
  }
  if (stats.rocketsAfterPenalty > 0) parts.push(`${stats.rocketsAfterPenalty} 🚀`);
  if (stats.bombs > 0) parts.push(`${stats.bombs} 💣`);

  if (!parts.length) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Показать правила рейтинга"
        style={{
          background: '#101626',
          color: '#e8eaed',
          border: '1px solid #2a3346',
          borderRadius: 999,
          padding: '4px 10px',
          fontSize: 12,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        {parts.join(' | ')}
      </button>

      <AchievementsRulesModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function RankBadgeButton({ items, meChatId }: { items: TaskFeedItem[]; meChatId: string }) {
  const stats = useMemo(() => computeAchievements(items, meChatId), [items, meChatId]);
  const score = stats.eagles;
  const { current } = pickRank(score);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`Текущий ранг: ${current.title}`}
        style={{ background: 'transparent', border: 'none', color: '#e8eaed', cursor: 'pointer', fontSize: 18 }}
      >
        {current.icon}
      </button>
      {open && <RankModal open={open} onClose={() => setOpen(false)} stats={stats} />}
    </>
  );
}

function RankModal({ open, onClose, stats }: { open: boolean; onClose: () => void; stats: AchStats }) {
  const score = stats.eagles;
  const { current, next } = pickRank(score);
  const [openRanks, setOpenRanks] = useState<Record<number, boolean>>({});
  const toggleRank = (thr: number) => setOpenRanks((m) => ({ ...m, [thr]: !m[thr] }));

  if (!open) return null;
  return (
    <OverlayModal open={open} onClose={onClose} maxWidth={600}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <div style={{ fontWeight:800, fontSize:16 }}>Текущий ранг: {current.icon} {current.title}</div>
        <div style={{ marginLeft:'auto' }} />
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#9fb1ff', cursor:'pointer', fontSize:18 }}>✖</button>
      </div>
      <div style={{ fontSize:14, marginBottom:8 }}>Очки (🦅): <b>{score}</b></div>

      {next ? (
        <div style={{ fontSize:14, marginBottom:12 }}>
          Следующий ранг: <b>{next.icon} {next.title}</b> • порог: {next.threshold} 🦅 • осталось: <b>{Math.max(0, next.threshold - score)}</b>
        </div>
      ) : (
        <div style={{ fontSize:14, marginBottom:12 }}>Вы на максимальном ранге 🏆</div>
      )}

      <div style={{ maxHeight: '55vh', overflowY:'auto', display:'grid', gap:8 }}>
        {RANKS.map((r) => {
          const opened = !!openRanks[r.threshold];
          return (
            <div key={r.threshold} style={{ border:'1px solid #2a3346', borderRadius:12, overflow:'hidden', background: score >= r.threshold ? '#17203a' : '#121722' }}>
              <button
                onClick={() => toggleRank(r.threshold)}
                style={{ display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left', background:'transparent', color:'#e8eaed', border:'none', padding:'10px 12px', cursor:'pointer' }}
              >
                <div style={{ fontSize:18 }}>{r.icon}</div>
                <div style={{ fontWeight:600, flex:1 }}>{r.title} ({r.threshold}🦅)</div>
                <div style={{ opacity:0.9 }}>{opened ? '▲' : '▼'}</div>
              </button>
              {opened && r.perks && r.perks.length ? (
                <div style={{ padding:'0 12px 10px 38px' }}>
                  <ul style={{ margin:0 }}>
                    {r.perks.map((p, i) => (<li key={i} style={{ fontSize:13, opacity:0.95, lineHeight:1.6 }}>{p}</li>))}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </OverlayModal>
  );
}
