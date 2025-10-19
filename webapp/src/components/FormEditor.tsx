// FormEditor.tsx
import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { API_BASE, listGroups, getGroupMembers, getGroupLabels, type Group as APIGroup, type GroupMember, type GroupLabel } from '../api';

type FormField = {
  id: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'checkbox' | 'select';
  required: boolean;
  visible: boolean;
  placeholder?: string;
  options?: string[]; // for select
  order: number;
};

type FormData = {
  id?: string;
  title: string;
  description: string;
  fields: FormField[];
  successType: 'PAGE' | 'REDIRECT';
  successContent?: string;
  redirectUrl?: string;
  groupId?: string;
  assigneeChatId?: string;
  labelId?: string;
  status: string;
  observerChatId?: string;
  allowSubmitterWatch?: boolean;
  backgroundColor?: string;
};

type TabName = 'form' | 'success' | 'link';

// Tiptap toolbar component
function EditorToolbar({ editor }: { editor: any }) {
  if (!editor) return null;

  return (
    <div style={{
      display: 'flex',
      gap: 4,
      padding: '6px 8px',
      borderBottom: '1px solid #2a3346',
      flexWrap: 'wrap',
    }}>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        style={{
          background: editor.isActive('bold') ? '#2563eb' : '#2a3346',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        style={{
          background: editor.isActive('italic') ? '#2563eb' : '#2a3346',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
          fontStyle: 'italic',
        }}
      >
        I
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        style={{
          background: editor.isActive('heading', { level: 2 }) ? '#2563eb' : '#2a3346',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        style={{
          background: editor.isActive('bulletList') ? '#2563eb' : '#2a3346',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        • List
      </button>
      <button
        type="button"
        onClick={() => {
          const url = prompt('Enter URL:');
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }}
        style={{
          background: editor.isActive('link') ? '#2563eb' : '#2a3346',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        Link
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setColor('#ef4444').run()}
        style={{
          background: '#ef4444',
          color: '#fff',
          border: '2px solid ' + (editor.isActive('textStyle', { color: '#ef4444' }) ? '#fff' : '#ef4444'),
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
          width: 28,
          height: 28,
        }}
        title="Красный"
      />
      <button
        type="button"
        onClick={() => editor.chain().focus().setColor('#3b82f6').run()}
        style={{
          background: '#3b82f6',
          color: '#fff',
          border: '2px solid ' + (editor.isActive('textStyle', { color: '#3b82f6' }) ? '#fff' : '#3b82f6'),
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
          width: 28,
          height: 28,
        }}
        title="Синий"
      />
      <button
        type="button"
        onClick={() => editor.chain().focus().setColor('#22c55e').run()}
        style={{
          background: '#22c55e',
          color: '#fff',
          border: '2px solid ' + (editor.isActive('textStyle', { color: '#22c55e' }) ? '#fff' : '#22c55e'),
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
          width: 28,
          height: 28,
        }}
        title="Зелёный"
      />
      <button
        type="button"
        onClick={() => editor.chain().focus().setColor('#f59e0b').run()}
        style={{
          background: '#f59e0b',
          color: '#fff',
          border: '2px solid ' + (editor.isActive('textStyle', { color: '#f59e0b' }) ? '#fff' : '#f59e0b'),
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
          width: 28,
          height: 28,
        }}
        title="Оранжевый"
      />
      <button
        type="button"
        onClick={() => editor.chain().focus().unsetColor().run()}
        style={{
          background: '#2a3346',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 11,
        }}
        title="Сбросить цвет"
      >
        ✕
      </button>
      <label
        style={{
          background: '#2a3346',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
          display: 'inline-block',
        }}
      >
        🖼️ Image
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            // Проверка размера файла (10MB)
            if (file.size > 10 * 1024 * 1024) {
              const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
              alert(`Изображение много весит (${sizeMB} MB).\nМаксимум: 10 MB`);
              return;
            }

            // Загрузка на сервер
            const formData = new FormData();
            formData.append('image', file);

            try {
              const response = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                body: formData,
              });

              const data = await response.json();
              if (data.ok && data.url) {
                // Вставляем изображение в редактор
                const fullUrl = `${window.location.origin}${data.url}`;
                editor.chain().focus().setImage({ src: fullUrl }).run();
              } else {
                alert('Ошибка загрузки изображения.\nПопробуйте другой файл.');
              }
            } catch (error) {
              console.error('Upload error:', error);
              alert('Ошибка загрузки изображения.\nПроверьте соединение.');
            }

            // Очистка input для повторной загрузки
            e.target.value = '';
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        }}
        style={{
          background: editor.isActive('table') ? '#2563eb' : '#2a3346',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        📊 Table
      </button>
      {editor.isActive('table') && (
        <>
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            style={{
              background: '#2a3346',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            + Col
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            style={{
              background: '#2a3346',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            + Row
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteTable().run()}
            style={{
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            ✕ Table
          </button>
        </>
      )}
    </div>
  );
}

export default function FormEditor({
  chatId,
  formId,
  onBack,
}: {
  chatId: string;
  formId: string | null;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<TabName>('form');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    fields: [],
    successType: 'PAGE',
    successContent: '',
    redirectUrl: '',
    status: 'Inbox',
  });

  // Pickers state
  const [groups, setGroups] = useState<APIGroup[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [labels, setLabels] = useState<GroupLabel[]>([]);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [showObserverPicker, setShowObserverPicker] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);

  // Tiptap editor for form description
  const descEditor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          style: 'max-width: 100%; height: auto; display: block;'
        },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
    ],
    content: formData.description,
    onUpdate: ({ editor }) => {
      setFormData((prev) => ({ ...prev, description: editor.getHTML() }));
    },
  });

  // Tiptap editor for success page
  const successEditor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          style: 'max-width: 100%; height: auto; display: block;'
        },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
    ],
    content: formData.successContent || '',
    onUpdate: ({ editor }) => {
      setFormData((prev) => ({ ...prev, successContent: editor.getHTML() }));
    },
  });

  useEffect(() => {
    loadGroups();
    if (formId) {
      loadForm(formId);
    }
  }, [formId, chatId]);

  // Load members and labels when group changes
  useEffect(() => {
    if (formData.groupId) {
      loadMembers(formData.groupId);
      loadGroupLabels(formData.groupId);
      // Reset label, assignee and observer when group changes
      setFormData((prev) => ({
        ...prev,
        labelId: undefined,
        assigneeChatId: undefined,
        observerChatId: undefined
      }));
    } else {
      setLabels([]);
    }
  }, [formData.groupId]);

  useEffect(() => {
    if (descEditor && formData.description) {
      const currentContent = descEditor.getHTML();
      // Only update if content is different to avoid cursor jumps
      if (currentContent !== formData.description) {
        descEditor.commands.setContent(formData.description);
      }
    }
  }, [descEditor, formData.description]);

  useEffect(() => {
    if (successEditor && formData.successContent) {
      const currentContent = successEditor.getHTML();
      // Only update if content is different to avoid cursor jumps
      if (currentContent !== formData.successContent) {
        successEditor.commands.setContent(formData.successContent);
      }
    }
  }, [successEditor, formData.successContent]);

  // Close pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowGroupPicker(false);
      setShowAssigneePicker(false);
      setShowObserverPicker(false);
      setShowLabelPicker(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  async function loadGroups() {
    try {
      const r = await listGroups(chatId);
      if (r.ok) {
        // Filter only groups where user is owner
        const ownedGroups = (r.groups || []).filter((g) => g.ownerChatId === chatId);
        setGroups(ownedGroups);
      }
    } catch (e) {
      console.error('[FORM_EDITOR] loadGroups error', e);
    }
  }

  async function loadMembers(groupId: string) {
    try {
      const r = await getGroupMembers(groupId);
      if (r.ok) {
        setMembers(r.members || []);
      }
    } catch (e) {
      console.error('[FORM_EDITOR] loadMembers error', e);
    }
  }

  async function loadGroupLabels(groupId: string) {
    try {
      const ls = await getGroupLabels(groupId);
      setLabels(ls || []);
    } catch (e) {
      console.error('[FORM_EDITOR] loadGroupLabels error', e);
      setLabels([]);
    }
  }

  async function loadForm(id: string) {
    try {
      setLoading(true);
      const r = await fetch(`${API_BASE}/forms/${id}?chatId=${encodeURIComponent(chatId)}`);
      const data = await r.json();
      if (data.ok) {
        setFormData({
          id: data.form.id,
          title: data.form.title,
          description: data.form.description,
          fields: data.form.fields || [],
          successType: data.form.successType,
          successContent: data.form.successContent,
          redirectUrl: data.form.redirectUrl,
          groupId: data.form.groupId,
          assigneeChatId: data.form.assigneeChatId,
          labelId: data.form.labelId,
          status: data.form.status,
          observerChatId: data.form.observerChatId,
          allowSubmitterWatch: data.form.allowSubmitterWatch,
          backgroundColor: data.form.backgroundColor || '#1b2030',
        });
      }
    } catch (e) {
      console.error('[FORM_EDITOR] load error', e);
    } finally {
      setLoading(false);
    }
  }

  async function saveForm() {
    if (!formData.title.trim()) {
      alert('Введите название формы');
      return;
    }
    try {
      setSaving(true);
      const method = formId ? 'PUT' : 'POST';
      const url = formId
        ? `${API_BASE}/forms/${formId}`
        : `${API_BASE}/forms`;

      // Преобразуем undefined в null для правильной очистки полей в БД
      const payload = {
        ...formData,
        chatId,
        groupId: formData.groupId || null,
        assigneeChatId: formData.assigneeChatId || null,
        labelId: formData.labelId || null,
        observerChatId: formData.observerChatId || null,
        successContent: formData.successContent || null,
        redirectUrl: formData.redirectUrl || null,
      };

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (data.ok) {
        alert('Форма сохранена');
        // Не вызываем onBack() - остаёмся в редакторе формы
      } else {
        alert(`Ошибка: ${data.error}`);
      }
    } catch (e) {
      console.error('[FORM_EDITOR] save error', e);
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  function addField() {
    const newField: FormField = {
      id: `field_${Date.now()}`,
      label: 'Новое поле',
      type: 'text',
      required: false,
      visible: true,
      placeholder: '',
      order: formData.fields.length,
    };
    setFormData((prev) => ({ ...prev, fields: [...prev.fields, newField] }));
  }

  function updateField(index: number, updates: Partial<FormField>) {
    setFormData((prev) => ({
      ...prev,
      fields: prev.fields.map((f, i) => (i === index ? { ...f, ...updates } : f)),
    }));
  }

  function deleteField(index: number) {
    setFormData((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  }

  function moveField(index: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= formData.fields.length) return;
    const fields = [...formData.fields];
    [fields[index], fields[newIndex]] = [fields[newIndex], fields[index]];
    setFormData((prev) => ({ ...prev, fields }));
  }

  function getMemberName(chatId: string): string {
    const member = members.find((m) => m.chatId === chatId);
    if (!member) return chatId;
    return member.name || chatId;
  }

  function getGroupName(groupId: string): string {
    const group = groups.find((g) => g.id === groupId);
    return group ? group.title : groupId;
  }

  function getLabelName(labelId: string): string {
    const label = labels.find((l) => l.id === labelId);
    return label ? label.title : labelId;
  }

  if (loading) {
    return <div style={{ padding: 16 }}>Загрузка...</div>;
  }

  const formUrl = formData.id ? `${import.meta.env.VITE_PUBLIC_ORIGIN}/form/${formData.id}` : '';

  return (
    <div style={{ padding: 8, overflowX: 'hidden' }}>
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
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          {formId ? 'Редактировать форму' : 'Создать форму'}
        </h2>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #2a3346' }}>
        {(['form', 'success', 'link'] as TabName[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? '#2563eb' : 'transparent',
              color: tab === t ? '#fff' : '#9ca3af',
              border: 'none',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              padding: '8px 16px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {t === 'form' ? 'Форма' : t === 'success' ? 'Страница успеха' : 'Ссылка'}
          </button>
        ))}
      </div>

      {/* Tab: Form */}
      {tab === 'form' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Title */}
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
              Название формы
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Заявка на консультацию"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px',
                background: '#1b2030',
                border: '1px solid #2a3346',
                borderRadius: 8,
                color: '#e8eaed',
                fontSize: 14,
              }}
            />
          </div>

          {/* Description (WYSIWYG) */}
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
              Описание формы
            </label>
            <div
              style={{ width: '100%',
                background: '#1b2030',
                border: '1px solid #2a3346',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <EditorToolbar editor={descEditor} />
              <div style={{ padding: 8, minHeight: 120 }}>
                <EditorContent editor={descEditor} />
              </div>
            </div>
          </div>

          {/* Fields */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontWeight: 600 }}>Поля формы</label>
              <button
                onClick={addField}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                + Добавить поле
              </button>
            </div>
            {formData.fields.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  textAlign: 'center',
                  opacity: 0.6,
                  border: '1px dashed #2a3346',
                  borderRadius: 8,
                }}
              >
                Нет полей. Добавьте первое!
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {formData.fields.map((field, index) => (
                  <div
                    key={field.id}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#1b2030',
                      border: '1px solid #2a3346',
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateField(index, { label: e.target.value })}
                          placeholder="Название поля"
                          style={{
                            width: '50%',
                            boxSizing: 'border-box',
                            padding: '6px 8px',
                            background: '#0f1419',
                            border: '1px solid #2a3346',
                            borderRadius: 6,
                            color: '#e8eaed',
                            fontSize: 13,
                          }}
                        />
                        <select
                          value={field.type}
                          onChange={(e) =>
                            updateField(index, { type: e.target.value as FormField['type'] })
                          }
                          style={{
                            padding: '6px 8px',
                            background: '#0f1419',
                            border: '1px solid #2a3346',
                            borderRadius: 6,
                            color: '#e8eaed',
                            fontSize: 13,
                          }}
                        >
                          <option value="text">Текст</option>
                          <option value="email">Email</option>
                          <option value="phone">Телефон</option>
                          <option value="textarea">Многострочный текст</option>
                          <option value="checkbox">Чекбокс</option>
                          <option value="select">Выпадающий список</option>
                        </select>
                      </div>
                      <input
                        type="text"
                        value={field.placeholder || ''}
                        onChange={(e) => updateField(index, { placeholder: e.target.value })}
                        placeholder="Placeholder (необязательно)"
                        style={{
                          width: '80%',
                          boxSizing: 'border-box',
                          padding: '6px 8px',
                          background: '#0f1419',
                          border: '1px solid #2a3346',
                          borderRadius: 6,
                          color: '#e8eaed',
                          fontSize: 13,
                        }}
                      />
                      {field.type === 'select' && (
                        <div>
                          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, opacity: 0.8 }}>
                            Варианты ответов (каждый с новой строки)
                          </label>
                          <textarea
                            value={(field.options || []).join('\n')}
                            onChange={(e) => {
                              const options = e.target.value.split('\n');
                              updateField(index, { options });
                            }}
                            placeholder="Москва&#10;Санкт-Петербург&#10;Казань"
                            rows={4}
                            style={{
                              width: '80%',
                              boxSizing: 'border-box',
                              padding: '6px 8px',
                              background: '#0f1419',
                              border: '1px solid #2a3346',
                              borderRadius: 6,
                              color: '#e8eaed',
                              fontSize: 13,
                              fontFamily: 'inherit',
                              resize: 'vertical',
                            }}
                          />
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateField(index, { required: e.target.checked })}
                          />
                          Обязательное
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={field.visible}
                            onChange={(e) => updateField(index, { visible: e.target.checked })}
                          />
                          Видимое
                        </label>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button
                          onClick={() => moveField(index, 'up')}
                          disabled={index === 0}
                          style={{
                            background: '#2a3346',
                            color: '#e8eaed',
                            border: 'none',
                            borderRadius: 6,
                            padding: '4px 8px',
                            cursor: index === 0 ? 'not-allowed' : 'pointer',
                            opacity: index === 0 ? 0.5 : 1,
                            fontSize: 12,
                          }}
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveField(index, 'down')}
                          disabled={index === formData.fields.length - 1}
                          style={{
                            background: '#2a3346',
                            color: '#e8eaed',
                            border: 'none',
                            borderRadius: 6,
                            padding: '4px 8px',
                            cursor: index === formData.fields.length - 1 ? 'not-allowed' : 'pointer',
                            opacity: index === formData.fields.length - 1 ? 0.5 : 1,
                            fontSize: 12,
                          }}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => deleteField(index)}
                          style={{
                            background: '#dc2626',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Task Creation Settings */}
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
              Создание задачи
            </label>
            <div style={{ display: 'grid', gap: 8 }}>
              {/* Group Picker */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowGroupPicker(!showGroupPicker);
                  }}
                  style={{
                    width: '65%', boxSizing: 'border-box',
                    padding: '8px 10px',
                    background: '#1b2030',
                    border: '1px solid #2a3346',
                    borderRadius: 6,
                    color: formData.groupId ? '#e8eaed' : '#6b7280',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {formData.groupId ? getGroupName(formData.groupId) : 'Выберите группу'}
                </button>
                {showGroupPicker && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      width: '65%',
                      marginTop: 4,
                      background: '#1b2030',
                      border: '1px solid #2a3346',
                      borderRadius: 8,
                      maxHeight: 200,
                      overflowY: 'auto',
                      zIndex: 10,
                    }}
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormData((prev) => ({ ...prev, groupId: undefined, assigneeChatId: undefined, observerChatId: undefined }));
                        setShowGroupPicker(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#9ca3af',
                        borderBottom: '1px solid #2a3346',
                      }}
                    >
                      Не выбрано
                    </div>
                    {groups.map((g) => (
                      <div
                        key={g.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData((prev) => ({ ...prev, groupId: g.id }));
                          setShowGroupPicker(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: '#e8eaed',
                          background: formData.groupId === g.id ? '#2563eb' : 'transparent',
                        }}
                      >
                        {g.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assignee Picker */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!formData.groupId) {
                      alert('Сначала выберите группу');
                      return;
                    }
                    setShowAssigneePicker(!showAssigneePicker);
                  }}
                  disabled={!formData.groupId}
                  style={{
                    width: '65%', boxSizing: 'border-box',
                    padding: '8px 10px',
                    background: '#1b2030',
                    border: '1px solid #2a3346',
                    borderRadius: 6,
                    color: formData.assigneeChatId ? '#e8eaed' : '#6b7280',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: formData.groupId ? 'pointer' : 'not-allowed',
                    opacity: formData.groupId ? 1 : 0.5,
                  }}
                >
                  {formData.assigneeChatId ? getMemberName(formData.assigneeChatId) : 'Выберите ответственного'}
                </button>
                {showAssigneePicker && formData.groupId && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      width: '65%',
                      marginTop: 4,
                      background: '#1b2030',
                      border: '1px solid #2a3346',
                      borderRadius: 8,
                      maxHeight: 200,
                      overflowY: 'auto',
                      zIndex: 10,
                    }}
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormData((prev) => ({ ...prev, assigneeChatId: undefined }));
                        setShowAssigneePicker(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#9ca3af',
                        borderBottom: '1px solid #2a3346',
                      }}
                    >
                      Не выбрано
                    </div>
                    {members.map((m) => (
                      <div
                        key={m.chatId}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData((prev) => ({ ...prev, assigneeChatId: m.chatId }));
                          setShowAssigneePicker(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: '#e8eaed',
                          background: formData.assigneeChatId === m.chatId ? '#2563eb' : 'transparent',
                        }}
                      >
                        {getMemberName(m.chatId)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Label Picker */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!formData.groupId) {
                      alert('Сначала выберите группу');
                      return;
                    }
                    setShowLabelPicker(!showLabelPicker);
                  }}
                  disabled={!formData.groupId}
                  style={{
                    width: '65%', boxSizing: 'border-box',
                    padding: '8px 10px',
                    background: '#1b2030',
                    border: '1px solid #2a3346',
                    borderRadius: 6,
                    color: formData.labelId ? '#e8eaed' : '#6b7280',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: formData.groupId ? 'pointer' : 'not-allowed',
                    opacity: formData.groupId ? 1 : 0.5,
                  }}
                >
                  {formData.labelId ? getLabelName(formData.labelId) : 'Выберите ярлык (необязательно)'}
                </button>
                {showLabelPicker && formData.groupId && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      width: '65%',
                      marginTop: 4,
                      background: '#1b2030',
                      border: '1px solid #2a3346',
                      borderRadius: 8,
                      maxHeight: 200,
                      overflowY: 'auto',
                      zIndex: 10,
                    }}
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormData((prev) => ({ ...prev, labelId: undefined }));
                        setShowLabelPicker(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#9ca3af',
                        borderBottom: '1px solid #2a3346',
                      }}
                    >
                      🏷️ Без ярлыка
                    </div>
                    {labels.map((label) => (
                      <div
                        key={label.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData((prev) => ({ ...prev, labelId: label.id }));
                          setShowLabelPicker(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: '#e8eaed',
                          background: formData.labelId === label.id ? '#2563eb' : 'transparent',
                        }}
                      >
                        🏷️ {label.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Observer Picker */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!formData.groupId) {
                      alert('Сначала выберите группу');
                      return;
                    }
                    setShowObserverPicker(!showObserverPicker);
                  }}
                  disabled={!formData.groupId}
                  style={{
                    width: '65%', boxSizing: 'border-box',
                    padding: '8px 10px',
                    background: '#1b2030',
                    border: '1px solid #2a3346',
                    borderRadius: 6,
                    color: formData.observerChatId ? '#e8eaed' : '#6b7280',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: formData.groupId ? 'pointer' : 'not-allowed',
                    opacity: formData.groupId ? 1 : 0.5,
                  }}
                >
                  {formData.observerChatId ? getMemberName(formData.observerChatId) : 'Выберите наблюдателя (необязательно)'}
                </button>
                {showObserverPicker && formData.groupId && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      width: '65%',
                      marginTop: 4,
                      background: '#1b2030',
                      border: '1px solid #2a3346',
                      borderRadius: 8,
                      maxHeight: 200,
                      overflowY: 'auto',
                      zIndex: 10,
                    }}
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormData((prev) => ({ ...prev, observerChatId: undefined }));
                        setShowObserverPicker(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#9ca3af',
                        borderBottom: '1px solid #2a3346',
                      }}
                    >
                      Не выбрано
                    </div>
                    {members.map((m) => (
                      <div
                        key={m.chatId}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData((prev) => ({ ...prev, observerChatId: m.chatId }));
                          setShowObserverPicker(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: '#e8eaed',
                          background: formData.observerChatId === m.chatId ? '#2563eb' : 'transparent',
                        }}
                      >
                        {getMemberName(m.chatId)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Background Color */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                Цвет фона формы
              </label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input
                  type="color"
                  value={formData.backgroundColor || '#1b2030'}
                  onChange={(e) => setFormData((prev) => ({ ...prev, backgroundColor: e.target.value }))}
                  style={{
                    width: 60,
                    height: 40,
                    border: '1px solid #2a3346',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                />
                <input
                  type="text"
                  value={formData.backgroundColor || '#1b2030'}
                  onChange={(e) => setFormData((prev) => ({ ...prev, backgroundColor: e.target.value }))}
                  placeholder="#1b2030"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: '#1b2030',
                    border: '1px solid #2a3346',
                    borderRadius: 6,
                    color: '#e8eaed',
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, backgroundColor: '#1b2030' }))}
                  style={{
                    padding: '8px 12px',
                    background: '#2a3346',
                    border: 'none',
                    borderRadius: 6,
                    color: '#e8eaed',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Сбросить
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                Этот цвет будет использоваться как фон формы при встраивании на сайт
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Success Page */}
      {tab === 'success' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
              Тип страницы успеха
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio"
                  checked={formData.successType === 'PAGE'}
                  onChange={() => setFormData((prev) => ({ ...prev, successType: 'PAGE' }))}
                />
                Показать страницу
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio"
                  checked={formData.successType === 'REDIRECT'}
                  onChange={() => setFormData((prev) => ({ ...prev, successType: 'REDIRECT' }))}
                />
                Перенаправить на URL
              </label>
            </div>
          </div>

          {formData.successType === 'PAGE' ? (
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                Содержимое страницы успеха
              </label>
              <div
                style={{ width: '100%',
                  background: '#1b2030',
                  border: '1px solid #2a3346',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <EditorToolbar editor={successEditor} />
                <div style={{ padding: 8, minHeight: 200 }}>
                  <EditorContent editor={successEditor} />
                </div>
              </div>

              {/* Checkbox: Allow Submitter to Watch Task */}
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.allowSubmitterWatch || false}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, allowSubmitterWatch: e.target.checked }));
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: '#e8eaed' }}>
                    Отправитель может наблюдать за статусом задачи
                  </span>
                </label>
              </div>
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                URL для перенаправления
              </label>
              <input
                type="url"
                value={formData.redirectUrl || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, redirectUrl: e.target.value }))}
                placeholder="https://example.com/thank-you"
                style={{
                  width: '90%', boxSizing: 'border-box',
                  padding: '10px 12px',
                  background: '#1b2030',
                  border: '1px solid #2a3346',
                  borderRadius: 8,
                  color: '#e8eaed',
                  fontSize: 14,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Tab: Link */}
      {tab === 'link' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {formUrl ? (
            <>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                  Публичная ссылка на форму
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    background: '#1b2030',
                    border: '1px solid #2a3346',
                    borderRadius: 8,
                  }}
                >
                  <input
                    type="text"
                    value={formUrl}
                    readOnly
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: '#e8eaed',
                      fontSize: 14,
                    }}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(formUrl);
                      alert('Ссылка скопирована');
                    }}
                    style={{
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    Копировать
                  </button>
                </div>
                <button
                  onClick={() => {
                    window.open(formUrl, '_blank');
                  }}
                  style={{
                    width: '100%',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  Открыть форму в новой вкладке
                </button>
              </div>
              <div style={{ padding: 12, background: '#1b2030', borderRadius: 8, opacity: 0.8, fontSize: 13 }}>
                <p style={{ margin: 0, marginBottom: 8 }}>
                  Используйте эту ссылку для размещения формы на внешних сайтах.
                </p>
                <p style={{ margin: 0 }}>
                  Когда кто-то отправит форму, в вашей группе автоматически создастся задача с данными из формы.
                </p>
              </div>

              {/* Embed code section */}
              <div style={{ marginTop: 24 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                  Код для вставки на сайт:
                </label>
                <div
                  style={{
                    background: '#0f1419',
                    border: '1px solid #2a3346',
                    borderRadius: 8,
                    padding: 12,
                    position: 'relative',
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: '#e8eaed',
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                      lineHeight: 1.5,
                    }}
                  >
{`<script src="${import.meta.env.VITE_PUBLIC_ORIGIN}/embed.js"
        data-form-id="${formData.id}">
</script>`}
                  </pre>
                  <button
                    onClick={() => {
                      const embedCode = `<script src="${import.meta.env.VITE_PUBLIC_ORIGIN}/embed.js" data-form-id="${formData.id}"></script>`;
                      navigator.clipboard.writeText(embedCode);
                      alert('Код скопирован');
                    }}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    Копировать
                  </button>
                </div>
                <div style={{ padding: 12, background: '#1b2030', borderRadius: 8, opacity: 0.8, fontSize: 12, marginTop: 8 }}>
                  <p style={{ margin: 0 }}>
                    💡 Вставьте этот код на ваш сайт, и форма автоматически появится в том месте, где размещён код.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                opacity: 0.6,
                border: '1px dashed #2a3346',
                borderRadius: 12,
              }}
            >
              Сохраните форму, чтобы получить ссылку
            </div>
          )}
        </div>
      )}

      {/* Save Button */}
      <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
        <button
          onClick={saveForm}
          disabled={saving}
          style={{
            flex: 1,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '12px 16px',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Сохранение...' : 'Сохранить форму'}
        </button>
      </div>
    </div>
  );
}
