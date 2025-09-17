const API = (import.meta as any).env.VITE_API_BASE || '';

export async function listWatchers(taskId: string): Promise<{ ok: boolean; watchers: { chatId: string; name: string }[] }>
{
  const r = await fetch(`${API}/tasks/${encodeURIComponent(taskId)}/watchers`);
  return r.json();
}

export async function subscribe(taskId: string, chatId: string) {
  const r = await fetch(`${API}/tasks/${encodeURIComponent(taskId)}/watchers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId })
  });
  return r.json();
}

export async function unsubscribe(taskId: string, chatId: string) {
  const r = await fetch(`${API}/tasks/${encodeURIComponent(taskId)}/watchers?chatId=${encodeURIComponent(chatId)}`, { method: 'DELETE' });
  return r.json();
}

export async function createWatcherInvite(taskId: string) {
  const r = await fetch(`${API}/watchers/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId }) });
  return r.json() as Promise<{ ok: boolean; tmeStartApp?: string; token?: string } >;
}

