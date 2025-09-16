import { useEffect, useState } from 'react';

const API = (import.meta as any).env.VITE_API_BASE || '';

// Simple in-memory cache by chatId -> icon
const cache = new Map<string, string | null>();

function iconFromCode(code?: string | null): string | null {
  const c = String(code || '').toUpperCase();
  switch (c) {
    case 'ANT': return '🐜';
    case 'FISH': return '🐟';
    case 'SCORPION': return '🦂';
    case 'SQUIRREL': return '🐿️';
    case 'CAT': return '🐱';
    case 'DOG': return '🐶';
    case 'WOLF': return '🐺';
    case 'BEAR': return '🐻';
    case 'EAGLE': return '🦅';
    case 'HORSE': return '🐎';
    case 'DRAGON': return '🐉';
    case 'SHARK': return '🦈';
    case 'ELEPHANT': return '🐘';
    case 'TREX': return '🦖';
    case 'TIGER': return '🐯';
    case 'LION': return '🦁';
    default: return null;
  }
}

export function useMyRankIcon(chatId?: string | null): string | null {
  const cid = String(chatId || '').trim();
  const [icon, setIcon] = useState<string | null>(() => (cid ? cache.get(cid) ?? null : null));

  useEffect(() => {
    let alive = true;
    if (!cid) { setIcon(null); return; }
    const cached = cache.get(cid);
    if (typeof cached !== 'undefined') { setIcon(cached); return; }

    (async () => {
      try {
        const r = await fetch(`${API}/me/rank?chatId=${encodeURIComponent(cid)}`);
        if (!r.ok) { if (alive) { cache.set(cid, null); setIcon(null); } return; }
        const j = await r.json().catch(() => ({}));
        const ic = iconFromCode(j?.rank);
        cache.set(cid, ic);
        if (alive) setIcon(ic);
      } catch {
        cache.set(cid, null);
        if (alive) setIcon(null);
      }
    })();
    return () => { alive = false; };
  }, [cid]);

  return icon || null;
}

export function prefixWithMyIcon(name: string, myIcon?: string | null): string {
  const ic = (myIcon || '').trim();
  return ic ? `${ic} ${name}` : name;
}

