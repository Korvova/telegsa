// FormsSettingsPage.tsx
import { useEffect, useState } from 'react';
import { API_BASE } from '../api';

type Form = {
  id: string;
  title: string;
  description: string;
  fields: any[];
  successType: 'PAGE' | 'REDIRECT';
  successContent?: string | null;
  redirectUrl?: string | null;
  groupId?: string | null;
  assigneeChatId?: string | null;
  labelId?: string | null;
  status: string;
  observerChatId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    submissions: number;
  };
};

export default function FormsSettingsPage({
  chatId,
  onBack,
  onEdit,
}: {
  chatId: string;
  onBack: () => void;
  onEdit: (formId: string | null) => void;
}) {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadForms();
  }, [chatId]);

  async function loadForms() {
    try {
      setLoading(true);
      const r = await fetch(`${API_BASE}/forms?chatId=${encodeURIComponent(chatId)}`);
      const data = await r.json();
      if (data.ok) {
        setForms(data.forms || []);
      }
    } catch (e) {
      console.error('[FORMS] load error', e);
    } finally {
      setLoading(false);
    }
  }

  async function deleteForm(id: string) {
    if (!confirm('Удалить форму? Восстановление невозможно.')) return;
    try {
      const r = await fetch(`${API_BASE}/forms/${id}?chatId=${encodeURIComponent(chatId)}`, {
        method: 'DELETE',
      });
      const data = await r.json();
      if (data.ok) {
        await loadForms();
      }
    } catch (e) {
      console.error('[FORMS] delete error', e);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: '1px solid #2a3346',
            color: '#e8eaed',
            borderRadius: 10,
            padding: '6px 8px',
            cursor: 'pointer',
          }}
        >
          ⟵ Назад
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>📩 Формы</h2>
      </div>

      {/* Add button */}
      <button
        onClick={() => onEdit(null)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          padding: '10px 14px',
          cursor: 'pointer',
          marginBottom: 16,
          fontWeight: 600,
        }}
      >
        <span style={{ fontSize: 16 }}>+</span>
        <span>Добавить форму</span>
      </button>

      {/* Forms list */}
      {loading ? (
        <div style={{ padding: 16, opacity: 0.7 }}>Загрузка...</div>
      ) : forms.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            opacity: 0.6,
            border: '1px dashed #2a3346',
            borderRadius: 12,
          }}
        >
          У вас пока нет форм. Создайте первую!
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {forms.map((form) => (
            <div
              key={form.id}
              style={{
                background: '#1b2030',
                border: '1px solid #2a3346',
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{form.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                    Создана:{' '}
                    {new Date(form.createdAt).toLocaleDateString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    Заявок: {form._count?.submissions || 0}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => onEdit(form.id)}
                    title="Редактировать"
                    style={{
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => deleteForm(form.id)}
                    title="Удалить"
                    style={{
                      background: '#dc2626',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
