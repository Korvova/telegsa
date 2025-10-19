// PublicFormPage.tsx
import { useEffect, useState } from 'react';
import { API_BASE } from '../api';

type FormField = {
  id: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'checkbox' | 'select';
  required: boolean;
  visible: boolean;
  placeholder?: string;
  options?: string[];
  order: number;
};

type FormData = {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
  successType: 'PAGE' | 'REDIRECT';
  successContent?: string;
  redirectUrl?: string;
  isActive: boolean;
  backgroundColor?: string;
};

export default function PublicFormPage({ formId }: { formId: string }) {
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [submitterToken, setSubmitterToken] = useState<string | null>(null);
  const [allowSubmitterWatch, setAllowSubmitterWatch] = useState(false);

  useEffect(() => {
    loadForm();
  }, [formId]);

  // Auto-resize для iframe встраивания
  useEffect(() => {
    // Проверяем, находимся ли мы внутри iframe
    if (window.self === window.parent) {
      return; // Не в iframe, ничего не делаем
    }

    const sendHeight = () => {
      // Используем body.scrollHeight вместо documentElement
      const height = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight
      ) + 40; // Добавляем отступ для виджета

      window.parent.postMessage({
        type: 'telegsar-form-resize',
        height: height
      }, '*');
    };

    // Отправляем высоту только один раз после загрузки/изменения
    const timer = window.setTimeout(sendHeight, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [form, submitted]);

  async function loadForm() {
    try {
      setLoading(true);
      const r = await fetch(`${API_BASE}/public/forms/${formId}`);
      const data = await r.json();

      if (data.ok && data.form) {
        setForm(data.form);
        // Initialize form values
        const initialValues: Record<string, any> = {};
        data.form.fields.forEach((field: FormField) => {
          initialValues[field.id] = field.type === 'checkbox' ? false : '';
        });
        setFormValues(initialValues);
      } else {
        setError(data.error || 'Form not found');
      }
    } catch (e) {
      console.error('[PUBLIC_FORM] load error', e);
      setError('Failed to load form');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form) return;

    // Validate required fields
    const errors: string[] = [];
    form.fields.forEach((field) => {
      if (field.required && field.visible) {
        const value = formValues[field.id];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          errors.push(field.label);
        }
      }
    });

    if (errors.length > 0) {
      alert(`Пожалуйста, заполните обязательные поля:\n${errors.join('\n')}`);
      return;
    }

    try {
      setSubmitting(true);
      const r = await fetch(`${API_BASE}/public/forms/${formId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: formValues }),
      });

      const result = await r.json();

      if (result.ok) {
        setSubmitted(true);
        setSubmitterToken(result.submitterToken);
        setAllowSubmitterWatch(result.allowSubmitterWatch);

        // Уведомляем родительское окно о успешной отправке
        window.parent.postMessage({
          type: 'telegsar-form-submitted',
          formId: formId
        }, '*');

        // Handle redirect
        if (form.successType === 'REDIRECT' && form.redirectUrl) {
          setTimeout(() => {
            window.location.href = form.redirectUrl!;
          }, 1000);
        }
      } else {
        alert(`Ошибка: ${result.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('[PUBLIC_FORM] submit error', e);
      alert('Ошибка отправки формы');
    } finally {
      setSubmitting(false);
    }
  }

  function handleFieldChange(fieldId: string, value: any) {
    setFormValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f1216',
        color: '#e8eaed',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Загрузка...</div>
        </div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f1216',
        color: '#e8eaed',
        padding: 16,
      }}>
        <div style={{
          background: '#1b2030',
          border: '1px solid #2a3346',
          borderRadius: 16,
          padding: 24,
          maxWidth: 480,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Форма недоступна
          </div>
          <div style={{ fontSize: 14, opacity: 0.7 }}>
            {error === 'form_not_found' || error === 'form_inactive'
              ? 'Эта форма была удалена или деактивирована'
              : 'Не удалось загрузить форму'}
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    if (form.successType === 'PAGE') {
      // Format: t.me/bot?startapp=formwatch__formId__token
      const watchUrl = submitterToken
        ? `https://t.me/${import.meta.env.VITE_TG_BOT_USERNAME}?startapp=formwatch__${formId}__${submitterToken}`
        : null;

      const isInIframe = window.self !== window.parent;

      return (
        <div style={{
          minHeight: '100vh',
          background: isInIframe ? 'transparent' : '#0f1216',
          color: '#e8eaed',
          padding: isInIframe ? '0' : '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: form.backgroundColor || '#1b2030',
            border: '1px solid #2a3346',
            borderRadius: 16,
            padding: 24,
            maxWidth: 640,
            width: '100%',
          }}>
            <div
              className="tiptap"
              dangerouslySetInnerHTML={{ __html: form.successContent || '<p>Спасибо! Ваша заявка принята.</p>' }}
              style={{
                lineHeight: 1.6,
                maxWidth: '100%',
                overflow: 'hidden',
              }}
            />

            {allowSubmitterWatch && watchUrl && (
              <div style={{
                marginTop: 24,
                padding: 16,
                background: '#0f1419',
                border: '1px solid #2a3346',
                borderRadius: 8,
              }}>
                <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#e8eaed' }}>
                  Наблюдать за статусом заявки:
                </p>
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    background: '#2563eb',
                    color: '#ffffff',
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  Наблюдать
                </a>
              </div>
            )}
          </div>
        </div>
      );
    } else {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f1216',
          color: '#e8eaed',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18 }}>Перенаправление...</div>
          </div>
        </div>
      );
    }
  }

  // Проверяем, находимся ли в iframe
  const isInIframe = window.self !== window.parent;

  return (
    <div style={{
      minHeight: '100vh',
      background: isInIframe ? 'transparent' : '#0f1216', // Прозрачный фон для встраивания
      color: '#e8eaed',
      padding: isInIframe ? '0' : '24px 16px', // Без padding для встраивания
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: 640,
          margin: '0 auto',
          background: form.backgroundColor || '#1b2030',
          border: '1px solid #2a3346',
          borderRadius: 16,
          padding: 24,
        }}
      >
        {/* Description */}
        {form.description && (
          <div
            className="tiptap"
            dangerouslySetInnerHTML={{ __html: form.description }}
            style={{
              marginBottom: 24,
              lineHeight: 1.6,
              opacity: 0.9,
              maxWidth: '100%',
              overflow: 'hidden',
            }}
          />
        )}

        {/* Fields */}
        <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
          {form.fields
            .filter((f) => f.visible)
            .sort((a, b) => a.order - b.order)
            .map((field) => (
              <div key={field.id}>
                <label style={{
                  display: 'block',
                  marginBottom: 6,
                  fontWeight: 600,
                  fontSize: 14,
                }}>
                  {field.label}
                  {field.required && <span style={{ color: '#f87171' }}> *</span>}
                </label>

                {field.type === 'textarea' ? (
                  <textarea
                    value={formValues[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    rows={4}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      background: '#0f1419',
                      border: '1px solid #2a3346',
                      borderRadius: 8,
                      color: '#e8eaed',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                ) : field.type === 'checkbox' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!formValues[field.id]}
                      onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                      required={field.required}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 14 }}>{field.placeholder || 'Согласен'}</span>
                  </label>
                ) : field.type === 'select' ? (
                  <select
                    value={formValues[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    required={field.required}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      background: '#0f1419',
                      border: '1px solid #2a3346',
                      borderRadius: 8,
                      color: '#e8eaed',
                      fontSize: 14,
                    }}
                  >
                    <option value="">Выберите...</option>
                    {field.options?.filter(opt => opt.trim()).map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                    value={formValues[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      background: '#0f1419',
                      border: '1px solid #2a3346',
                      borderRadius: 8,
                      color: '#e8eaed',
                      fontSize: 14,
                    }}
                  />
                )}
              </div>
            ))}
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            background: submitting ? '#374151' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '14px 16px',
            fontSize: 16,
            fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Отправка...' : 'Отправить'}
        </button>
      </form>
    </div>
  );
}
