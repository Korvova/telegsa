// webapp/src/components/AchievementsRulesModal.tsx
import OverlayModal from './OverlayModal';

export default function AchievementsRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <OverlayModal open={open} onClose={onClose} maxWidth={560}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Правила очивок и рейтинга</div>
        <div style={{ marginLeft:'auto' }} />
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#9fb1ff', cursor:'pointer', fontSize:18 }}>✖</button>
      </div>

      {/* Обозначения */}
      <div style={{
        border:'1px solid #2a3346', borderRadius:12, padding:'10px 12px', background:'#12182a', marginBottom:12
      }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Обозначения</div>
        <div style={{ display:'grid', gap:6, fontSize:14, lineHeight:1.5 }}>
          <div>🌰 — поставленные задачи пользователем (вы — постановщик)</div>
          <div>🌱 — выполненные собственные задачи, где вы постановщик и исполнитель</div>
          <div>
            🦅 — выполненные задачи другим исполнителем, где вы — постановщик.
            <span style={{ opacity:.9 }}> Прогресс: 🥚 (1–9), 🐣 (10–19), 🐥 (20–39), 🦅 (40–99), 🐦‍🔥 (100+)</span>
          </div>
          <div>⚫ — нагрузка: активные задачи, назначенные на вас другими пользователями</div>
          <div>🚀 — выполненные вами задачи, где постановщик другой пользователь</div>
          <div>💣 — текущие просрочки (активные задачи на вас с истекшим дедлайном)</div>
        </div>
      </div>

      <div style={{ display:'grid', gap:10, fontSize:14 }}>
        <div>
          1) 100 🌱 дают 1 🦅. Остаток сохраняется.
          <div style={{ opacity:.9, marginTop:4 }}>Пример: 230🌱 → 30🌱 и 2🦅</div>
        </div>
        <div>
          2) Если ⚫ &gt; 100, появляется 🔴 = ⚫/100.
          <div style={{ opacity:.9, marginTop:4 }}>Пример: 320⚫ → 3.2🔴</div>
        </div>
        <div>
          3) Целая часть 🔴 вычитается из 🦅.
          <div style={{ opacity:.9, marginTop:4 }}>Примеры: 5🦅 и 2.3🔴 → 3🦅; если стало 1.4🔴 → 4🦅</div>
        </div>
        <div>
          4) Просрочки 💣 уменьшают 🦅 и 🚀.
          <div style={{ opacity:.9, marginTop:4 }}>Пример: 5💣 при 8🦅 и 7🚀 → 3🦅 и 2🚀</div>
          <div style={{ opacity:.8, marginTop:4 }}>Если просроченная задача удалена/отменена/перешла в Done — не считается просрочкой.</div>
        </div>
        <div>
          5) Если 🦅 ≥ 100 — отображается 🐦‍🔥.
          <div style={{ opacity:.9, marginTop:4 }}>Пример: 2400🦅 → 24🐦‍🔥</div>
        </div>
      </div>
    </OverlayModal>
  );
}
