import { useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { createWatcherInvite, listWatchers, unsubscribe } from '../api/watchers';

type Mode = 'panel' | 'listOnly';

export default function WatchersBlock({
  taskId,
  meChatId,
  mode = 'panel',
  onCountChange,
  onMeWatchingChange,
}: {
  taskId: string;
  meChatId: string;
  mode?: Mode;
  onCountChange?: (n: number) => void;
  onMeWatchingChange?: (watching: boolean) => void;
}) {
  const [items, setItems] = useState<{ chatId: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const meWatching = useMemo(() => items.some(w => String(w.chatId) === String(meChatId)), [items, meChatId]);

  const load = async () => {
    try {
      const r = await listWatchers(taskId);
      if (r.ok) setItems(r.watchers || []);
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [taskId]);

  useEffect(() => {
    try { onCountChange?.(items.length); } catch {}
    try { onMeWatchingChange?.(meWatching); } catch {}
  }, [items, meWatching, onCountChange, onMeWatchingChange]);

  const addWatcher = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await createWatcherInvite(taskId);
      if (!r?.ok || !r?.tmeStartApp) throw new Error('invite_failed');
      const link = r.tmeStartApp;
      const text = `Подпишись наблюдателем на задачу.\n${link}`;
      const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
      if (WebApp?.openTelegramLink) WebApp.openTelegramLink(url); else window.open?.(url, '_blank');
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch {
      try { await navigator.clipboard.writeText(`Подпишись наблюдателем на задачу: ${location.href}`); } catch {}
    } finally { setBusy(false); }
  };

  const removeWatcher = async (chatId: string) => {
    if (!confirm('Убрать наблюдателя?')) return;
    try {
      await unsubscribe(taskId, chatId, meChatId);
      setItems(prev => prev.filter(w => String(w.chatId) !== String(chatId)));
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/403/.test(msg) || /no_rights/.test(msg)) alert('У вас нет прав на это действие');
      else alert('Не удалось убрать наблюдателя');
    }
  };

  const Body = () => (
    <>
      {/* Кнопка сверху списка */}
      <div style={{ display:'flex', marginBottom:8 }}>
        <button disabled={busy} onClick={addWatcher} style={btn}>Добавить наблюдателя</button>
      </div>
      {items.length ? (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {items.map(w => (
            <span key={w.chatId} style={chip}>
              👁️ {w.name}
              <button onClick={() => removeWatcher(w.chatId)} style={chipX} title="Убрать">×</button>
            </span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, opacity: .7 }}>Пока нет наблюдателей.</div>
      )}
    </>
  );

  if (mode === 'listOnly') {
    return (
      <div style={{...wrap, paddingTop: 8}}>
        <Body />
      </div>
    );
  }

  // Запасной режим «панель» (почти как было)
  return (
    <div style={wrap}>
      <div style={title}>Наблюдатели</div>
      <Body />
    </div>
  );
}

const wrap: React.CSSProperties = {
  marginTop: 16,
  background: '#1b2030',
  border: '1px solid #2a3346',
  borderRadius: 16,
  padding: 12,
};
const title: React.CSSProperties = { fontSize: 16, fontWeight: 700, marginBottom: 8 };
const btn: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1px solid #2a3346', background:'#202840', color:'#e8eaed', cursor:'pointer' };
const chip: React.CSSProperties = { display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:999, border:'1px solid #2a3346', background:'#121722', color:'#e8eaed' };
const chipX: React.CSSProperties = { marginLeft: 6, padding:'0 6px', border:'1px solid #2a3346', borderRadius: 999, background:'#3a1f1f', color:'#ffd7d7', cursor:'pointer' };
