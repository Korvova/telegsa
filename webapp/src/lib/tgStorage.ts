//tgStorage.ts
import WebApp from '@twa-dev/sdk';

type Json = any;

const hasCloud = !!WebApp?.CloudStorage;

export async function tgGetItem(key: string): Promise<string | null> {
  if (hasCloud) {
    return new Promise((resolve) => {
      WebApp.CloudStorage.getItem(key, (err, value) => {
        if (err) return resolve(null);
        resolve(value ?? null);
      });
    });
  }
  try {
    return localStorage.getItem(key);
  } catch { return null; }
}

export async function tgSetItem(key: string, value: string): Promise<boolean> {
  if (hasCloud) {
    return new Promise((resolve) => {
      WebApp.CloudStorage.setItem(key, value, (err, ok) => resolve(!err && !!ok));
    });
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch { return false; }
}

export async function tgGetJSON<T = Json>(key: string): Promise<T | null> {
  const s = await tgGetItem(key);
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

export async function tgSetJSON(key: string, obj: Json): Promise<boolean> {
  try {
    const s = JSON.stringify(obj);
    return await tgSetItem(key, s);
  } catch {
    return false;
  }
}
