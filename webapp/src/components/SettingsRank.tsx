// webapp/src/components/SettingsRank.tsx
import { useEffect, useMemo, useState } from 'react';
import OverlayModal from './OverlayModal';

type RankCode =
  | 'ANT' | 'FISH' | 'SCORPION' | 'SQUIRREL' | 'CAT' | 'DOG' | 'WOLF' | 'BEAR'
  | 'EAGLE' | 'HORSE' | 'DRAGON' | 'SHARK' | 'ELEPHANT' | 'TREX' | 'TIGER' | 'LION';

const RANKS: { code: RankCode; icon: string; title: string }[] = [
  { code: 'ANT',      icon: '🐜', title: 'Муравей' },
  { code: 'FISH',     icon: '🐟', title: 'Рыба' },
  { code: 'SCORPION', icon: '🦂', title: 'Скорпион' },
  { code: 'SQUIRREL', icon: '🐿️', title: 'Белка' },
  { code: 'CAT',      icon: '🐱', title: 'Кот' },
  { code: 'DOG',      icon: '🐶', title: 'Собака' },
  { code: 'WOLF',     icon: '🐺', title: 'Волк' },
  { code: 'BEAR',     icon: '🐻', title: 'Медведь' },
  { code: 'EAGLE',    icon: '🦅', title: 'Орёл' },
  { code: 'HORSE',    icon: '🐎', title: 'Лошадь' },
  { code: 'DRAGON',   icon: '🐉', title: 'Дракон' },
  { code: 'SHARK',    icon: '🦈', title: 'Акула' },
  { code: 'ELEPHANT', icon: '🐘', title: 'Слон' },
  { code: 'TREX',     icon: '🦖', title: 'Тирекс' },
  { code: 'TIGER',    icon: '🐯', title: 'Тигр' },
  { code: 'LION',     icon: '🦁', title: 'Лев' },
];

function findRank(code?: string | null) {
  const c = String(code || 'ANT').toUpperCase() as RankCode;
  return RANKS.find(r => r.code === c) || RANKS[0];
}

export default function SettingsRank({ chatId }: { chatId: string }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [rank, setRank] = useState<{ code: RankCode; score: number } | null>(null);

  const current = useMemo(() => findRank(rank?.code), [rank]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const API = (import.meta as any).env.VITE_API_BASE || '';
        const r = await fetch(`${API}/me/rank?chatId=${encodeURIComponent(chatId)}`);
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (j && j.ok) setRank({ code: String(j.rank || 'ANT') as RankCode, score: Number(j.score || 0) });
        else setRank({ code: 'ANT', score: 0 });
      } catch {
        if (alive) setRank({ code: 'ANT', score: 0 });
      }
    })();
    return () => { alive = false; };
  }, [chatId]);

  const saveRank = async (code: RankCode) => {
    try {
      setBusy(true);
      const API = (import.meta as any).env.VITE_API_BASE || '';
      await fetch(`${API}/me/rank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, rank: code }),
      });
      setRank((prev) => ({ code, score: prev?.score || 0 }));
      setOpen(false);
    } catch {
      // ignore
    } finally { setBusy(false); }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: 'linear-gradient(180deg, #e5e7eb, #cbd5e1)',
        color: '#374151',
        border: '1px solid #D1D5DB',
        borderRadius: 12,
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>{current.icon}</span>
        <div>
          <div style={{ fontWeight: 700 }}>Ваш ранг: {current.title}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Очки: {rank?.score || 0}</div>
        </div>
      </div>
      <button
        onClick={() => setOpen(true)}
        disabled={busy}
        style={{
          background: '#f3f4f6',
          color: '#374151',
          border: '1px solid #D1D5DB',
          borderRadius: 10,
          padding: '8px 10px',
          cursor: 'pointer',
        }}
      >
        Повысить…
      </button>

      {open && (
        <OverlayModal open onClose={() => setOpen(false)} maxWidth={560}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <div style={{ fontWeight:800, fontSize:16 }}>Выбрать ранг</div>
            <div style={{ marginLeft:'auto' }} />
            <button onClick={() => setOpen(false)} style={{ background:'transparent', border:'none', color:'#9fb1ff', cursor:'pointer', fontSize:18 }}>✖</button>
          </div>
          <div style={{ display:'grid', gap:8, maxHeight:'60vh', overflowY:'auto' }}>
            {RANKS.map((r) => (
              <button
                key={r.code}
                onClick={() => saveRank(r.code)}
                disabled={busy}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  background: (rank?.code === r.code ? '#17203a' : '#121722'),
                  color:'#e8eaed', border:'1px solid #2a3346', borderRadius:10, padding:'10px 12px', cursor:'pointer', textAlign:'left'
                }}
              >
                <span style={{ fontSize:18 }}>{r.icon}</span>
                <div style={{ fontWeight:600 }}>{r.title}</div>
                <div style={{ marginLeft:'auto', opacity:.85, fontSize:12 }}>{r.code}</div>
              </button>
            ))}
          </div>
        </OverlayModal>
      )}
    </div>
  );
}
