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

export function createShareLink(taskId: string) {
  return post(`${API}/sharenewtask/link`, { taskId });
}

export function acceptShare(taskId: string, chatId: string, token: string) {
  return post(`${API}/sharenewtask/accept`, { taskId, chatId, token });
}
