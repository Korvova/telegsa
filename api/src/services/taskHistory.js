// services/taskHistory.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Логирует действие в историю задачи
 * @param {string} taskId - ID задачи
 * @param {string} action - тип действия (status_changed, assignee_changed, etc.)
 * @param {string|null} actorChatId - кто совершил действие
 * @param {string|null} oldValue - старое значение
 * @param {string|null} newValue - новое значение
 * @param {object|null} metadata - дополнительные данные
 */
export async function logTaskHistory(taskId, action, actorChatId, oldValue = null, newValue = null, metadata = null) {
  try {
    await prisma.taskHistory.create({
      data: {
        taskId: String(taskId),
        action: String(action),
        actorChatId: actorChatId ? String(actorChatId) : null,
        oldValue: oldValue ? String(oldValue) : null,
        newValue: newValue ? String(newValue) : null,
        metadata: metadata || undefined,
      },
    });
  } catch (e) {
    console.error('[logTaskHistory] error:', e);
  }
}

function joinName(u) {
  if (!u) return '';
  const fn = (u.firstName || '').trim();
  const ln = (u.lastName || '').trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ').trim();
  if (u.username) return `@${u.username}`;
  return String(u.chatId || '');
}

export { joinName };
