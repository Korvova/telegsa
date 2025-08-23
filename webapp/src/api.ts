import ky from 'ky';




export type Group = {
  id: string;
  title: string;
  kind: 'own' | 'member'; // свои / где участвую
};






export type Task = {
  id: string;
  chatId: string;
  text: string;
  order: number;
  tgMessageId?: string | null;
  columnId: string;
  createdAt: string;
  updatedAt: string;
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

const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function fetchBoard(chatId: string) {
  const res = await ky.get(`${API_BASE}/tasks`, { searchParams: { chatId } }).json<{
    ok: boolean;
    columns: Column[];
  }>();
  return res;
}


export async function moveTask(taskId: string, toColumnId: string, toIndex: number) {
  return ky.patch(`${API_BASE}/tasks/${taskId}/move`, {
    json: { toColumnId, toIndex },
  }).json<{ ok: boolean; task: Task }>();
}


export async function getTask(id: string) {
  return ky.get(`${API_BASE}/tasks/${id}`).json<{ ok: boolean; task: Task }>();
}

export async function updateTask(id: string, text: string) {
  return ky.patch(`${API_BASE}/tasks/${id}`, { json: { text } })
    .json<{ ok: boolean; task: Task }>();
}

export async function completeTask(id: string) {
  return ky.post(`${API_BASE}/tasks/${id}/complete`).json<{ ok: boolean; task: Task }>();
}



export async function createTask(chatId: string, text: string) {
  return ky.post(`${API_BASE}/tasks`, { json: { chatId, text } })
    .json<{ ok: boolean; task: Task }>();
}


export async function createColumn(chatId: string, name: string) {
  return ky.post(`${API_BASE}/columns`, { json: { chatId, name } })
    .json<{ ok: boolean; column: Column }>();
}

export async function renameColumn(id: string, name: string) {
  return ky.patch(`${API_BASE}/columns/${id}`, { json: { name } })
    .json<{ ok: boolean; column: Column }>();
}


// === Groups API ===


export async function listGroups(chatId: string) {
  return ky.get(`${API_BASE}/groups`, { searchParams: { chatId } })
    .json<{ ok: boolean; groups: Group[] }>();
}

export async function createGroup(chatId: string, title: string) {
  return ky.post(`${API_BASE}/groups`, { json: { chatId, title } })
    .json<{ ok: boolean; group: Group }>();
}

export async function renameGroupTitle(id: string, chatId: string, title: string) {
  return ky.patch(`${API_BASE}/groups/${id}`, { json: { chatId, title } })
    .json<{ ok: boolean; group: Group }>();
}

export async function deleteGroup(id: string, chatId: string) {
  return ky.delete(`${API_BASE}/groups/${id}`, { searchParams: { chatId } })
    .json<{ ok: boolean }>();
}
