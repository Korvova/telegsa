import ky from 'ky';

/* ---------- Types ---------- */

export type Task = {
  id: string;
  chatId: string;
  text: string;
  order: number;
  tgMessageId?: string | null;
  columnId: string;
  createdAt: string;
  updatedAt: string;

  // ⤵️ добавляем
  assigneeChatId?: string | null;
  assigneeName?: string | null;
};

export type Column = {
  id: string;
  chatId: string;
  name: 'Inbox' | 'Doing' | 'Done' | string;
  order: number;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
};

export type Group = {
  id: string;
  title: string;
  kind: 'own' | 'member';
  ownerName?: string | null; // ⬅️ новое поле
};

/* ---------- Config ---------- */
const API_BASE = import.meta.env.VITE_API_BASE || ''; // напр. '/telegsar-api' или '/api'

/* ---------- Helpers ---------- */
const normGroup = (gid?: string) => (gid && gid !== 'default' ? gid : undefined);

function makeParams(obj: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v) sp.set(k, v);
  return sp;
}

/* ---------- Board / Tasks ---------- */

export async function fetchBoard(
  chatId: string,
  groupId?: string,
  opts?: { onlyMine?: boolean }
) {
  const searchParams = makeParams({
    chatId,
    groupId: normGroup(groupId),
    onlyMine: opts?.onlyMine ? '1' : undefined,
  });
  return ky.get(`${API_BASE}/tasks`, { searchParams })
    .json<{ ok: boolean; columns: Column[] }>();
}

export function moveTask(taskId: string, toColumnId: string, toIndex: number) {
  return ky
    .patch(`${API_BASE}/tasks/${taskId}/move`, { json: { toColumnId, toIndex } })
    .json<{ ok: boolean; task: Task }>();
}

export function getTask(id: string) {
  return ky.get(`${API_BASE}/tasks/${id}`).json<{ ok: boolean; task: Task }>();
}

export function updateTask(id: string, text: string) {
  return ky
    .patch(`${API_BASE}/tasks/${id}`, { json: { text } })
    .json<{ ok: boolean; task: Task }>();
}

export function completeTask(id: string) {
  return ky.post(`${API_BASE}/tasks/${id}/complete`).json<{ ok: boolean; task: Task }>();
}

export function createTask(chatId: string, text: string, groupId?: string) {
  return ky
    .post(`${API_BASE}/tasks`, { json: { chatId, text, groupId: normGroup(groupId) } })
    .json<{ ok: boolean; task: Task }>();
}

export function createColumn(chatId: string, name: string, groupId?: string) {
  return ky
    .post(`${API_BASE}/columns`, { json: { chatId, name, groupId: normGroup(groupId) } })
    .json<{ ok: boolean; column: Column }>();
}

export function renameColumn(id: string, name: string) {
  return ky
    .patch(`${API_BASE}/columns/${id}`, { json: { name } })
    .json<{ ok: boolean; column: Column }>();
}

/* ---------- Groups ---------- */

export function listGroups(chatId: string) {
  const searchParams = makeParams({ chatId });
  return ky
    .get(`${API_BASE}/groups`, { searchParams })
    .json<{ ok: boolean; groups: Group[] }>();
}

export function createGroup(chatId: string, title: string) {
  return ky
    .post(`${API_BASE}/groups`, { json: { chatId, title } })
    .json<{ ok: boolean; group: Group }>();
}

export function renameGroupTitle(id: string, chatId: string, title: string) {
  return ky
    .patch(`${API_BASE}/groups/${id}`, { json: { chatId, title } })
    .json<{ ok: boolean; group: Group }>();
}

export function deleteGroup(id: string, chatId: string) {
  const searchParams = makeParams({ chatId });
  return ky
    .delete(`${API_BASE}/groups/${id}`, { searchParams })
    .json<{ ok: boolean }>();
}

/* ---------- Invites / Me ---------- */

export function acceptInvite(chatId: string, token: string) {
  return ky
    .post(`${API_BASE}/invites/accept`, { json: { chatId, token } })
    .json<{ ok: boolean }>();
}

