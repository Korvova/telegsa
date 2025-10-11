// webapp/src/components/SettingsAPI.tsx
import { useEffect, useState } from 'react';
import OverlayModal from './OverlayModal';
import { getAPITokenInfo, regenerateAPIToken, type APITokenInfo } from '../api';

export default function SettingsAPI({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<APITokenInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const info = await getAPITokenInfo(chatId);
        if (alive) setTokenInfo(info);
      } catch (e) {
        console.error('Failed to load API token:', e);
        if (alive) setTokenInfo(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [chatId, open]);

  const handleCopy = () => {
    if (!tokenInfo?.apiToken) return;
    navigator.clipboard.writeText(tokenInfo.apiToken);
    alert('Токен скопирован в буфер обмена');
  };

  const handleRegenerate = async () => {
    if (regenerating) return;
    if (!confirm('Регенерировать токен? Старый токен перестанет работать.')) return;

    setRegenerating(true);
    try {
      const newInfo = await regenerateAPIToken(chatId);
      setTokenInfo(newInfo);
      alert('Новый токен создан');
    } catch (e: any) {
      console.error('Failed to regenerate token:', e);
      alert(`Ошибка: ${e?.message || 'Unknown error'}`);
    } finally {
      setRegenerating(false);
    }
  };

  const API_BASE = (import.meta as any).env.VITE_API_BASE || '';

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
        <span style={{ fontSize: 20 }}>⚙️</span>
        <div>
          <div style={{ fontWeight: 700 }}>External API</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Создание задач через API</div>
        </div>
      </div>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: '#f3f4f6',
          color: '#374151',
          border: '1px solid #D1D5DB',
          borderRadius: 10,
          padding: '8px 10px',
          cursor: 'pointer',
        }}
      >
        Открыть…
      </button>

      {open && (
        <OverlayModal open onClose={() => setOpen(false)} maxWidth={700}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <div style={{ fontWeight:800, fontSize:18 }}>External API v1</div>
            <div style={{ marginLeft:'auto' }} />
            <button onClick={() => setOpen(false)} style={{ background:'transparent', border:'none', color:'#9fb1ff', cursor:'pointer', fontSize:18 }}>✖</button>
          </div>

          {loading ? (
            <div style={{ padding:20, textAlign:'center', opacity:0.6 }}>Загрузка...</div>
          ) : !tokenInfo ? (
            <div style={{ padding:20, textAlign:'center', color:'#ef4444' }}>Не удалось загрузить токен</div>
          ) : (
            <>
              {/* API Token Section */}
              <div style={{ marginBottom:24 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:8 }}>Ваш API токен:</div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input
                    type="text"
                    readOnly
                    value={tokenInfo.apiToken}
                    style={{
                      flex:1,
                      padding:'8px 12px',
                      background:'#17203a',
                      border:'1px solid #2a3346',
                      borderRadius:8,
                      color:'#e8eaed',
                      fontSize:13,
                      fontFamily:'monospace',
                    }}
                  />
                  <button
                    onClick={handleCopy}
                    style={{
                      background:'#667eea',
                      color:'#fff',
                      border:'none',
                      borderRadius:8,
                      padding:'8px 12px',
                      fontSize:13,
                      fontWeight:600,
                      cursor:'pointer',
                    }}
                  >
                    Копировать
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    style={{
                      background: regenerating ? '#4b5563' : '#ef4444',
                      color:'#fff',
                      border:'none',
                      borderRadius:8,
                      padding:'8px 12px',
                      fontSize:13,
                      fontWeight:600,
                      cursor: regenerating ? 'not-allowed' : 'pointer',
                      opacity: regenerating ? 0.6 : 1,
                    }}
                  >
                    {regenerating ? 'Обновление...' : 'Обновить'}
                  </button>
                </div>
                <div style={{ fontSize:12, opacity:0.6, marginTop:6 }}>
                  Создан: {new Date(tokenInfo.createdAt).toLocaleString('ru-RU')}
                </div>
              </div>

              {/* API Documentation */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:8 }}>Документация API:</div>
                <div style={{ fontSize:13, opacity:0.8, marginBottom:12 }}>
                  Все запросы выполняются методом GET с токеном в параметре <code style={{background:'#17203a',padding:'2px 6px',borderRadius:4}}>?token=XXX</code>
                </div>
              </div>

              {/* Endpoints */}
              <div style={{ display:'grid', gap:12, maxHeight:'50vh', overflowY:'auto' }}>

                {/* GET GROUPS */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#fbbf24' }}>
                    Получить список групп (где вы владелец)
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6, marginBottom:6, overflowX:'auto' }}>
                    GET {API_BASE}/api/v1/groups?token=XXX
                  </div>
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    <b>Ответ:</b> <code>{`{ "groups": [{ "groupId": "...", "title": "...", "isTelegramGroup": true, "createdAt": "..." }] }`}</code>
                  </div>
                </div>

                {/* GET GROUP MEMBERS */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#fbbf24' }}>
                    Получить список участников группы
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6, marginBottom:6, overflowX:'auto' }}>
                    GET {API_BASE}/api/v1/groups/GROUP_ID/members?token=XXX
                  </div>
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    <b>Ответ:</b> <code>{`{ "groupId": "...", "members": [{ "chatId": "...", "firstName": "...", "role": "owner/member" }] }`}</code>
                  </div>
                </div>

                {/* GET GROUP LABELS */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#fbbf24' }}>
                    Получить список ярлыков группы
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6, marginBottom:6, overflowX:'auto' }}>
                    GET {API_BASE}/api/v1/groups/GROUP_ID/labels?token=XXX
                  </div>
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    <b>Ответ:</b> <code>{`{ "groupId": "...", "labels": [{ "labelId": "...", "title": "...", "color": "#..." }] }`}</code>
                  </div>
                </div>

                <div style={{ borderTop:'2px solid #2a3346', margin:'8px 0' }} />

                {/* 1. Create task (owner as assignee) */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#a5b4fc' }}>
                    1. Создать задачу (создатель и исполнитель = владелец токена)
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6, marginBottom:6, overflowX:'auto' }}>
                    GET {API_BASE}/api/v1/tasks/create?token=XXX&groupId=GROUP_ID&text=Текст задачи
                  </div>
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    <b>Параметры:</b> <code>token</code>, <code>groupId</code>, <code>text</code>
                  </div>
                </div>

                {/* 2. Create task with assignee */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#a5b4fc' }}>
                    2. Создать задачу с назначением на другого участника
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6, marginBottom:6, overflowX:'auto' }}>
                    GET {API_BASE}/api/v1/tasks/create?token=XXX&groupId=GROUP_ID&text=Текст&assigneeChatId=CHAT_ID
                  </div>
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    <b>Параметры:</b> <code>assigneeChatId</code> — chatId исполнителя
                  </div>
                </div>

                {/* 3. Create task with label */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#a5b4fc' }}>
                    3. Создать задачу с ярлыком
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6, marginBottom:6, overflowX:'auto' }}>
                    GET {API_BASE}/api/v1/tasks/create?token=XXX&groupId=GROUP_ID&text=Текст&labelId=LABEL_ID
                  </div>
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    <b>Параметры:</b> <code>labelId</code> — ID существующего ярлыка
                  </div>
                </div>

                {/* 4. Create task with watchers */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#a5b4fc' }}>
                    4. Создать задачу с наблюдателями
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6, marginBottom:6, overflowX:'auto' }}>
                    GET {API_BASE}/api/v1/tasks/create?token=XXX&groupId=GROUP_ID&text=Текст&watchers=CHAT_ID1,CHAT_ID2
                  </div>
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    <b>Параметры:</b> <code>watchers</code> — chatId через запятую
                  </div>
                </div>

                {/* 5. Create task with deadline */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#a5b4fc' }}>
                    5. Создать задачу с дедлайном
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6, marginBottom:6, overflowX:'auto' }}>
                    GET {API_BASE}/api/v1/tasks/create?token=XXX&groupId=GROUP_ID&text=Текст&deadline=2025-10-08T15:00:00Z
                  </div>
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    <b>Параметры:</b> <code>deadline</code> — ISO дата (2025-10-08T15:00:00Z)
                  </div>
                </div>

                {/* 6. Create task with accept condition */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#a5b4fc' }}>
                    6. Создать задачу с условием приёмки
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6, marginBottom:6, overflowX:'auto' }}>
                    GET {API_BASE}/api/v1/tasks/create?token=XXX&groupId=GROUP_ID&text=Текст&acceptCondition=PHOTO
                  </div>
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    <b>Параметры:</b> <code>acceptCondition</code> — NONE, PHOTO, APPROVAL, PHOTO_AND_APPROVAL, DOC_AND_APPROVAL
                  </div>
                </div>

                {/* 7. Create task with complexity */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#a5b4fc' }}>
                    7. Создать задачу со сложностью
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6, marginBottom:6, overflowX:'auto' }}>
                    GET {API_BASE}/api/v1/tasks/create?token=XXX&groupId=GROUP_ID&text=Текст&complexity=5
                  </div>
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    <b>Параметры:</b> <code>complexity</code> — число от 1 до 10
                  </div>
                </div>

                {/* 8. Create task with reminder */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#a5b4fc' }}>
                    8. Создать задачу с напоминанием
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6, marginBottom:6, overflowX:'auto' }}>
                    GET {API_BASE}/api/v1/tasks/create?token=XXX&groupId=GROUP_ID&text=Текст&reminderAt=2025-10-10T09:00:00Z&reminderTarget=RESPONSIBLE
                  </div>
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    <b>Параметры:</b> <code>reminderAt</code> — ISO дата/время, <code>reminderTarget</code> — ME | RESPONSIBLE | ALL
                  </div>
                </div>

                {/* Response format */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#10b981' }}>
                    Формат успешного ответа:
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6 }}>
                    {`{
  "taskId": "task_id_here",
  "text": "Текст задачи",
  "groupId": "group_id",
  "columnId": "column_id",
  "createdAt": "2025-10-09T..."
}`}
                  </div>
                </div>

                {/* Error format */}
                <div style={{ background:'#17203a', border:'1px solid #2a3346', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'#ef4444' }}>
                    Формат ошибки:
                  </div>
                  <div style={{ fontSize:12, fontFamily:'monospace', background:'#0d1117', padding:8, borderRadius:6 }}>
                    {`{
  "error": "bad_request",
  "message": "groupId is required"
}`}
                  </div>
                </div>

              </div>
            </>
          )}
        </OverlayModal>
      )}
    </div>
  );
}
