// src/components/GroupAutomationPage.tsx
import { useState, useEffect } from 'react';
import { API_BASE, getGroupLabels, getGroupMembers, listGroups, type GroupLabel, type GroupMember, type Group } from '../api';

type GroupAutomation = {
  id: string;
  groupId: string;
  triggerType: 'label' | 'assignee' | 'status';
  triggerValue: string;
  actionType: 'label' | 'assignee' | 'status' | 'group';
  actionValue: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  groupId: string;
  chatId: string;
  onClose: () => void;
};

export default function GroupAutomationPage({ groupId, chatId, onClose }: Props) {
  const [automations, setAutomations] = useState<GroupAutomation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Данные для селектов
  const [labels, setLabels] = useState<GroupLabel[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  // Создание нового правила
  const [creating, setCreating] = useState(false);
  const [newTriggerType, setNewTriggerType] = useState<'label' | 'assignee' | 'status'>('status');
  const [newTriggerValue, setNewTriggerValue] = useState('');
  const [newActionType, setNewActionType] = useState<'label' | 'assignee' | 'status' | 'group'>('status');
  const [newActionValue, setNewActionValue] = useState('');

  useEffect(() => {
    loadData();
  }, [groupId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [autoRes, labelsData, membersData, boardRes, groupsData] = await Promise.all([
        fetch(`${API_BASE}/groups/${groupId}/automations`, {
          headers: { 'x-telegram-chat-id': chatId }
        }),
        getGroupLabels(groupId),
        getGroupMembers(groupId),
        fetch(`${API_BASE}/tasks?chatId=${chatId}&groupId=${groupId}`),
        listGroups(chatId)
      ]);

      if (!autoRes.ok) {
        throw new Error(`Failed to load automations: ${autoRes.status}`);
      }
      const autoData = await autoRes.json();
      if (autoData.ok) {
        setAutomations(autoData.automations);
      }

      if (boardRes.ok) {
        const boardData = await boardRes.json();
        if (boardData.ok && boardData.columns) {
          // Извлекаем названия колонок (статусы)
          const statusNames = boardData.columns.map((col: any) => {
            const name = col.name || '';
            // Если имя содержит ::, берём часть после ::
            const parts = name.split('::');
            return parts.length > 1 ? parts[1] : name;
          });
          setStatuses(statusNames);
        }
      }

      setLabels(labelsData);
      setMembers(membersData.members || []);
      if (groupsData.ok) {
        // Фильтруем текущую группу из списка
        setGroups(groupsData.groups.filter(g => g.id !== groupId));
      }
    } catch (e: any) {
      console.error('[GroupAutomation] loadData error:', e);
      setError(e?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  const createAutomation = async () => {
    if (!newTriggerValue || !newActionValue) {
      alert('Заполните все поля');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/groups/${groupId}/automations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-chat-id': chatId
        },
        body: JSON.stringify({
          triggerType: newTriggerType,
          triggerValue: newTriggerValue,
          actionType: newActionType,
          actionValue: newActionValue
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Ошибка создания');
      }

      setAutomations([...automations, data.automation]);
      setCreating(false);
      setNewTriggerValue('');
      setNewActionValue('');
    } catch (e: any) {
      setError(e?.message || 'Ошибка создания');
    } finally {
      setLoading(false);
    }
  };

  const deleteAutomation = async (id: string) => {
    if (!confirm('Удалить правило автоматизации?')) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/groups/${groupId}/automations/${id}?chatId=${chatId}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Ошибка удаления');
      }

      setAutomations(automations.filter(a => a.id !== id));
    } catch (e: any) {
      setError(e?.message || 'Ошибка удаления');
    } finally {
      setLoading(false);
    }
  };

  const getTriggerLabel = (automation: GroupAutomation) => {
    if (automation.triggerType === 'label') {
      const label = labels.find(l => l.id === automation.triggerValue);
      return `Ярлык: ${label?.title || '❌ удалён'}`;
    } else if (automation.triggerType === 'assignee') {
      const member = members.find(m => m.chatId === automation.triggerValue);
      return `Ответственный: ${member?.name || '❌ удалён'}`;
    } else if (automation.triggerType === 'status') {
      return `Статус: ${automation.triggerValue}`;
    }
    return '';
  };

  const getActionLabel = (automation: GroupAutomation) => {
    if (automation.actionType === 'label') {
      const label = labels.find(l => l.id === automation.actionValue);
      return `Ярлык: ${label?.title || '❌ удалён'}`;
    } else if (automation.actionType === 'assignee') {
      const member = members.find(m => m.chatId === automation.actionValue);
      return `Ответственный: ${member?.name || '❌ удалён'}`;
    } else if (automation.actionType === 'status') {
      return `Статус: ${automation.actionValue}`;
    } else if (automation.actionType === 'group') {
      const group = groups.find(g => g.id === automation.actionValue);
      return `Группу: ${group?.title || '❌ удалена'}`;
    }
    return '';
  };

  const getTriggerOptions = () => {
    if (newTriggerType === 'label') {
      return labels.map(l => ({ value: l.id, label: l.title }));
    } else if (newTriggerType === 'assignee') {
      return members.map(m => ({ value: m.chatId, label: m.name }));
    } else if (newTriggerType === 'status') {
      return statuses.map(s => ({ value: s, label: s }));
    }
    return [];
  };

  const getActionOptions = () => {
    if (newActionType === 'label') {
      return labels.map(l => ({ value: l.id, label: l.title }));
    } else if (newActionType === 'assignee') {
      return members.map(m => ({ value: m.chatId, label: m.name }));
    } else if (newActionType === 'status') {
      return statuses.map(s => ({ value: s, label: s }));
    } else if (newActionType === 'group') {
      return groups.map(g => ({ value: g.id, label: g.title }));
    }
    return [];
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.7)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(680px, 94vw)',
          maxHeight: '85vh',
          overflow: 'auto',
          background: '#1b2030',
          border: '1px solid #2a3346',
          borderRadius: 16,
          padding: 20,
          color: '#e8eaed',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>🦾 Автоматизация группы</div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              fontSize: 20,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{ color: '#fecaca', marginBottom: 12, padding: 10, background: '#3a1f1f', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 16 }}>
          Настройте автоматические действия при изменении задач в группе.
          <br />
          Например: "Когда статус меняется на Done → изменить ярлык на Completed"
        </div>

        {/* Список правил */}
        <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
          {automations.map((auto) => (
            <div
              key={auto.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                background: auto.isActive ? '#121722' : '#2a1f1f',
                border: `1px solid ${auto.isActive ? '#2a3346' : '#472a2a'}`,
                borderRadius: 10,
                opacity: auto.isActive ? 1 : 0.6,
              }}
            >
              <div style={{ flex: 1, fontSize: 14 }}>
                {!auto.isActive && <span style={{ color: '#fecaca', marginRight: 8 }}>⚠️</span>}
                <strong>Когда:</strong> {getTriggerLabel(auto)}
                <br />
                <strong>То:</strong> {getActionLabel(auto)}
              </div>
              <button
                onClick={() => deleteAutomation(auto.id)}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: '#3a1f1f',
                  color: '#ffd7d7',
                  border: '1px solid #472a2a',
                  cursor: loading ? 'default' : 'pointer',
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            </div>
          ))}

          {automations.length === 0 && !creating && (
            <div style={{ textAlign: 'center', padding: 30, opacity: 0.6, fontSize: 14 }}>
              Нет правил автоматизации. Создайте первое правило!
            </div>
          )}
        </div>

        {/* Создание нового правила */}
        {creating ? (
          <div style={{ background: '#0f1419', border: '1px solid #2a3346', borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>Новое правило автоматизации</div>

            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              {/* КОГДА */}
              <div>
                <label style={{ display: 'block', fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                  КОГДА меняется:
                </label>
                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                  <select
                    value={newTriggerType}
                    onChange={(e) => {
                      setNewTriggerType(e.target.value as any);
                      setNewTriggerValue('');
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      maxWidth: '35%',
                      width: '100%',
                      padding: '8px 4px',
                      borderRadius: 8,
                      background: '#121722',
                      color: '#e8eaed',
                      border: '1px solid #2a3346',
                      boxSizing: 'border-box',
                      fontSize: 14,
                    }}
                  >
                    <option value="status">Статус</option>
                    <option value="label">Ярлык</option>
                    <option value="assignee">Ответственный</option>
                  </select>
                  <select
                    value={newTriggerValue}
                    onChange={(e) => setNewTriggerValue(e.target.value)}
                    style={{
                      flex: 2,
                      minWidth: 0,
                      width: '100%',
                      padding: '8px 4px',
                      borderRadius: 8,
                      background: '#121722',
                      color: '#e8eaed',
                      border: '1px solid #2a3346',
                      boxSizing: 'border-box',
                      fontSize: 14,
                    }}
                  >
                    <option value="">Выберите значение</option>
                    {getTriggerOptions().map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ТО */}
              <div>
                <label style={{ display: 'block', fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                  ТО изменить:
                </label>
                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                  <select
                    value={newActionType}
                    onChange={(e) => {
                      setNewActionType(e.target.value as any);
                      setNewActionValue('');
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      maxWidth: '35%',
                      width: '100%',
                      padding: '8px 4px',
                      borderRadius: 8,
                      background: '#121722',
                      color: '#e8eaed',
                      border: '1px solid #2a3346',
                      boxSizing: 'border-box',
                      fontSize: 14,
                    }}
                  >
                    <option value="status">Статус</option>
                    <option value="label">Ярлык</option>
                    <option value="assignee">Ответственный</option>
                    <option value="group">Группу</option>
                  </select>
                  <select
                    value={newActionValue}
                    onChange={(e) => setNewActionValue(e.target.value)}
                    style={{
                      flex: 2,
                      minWidth: 0,
                      width: '100%',
                      padding: '8px 4px',
                      borderRadius: 8,
                      background: '#121722',
                      color: '#e8eaed',
                      border: '1px solid #2a3346',
                      boxSizing: 'border-box',
                      fontSize: 14,
                    }}
                  >
                    <option value="">Выберите значение</option>
                    {getActionOptions().map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setCreating(false);
                  setNewTriggerValue('');
                  setNewActionValue('');
                }}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: '#374151',
                  color: '#e8eaed',
                  border: 'none',
                  cursor: loading ? 'default' : 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                onClick={createAutomation}
                disabled={loading || !newTriggerValue || !newActionValue}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  cursor: loading || !newTriggerValue || !newActionValue ? 'default' : 'pointer',
                  opacity: loading || !newTriggerValue || !newActionValue ? 0.6 : 1,
                }}
              >
                Создать
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 10,
              background: '#203025',
              color: '#b7ffb7',
              border: '1px solid #2a4a2a',
              cursor: loading ? 'default' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            + Создать правило автоматизации
          </button>
        )}
      </div>
    </div>
  );
}
