// webapp/src/pages/Home/HomePage.tsx
import { useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { listMyFeed, type TaskFeedItem } from '../../api';

type Role = 'all' | 'creator' | 'assignee' | 'watcher';
const STATUS_LABELS = ['Новые','В работе','Готово','Согласование','Ждёт'];

export default function HomePage({
  chatId,
  onOpenTask,
}: { chatId: string; onOpenTask: (id: string) => void }) {
  const [role, setRole] = useState<Role>('all');
  const [statuses, setStatuses] = useState<Record<string, boolean>>(
    Object.fromEntries(STATUS_LABELS.map(s => [s, true]))
  );
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'updated_desc' | 'updated_asc'>('updated_desc');

  const [items, setItems] = useState<TaskFeedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const selectedStatuses = useMemo(
    () => Object.entries(statuses).filter(([,v]) => v).map(([k]) => k),
    [statuses]
  );

  // первая загрузка и перезагрузка по фильтрам
  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const r = await listMyFeed({
          chatId,
          role,
          statuses: selectedStatuses,
          q,
          sort,
          offset: 0,
          limit: 30,
        });
        if (!alive) return;
        if (r.ok) {
          setItems(r.items);
          setOffset(r.nextOffset);
          setHasMore(r.hasMore);
        }
      } finally { setLoading(false); }
    };
    load();
    return () => { alive = false; };
  }, [chatId, role, selectedStatuses.join('|'), q, sort]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const r = await listMyFeed({
        chatId, role, statuses: selectedStatuses, q, sort, offset, limit: 30,
      });
      if (r.ok) {
        setItems(prev => [...prev, ...r.items]);
        setOffset(r.nextOffset);
        setHasMore(r.hasMore);
      }
    } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: 12, paddingBottom: 96 }}>
      {/* ── Фиксированная шапка: поиск + кнопка фильтров ── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: '#0f1216',
          paddingBottom: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setFiltersOpen(v => !v)}
            title="Фильтры"
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: '1px solid #2a3346',
              background: filtersOpen ? '#30416d' : '#1b2030',
              color: '#e5e7eb',
              cursor: 'pointer',
              minWidth: 40,
            }}
          >
            ☰
          </button>

          <input
            placeholder="Поиск по задачам и комментариям…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              flex: 1,
              background:'#0b1220',
              color:'#e5e7eb',
              border:'1px solid #2a3346',
              borderRadius: 10,
              padding:'8px 10px'
            }}
          />
        </div>

        {/* Плашка фильтров */}
        {filtersOpen && (
          <div
            style={{
              marginTop: 8,
              background: '#121722',
              border: '1px solid #2a3346',
              borderRadius: 12,
              padding: 10,
            }}
          >
            {/* Роли */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {[
                {key:'all', label:'Все'},
                {key:'creator', label:'Поручил'},
                {key:'assignee', label:'Делаю'},
                {key:'watcher', label:'Наблюдаю'},
              ].map(it => (
                <button
                  key={it.key}
                  onClick={() => setRole(it.key as Role)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 10,
                    border: '1px solid #2a3346',
                    background: role === it.key ? '#30416d' : '#1b2030',
                    color: '#e5e7eb',
                    cursor: 'pointer'
                  }}
                >
                  {it.label}
                </button>
              ))}

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                style={{
                  marginLeft: 'auto',
                  background:'#0b1220',
                  color:'#e5e7eb',
                  border:'1px solid #2a3346',
                  borderRadius: 10,
                  padding:'6px 8px'
                }}
              >
                <option value="updated_desc">по дате изменения ↓</option>
                <option value="updated_asc">по дате изменения ↑</option>
              </select>
            </div>

            {/* Статусы */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {STATUS_LABELS.map(s => (
                <label
                  key={s}
                  style={{
                    display:'flex',
                    gap:6,
                    alignItems:'center',
                    background:'#0b1220',
                    border:'1px solid #2a3346',
                    borderRadius: 8,
                    padding:'4px 8px'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!statuses[s]}
                    onChange={(e) => setStatuses(prev => ({ ...prev, [s]: e.target.checked }))}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', marginTop: 10, gap: 8 }}>
              <button
                onClick={() => setFiltersOpen(false)}
                style={{
                  padding:'6px 10px',
                  borderRadius:10,
                  border:'1px solid #2a3346',
                  background:'#1b2030',
                  color:'#e5e7eb',
                  cursor:'pointer'
                }}
              >
                Готово
              </button>
            </div>
          </div>
        )}
      </div>

{/* Список */}
<div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
  {items.map((t) => {
    // статус из /tasks/feed (если у тебя тип TaskFeedItem без status — оставь (t as any).status)
    const status = (t as any).status ?? '';
    const s = String(status).trim().toLowerCase();
    const done = s.startsWith('готов') || s.startsWith('done');

    const cardBg   = done ? '#E8F5E9' : '#FFFFFF';  // светло-зелёный для «Готово»
    const cardBrd  = done ? '#C8E6C9' : '#e5e7eb';
    const textCol  = '#0f1216';
    const groupChipBg = done ? '#2e7d32' : '#3b4b7a';  // тёмно-зелёный чип у «Готово»

    return (
      <button
        key={t.id}
        onClick={() => {
          onOpenTask(t.id);
          try { WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch {}
        }}
        style={{
          textAlign:'left',
          background: cardBg,
          color: textCol,
          border:`1px solid ${cardBrd}`,
          borderRadius: 16,
          padding: 12,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,.06)',
        }}
      >
        <div style={{ fontSize:12, opacity:.6, marginBottom:4 }}>#{t.id.slice(0,6)}</div>

        {/* Заголовок + бейдж статуса справа (показываем только для «Готово») */}
        <div style={{ display:'flex', alignItems:'start', gap:8, marginBottom:8 }}>
          <div style={{ fontSize:16, whiteSpace:'pre-wrap', wordBreak:'break-word', flex:1 }}>
            {t.text}
          </div>
          {done && (
            <span
              title={status || 'Готово'}
              style={{
                background:'#D1F2DC',
                color:'#0f5132',
                border:'1px solid #A3DFB9',
                padding:'2px 8px',
                borderRadius: 999,
                fontSize:12,
                whiteSpace:'nowrap'
              }}
            >
              ✓ Готово
            </span>
          )}
        </div>

        {/* плашка с названием группы */}
        <div
          style={{
            display:'inline-block',
            background: groupChipBg,
            color:'#fff',
            padding:'3px 8px',
            borderRadius:8,
            fontSize:12,
            marginBottom:6
          }}
        >
          {t.groupTitle}
        </div>

        <div style={{ fontSize:12, opacity:.8, display:'flex', gap:10 }}>
          <span>👤 {t.creatorName}</span>
          {t.assigneeName ? <span>→ {t.assigneeName}</span> : null}
          <span style={{ marginLeft:'auto' }}>{new Date(t.updatedAt).toLocaleString()}</span>
        </div>
      </button>
    );
  })}
</div>


      {/* Показать ещё */}
      <div style={{ display:'flex', justifyContent:'center', marginTop: 12 }}>
        {hasMore ? (
          <button
            onClick={loadMore}
            disabled={loading}
            style={{ padding:'10px 16px', borderRadius: 12, border:'1px solid #2a3346', background:'#202840', color:'#e5e7eb', minWidth:160 }}
          >
            {loading ? 'Загружаю…' : 'Показать ещё'}
          </button>
        ) : (
          <div style={{ fontSize:12, opacity:.6 }}>Больше задач нет</div>
        )}
      </div>
    </div>
  );
}
