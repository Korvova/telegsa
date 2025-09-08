import { useEffect, useMemo, useState } from 'react';
import {
  type GroupLabel,
  getGroupLabels,
  getTaskLabels,
  attachTaskLabels,
  removeTaskLabel,
  createGroupLabel,
  updateGroupLabel,
  deleteGroupLabel,
} from '../api';

type Props = {
  open: boolean;
  onClose: () => void;
  taskId: string;
  groupId: string | null;            // ярлыки только для групп
  chatId: string | number;           // кто действует
  // показываем текущий выбор в карточке без доп. запроса
  onSelectionChange?: (labels: GroupLabel[]) => void;
};

export default function TaskLabelDrawer({
  open, onClose, taskId, groupId, chatId, onSelectionChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState<GroupLabel[]>([]);
  const [selected, setSelected] = useState<GroupLabel[]>([]); // текущие ярлыки на задаче (серв)
  const [error, setError] = useState<string | null>(null);

  // редактирование
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // создание
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const singleSelectedId = useMemo(
    () => (selected[0]?.id ?? null),
    [selected]
  );

  const canUse = Boolean(groupId);

  // загрузка при открытии
  useEffect(() => {
    if (!open) return;
    setError(null);

    if (!groupId) {
      setLabels([]);
      setSelected([]);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const [ls, cur] = await Promise.all([
          getGroupLabels(groupId),
          getTaskLabels(taskId),
        ]);
        setLabels(ls);
        setSelected(cur);
      } catch (e: any) {
        setError(e?.message || 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, groupId, taskId]);

const applySelect = async (labelId: string | null) => {
  try {
    await Promise.all(selected.map((s) => removeTaskLabel(taskId, s.id, chatId)));

    if (labelId) {
      const next = await attachTaskLabels(taskId, chatId, [labelId]);
      setSelected(next);
      onSelectionChange?.(next);
    } else {
      setSelected([]);
      onSelectionChange?.([]);
    }

    // ✅ сразу закрываем шторку после выбора
    onClose();
  } catch (e: any) {
    setError(e?.message || 'Не удалось применить ярлык');
  }
};


  const startEdit = (l: GroupLabel) => {
    setEditingId(l.id);
    setEditingTitle(l.title);
  };

  const saveEdit = async () => {
    if (!groupId || !editingId) return;
    try {
      const updated = await updateGroupLabel(groupId, editingId, { chatId, title: editingTitle });
      setLabels((arr) => arr.map((x) => (x.id === updated.id ? updated : x)));
      // если редактировали выбранный — обновим и его
      setSelected((arr) => arr.map((x) => (x.id === updated.id ? updated : x)));
      onSelectionChange?.(selected.map(s => (s.id === updated.id ? updated : s)));
      setEditingId(null);
    } catch (e: any) {
      setError(e?.message || 'Не удалось переименовать');
    }
  };

  const removeLabel = async (labelId: string) => {
    if (!groupId) return;
    if (!confirm('Удалить ярлык? Действие необратимо.')) return;
    try {
      await deleteGroupLabel(groupId, labelId, chatId as any);
      setLabels((arr) => arr.filter((x) => x.id !== labelId));
      // если ярлык стоял на задаче — снимаем
      if (selected.some((s) => s.id === labelId)) {
        await applySelect(null);
      }
      if (editingId === labelId) setEditingId(null);
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить');
    }
  };

  const createLabel = async () => {
    if (!groupId) return;
    const title = newTitle.trim();
    if (!title) return;
    try {
      const created = await createGroupLabel(groupId, { chatId, title });
      setLabels((arr) => [...arr, created].sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title)));
      setCreating(false);
      setNewTitle('');
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать');
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'rgba(0,0,0,0.45)',
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0,
          width: 'min(380px, 92vw)',
          background: '#1b2030',
          color: '#e8eaed',
          borderLeft: '1px solid #2a3346',
          boxShadow: '-8px 0 22px rgba(0,0,0,.35)',
          padding: 14,
          transform: 'translateX(0)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Ярлык задачи</div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer', fontSize: 18 }}
          >
            ✕
          </button>
        </div>

        {!canUse ? (
          <div style={{ opacity: .75, fontSize: 14 }}>
            Ярлыки доступны только для задач в проектах (группах).
          </div>
        ) : loading ? (
          <div style={{ opacity: .75, fontSize: 14 }}>Загрузка…</div>
        ) : (
          <>
            {error && <div style={{ color: '#ffb4b4', marginBottom: 8 }}>{error}</div>}

            {/* «без ярлыка» */}
            <label
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', border: '1px solid #2a3346', borderRadius: 10,
                marginBottom: 8, cursor: 'pointer', background: !singleSelectedId ? '#12202a' : 'transparent'
              }}
              onClick={() => applySelect(null)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                ⛔ Без ярлыка
              </span>
              {!singleSelectedId && <span>✓</span>}
            </label>

            {/* список ярлыков */}
            <div style={{ display: 'grid', gap: 8, marginBottom: 10, maxHeight: '60vh', overflow: 'auto' }}>
              {labels.map((l) => (
                <div key={l.id} style={{ border: '1px solid #2a3346', borderRadius: 10, padding: 8 }}>
                  {editingId === l.id ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        placeholder="Название ярлыка"
                        style={{
                          width: '100%',
                          borderRadius: 8,
                          border: '1px solid #2a3346',
                          background: '#121722',
                          color: '#e8eaed',
                          padding: '8px 10px',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={saveEdit}
                          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                        >
                          Применить
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #2a3346', background: 'transparent', color: '#e8eaed' }}
                        >
                          Отмена
                        </button>
                        <button
                          onClick={() => removeLabel(l.id)}
                          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #4a2a2a', background: '#3a2222', color: '#ffd4d4', marginLeft: 'auto' }}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <button
                        onClick={() => applySelect(l.id)}
                        style={{
                          flex: 1,
                          background: 'transparent',
                          border: 'none',
                          color: '#e8eaed',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                        title="Назначить этот ярлык задаче"
                      >
                        <span>🏷️ {l.title}</span>
                      </button>
                      <span style={{ opacity: .75, marginRight: 6 }}>
                        {singleSelectedId === l.id ? '✓' : ''}
                      </span>
                      <button
                        onClick={() => startEdit(l)}
                        title="Переименовать"
                        style={{ border: 'none', background: 'transparent', color: '#8aa0ff', cursor: 'pointer' }}
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* добавление */}
            {creating ? (
              <div style={{ border: '1px solid #2a3346', borderRadius: 10, padding: 8 }}>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Название нового ярлыка"
                  style={{
                    width: '100%',
                    borderRadius: 8,
                    border: '1px solid #2a3346',
                    background: '#121722',
                    color: '#e8eaed',
                    padding: '8px 10px',
                    marginBottom: 8,
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={createLabel}
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }}
                  >
                    Создать
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewTitle(''); }}
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #2a3346', background: 'transparent', color: '#e8eaed' }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px dashed #2a3346',
                  background: 'transparent',
                  color: '#8aa0ff',
                  cursor: 'pointer',
                }}
              >
                + Создать ярлык
              </button>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
