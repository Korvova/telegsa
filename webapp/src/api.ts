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

/* ---------- Config ---------- */
const API_BASE = import.meta.env.VITE_API_BASE || ''; // напр. '/api' или 'https://rms-bot.com/api'

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


export type Group = {
  id: string;
  title: string;
  kind: 'own' | 'member';
  ownerName?: string | null; // ⬅️ новое поле
};

export function reopenTask(id: string) {
  return ky.post(`${API_BASE}/tasks/${id}/reopen`).json<{ ok: boolean; task: Task }>();
}

export function getTaskWithGroup(id: string) {
  return ky
    .get(`${API_BASE}/tasks/${id}`)
    .json<{ ok: boolean; task: Task; groupId: string | null; phase?: 'Inbox' | 'Doing' | 'Done' | string }>();
}