export function upsertMe(payload: {
  chatId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}) {
  return ky.post(`${API_BASE}/me`, { json: payload }).json<{ ok: boolean }>();
}

export function createInvite(p: { chatId: string; type: 'task' | 'group'; taskId?: string; groupId?: string }) {
  return ky.post(`${API_BASE}/invites`, { json: p }).json<{ ok: boolean; link: string; shareText?: string }>();
}

export function deleteTask(id: string) {
  return ky.delete(`${API_BASE}/tasks/${id}`).json<{ ok: boolean; groupId: string | null }>();
}

export function reopenTask(id: string) {
  return ky.post(`${API_BASE}/tasks/${id}/reopen`).json<{ ok: boolean; task: Task }>();
}

export function getTaskWithGroup(id: string) {
  return ky
    .get(`${API_BASE}/tasks/${id}`)
    .json<{ ok: boolean; task: Task; groupId: string | null; phase?: 'Inbox' | 'Doing' | 'Done' | string }>();
}

/* ---------- Forward ---------- */

export async function forwardTask(taskId: string, toChatId: string) {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/forward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toChatId })
  });
  return r.json();
}

/* ---------- Share (Mini App) ---------- */

// savePreparedInlineMessage → shareMessage (встроенный диалог)
export async function prepareShareMessage(
  taskId: string,
  body: { userId: number; allowGroups?: boolean; withButton?: boolean }
) {
  const r = await fetch(`${API_BASE}/tasks/${taskId}/share-prepared`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ...data } as {
    status: number;
    ok?: boolean;
    preparedMessageId?: string;
    minimized?: boolean;
    error?: string;
    details?: string;
  };
}

// опционально: отправить «превью себе» обычным sendMessage (для отладки)
export async function sendSelfPreview(taskId: string, body: { userId: number }) {
  const r = await fetch(`${API_BASE}/tasks/${taskId}/send-self-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ...data } as {
    status: number;
    ok?: boolean;
    messageId?: number;
    error?: string;
    details?: string;
  };
}


// src/api.ts (добавь рядом с остальными типами/функциями)

export type GroupMember = {
  chatId: string;
  name?: string | null;
  role?: 'owner' | 'member' | 'invited';
  assignedCount?: number; // сколько задач на участнике в этой группе
};

export async function getGroupMembers(groupId: string): Promise<{
  ok: boolean;
  owner?: GroupMember;
  members: GroupMember[];
}> {
  const r = await fetch(`${import.meta.env.VITE_API_BASE}/groups/${groupId}/members`, {
    credentials: 'include',
  });
  if (!r.ok) return { ok: false, members: [] };
  return r.json();
}

export async function createGroupInvite(params: { chatId: string; groupId: string }): Promise<{
  ok: boolean;
  link?: string;
  shareText?: string;
}> {
  const r = await fetch(`${import.meta.env.VITE_API_BASE}/groups/${params.groupId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: params.chatId }),
  });
  if (!r.ok) return { ok: false };
  return r.json();
}

export async function removeGroupMember(groupId: string, memberChatId: string, byChatId: string): Promise<{ ok: boolean }> {
  const r = await fetch(
    `${import.meta.env.VITE_API_BASE}/groups/${groupId}/members/${memberChatId}?byChatId=${encodeURIComponent(byChatId)}`,
    { method: 'DELETE' }
  );
  return { ok: r.ok };
}





export async function leaveGroup(groupId: string, chatId: string): Promise<{ ok: boolean }> {
  const r = await fetch(`${import.meta.env.VITE_API_BASE}/groups/${groupId}/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId }),
  });
  return { ok: r.ok };
}



// src/api.ts
export async function prepareGroupShareMessage(groupId: string, params: {
  userId: number;
  allowGroups?: boolean;
  withButton?: boolean;
}): Promise<{ ok: boolean; preparedMessageId?: string }> {
  const r = await fetch(`${import.meta.env.VITE_API_BASE}/groups/${groupId}/share-prepared`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!r.ok) return { ok: false };
  return r.json();
}

