import { type Group, createGroup as createGroupApi, renameGroupTitle, deleteGroup as deleteGroupApi } from '../../api';

type Props = {
  chatId: string;
  groups: Group[];
  onReload: () => void;
  onOpen: (id: string) => void;
};

export default function GroupList({ chatId, groups, onReload, onOpen }: Props) {
  const create = async () => {
    const title = prompt('Название группы?')?.trim();
    if (!title) return;
    try {
      const r = await createGroupApi(chatId, title);
      if (r.ok) await onReload();
    } catch {
      alert('Не удалось создать группу (возможно, имя занято)');
    }
  };

  const rename = async (g: Group) => {
    const title = prompt('Новое название группы?', g.title)?.trim();
    if (!title || title === g.title) return;
    try {
      await renameGroupTitle(g.id, chatId, title);
      await onReload();
    } catch {
      alert('Имя занято или ошибка');
    }
  };

  const remove = async (g: Group) => {
    if (!confirm(`Удалить группу «${g.title}»?`)) return;
    try {
      await deleteGroupApi(g.id, chatId);
      await onReload();
    } catch {
      alert('Не удалось удалить');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {groups.map((g) => {
        const own = g.kind === 'own';
        return (
          <div
            key={g.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              border: '1px solid #2a3346',
              borderRadius: 12,
              background: '#1b2030',
            }}
          >
            <button
              onClick={() => onOpen(g.id)}
              style={{
                flex: 1,
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                color: '#e8eaed',
                cursor: 'pointer',
                fontSize: 15,
              }}
              title="Открыть группу"
            >
              {g.title}{g.kind === 'member' ? ' · участвую' : ''}
            </button>

            {own && (
              <>
                <button
                  onClick={() => rename(g)}
                  title="Переименовать"
                  style={{ background: 'transparent', border: 'none', color: '#8aa0ff', cursor: 'pointer' }}
                >
                  ✎
                </button>
                <button
                  onClick={() => remove(g)}
                  title="Удалить"
                  style={{ background: 'transparent', border: 'none', color: '#ff9a9a', cursor: 'pointer' }}
                >
                  🗑
                </button>
              </>
            )}
          </div>
        );
      })}

      <button
        onClick={create}
        style={{
          padding: '10px 12px',
          borderRadius: 12,
          border: '1px solid #2a3346',
          background: '#203428',
          color: '#d7ffd7',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        + Создать группу
      </button>
    </div>
  );
}
