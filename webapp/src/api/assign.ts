// src/api/assign.ts
// src/api/assign.ts
const API = (import.meta as any).env.VITE_API_BASE || '';

type Json = Record<string, any>;


async function post<T = Json>(url: string, body: Json): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await r.json()) as T;
}

/** Назначить себя ответственным сразу */
export async function assignSelf(taskId: string, chatId: string) {
  return post(`${API}/assign/self`, { taskId, chatId });
}

/** Создать инвайт-токен на задачу (возвращает ссылку startapp) */
export async function createAssignInvite(taskId: string) {
  return post(`${API}/assign/invite`, { taskId });
}

/** Отправить приглашение выбранному участнику в ЛС Telegram */
export async function pingMemberDM(taskId: string, toChatId: string) {
  return post(`${API}/assign/ping`, { taskId, toChatId });
}
