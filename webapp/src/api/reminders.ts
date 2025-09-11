import ky from 'ky';
import { API_BASE } from '../api';

export type ReminderTarget = 'ME' | 'RESPONSIBLE' | 'ALL';

export type TaskReminder = {
  id: string;
  taskId: string;
  target: ReminderTarget;
  fireAt: string; // ISO
  createdBy: string; // chatId
  replyToMessageId?: number | null;
  sentAt?: string | null;
  tries?: number;
  createdAt?: string;
  updatedAt?: string;
};

export async function listTaskReminders(taskId: string): Promise<{ ok: boolean; reminders: TaskReminder[] }>
{
  return ky.get(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/reminders`).json();
}

export async function createTaskReminder(
  taskId: string,
  p: { createdBy: string; target: ReminderTarget; fireAt: string }
): Promise<{ ok: boolean; reminder: TaskReminder }>
{
  return ky
    .post(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/reminders`, { json: p })
    .json();
}

export async function deleteTaskReminder(taskId: string, reminderId: string): Promise<{ ok: boolean }>
{
  return ky
    .delete(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/reminders/${encodeURIComponent(reminderId)}`)
    .json();
}

