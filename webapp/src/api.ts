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
  deadlineAt?: string | null;
  nextReminderAt?: string | null;
  acceptCondition?: 'NONE' | 'PHOTO' | 'APPROVAL';
  bountyStars?: number;
  bountyStatus?: 'NONE' | 'PLEDGED' | 'PAID' | 'REFUNDED';

    fromProcess?: boolean; // 🔀

  // назначение
  assigneeChatId?: string | null;
  assigneeName?: string | null;

  // ⬇️ поля события (при type === 'EVENT')
  type?: 'TASK' | 'EVENT';
  startAt?: string | null;
  endAt?: string | null;

  // сервисные поля
  creatorName?: string | null;
  meIsOrganizer?: boolean;
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
  ownerName?: string | null;
};




export type TaskMedia = {
  id: string;
  kind: 'photo' | 'document' | 'voice';
  url: string;            // /files/<mediaId>
  fileName?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  fileSize?: number | null;
};









/* ---------- Config ---------- */
export const API_BASE = import.meta.env.VITE_API_BASE || ''; // '/telegsar-api'

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
    .json<{
      ok: boolean;
      task: Task;
      groupId: string | null;
      phase?: 'Inbox' | 'Doing' | 'Done' | string;
      media?: TaskMedia[];
    }>();
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

/* ---------- Group members ---------- */

export type GroupMember = {
  chatId: string;
  name?: string | null;
  role?: 'owner' | 'member' | 'invited';
  assignedCount?: number;
};

export async function getGroupMembers(groupId: string): Promise<{
  ok: boolean;
  owner?: GroupMember;
  members: GroupMember[];
}> {
  const r = await fetch(`${API_BASE}/groups/${groupId}/members`, {
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
  const r = await fetch(`${API_BASE}/groups/${params.groupId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: params.chatId }),
  });
  if (!r.ok) return { ok: false };
  return r.json();
}

export async function removeGroupMember(groupId: string, memberChatId: string, byChatId: string): Promise<{ ok: boolean }> {
  const r = await fetch(
    `${API_BASE}/groups/${groupId}/members/${memberChatId}?byChatId=${encodeURIComponent(byChatId)}`,
    { method: 'DELETE' }
  );
  return { ok: r.ok };
}

export async function leaveGroup(groupId: string, chatId: string): Promise<{ ok: boolean }> {
  const r = await fetch(`${API_BASE}/groups/${groupId}/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId }),
  });
  return { ok: r.ok };
}

export async function prepareGroupShareMessage(groupId: string, params: {
  userId: number;
  allowGroups?: boolean;
  withButton?: boolean;
}): Promise<{ ok: boolean; preparedMessageId?: string }> {
  const r = await fetch(`${API_BASE}/groups/${groupId}/share-prepared`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!r.ok) return { ok: false };
  return r.json();
}

/* ---------- Comments ---------- */

export type TaskComment = {
  id: string;
  taskId: string;
  authorChatId: string;
  authorName?: string | null;
  text: string;
  createdAt: string;
};

export async function listComments(taskId: string): Promise<{ ok: boolean; comments: TaskComment[] }> {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/comments`);
  return r.json();
}

export async function addComment(taskId: string, chatId: string, text: string) {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorChatId: chatId, text }),
  });
  return r.json();
}

export async function deleteComment(taskId: string, commentId: string, chatId: string): Promise<{ ok: boolean }> {
  const url = `${API_BASE}/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}?chatId=${encodeURIComponent(chatId)}`;
  const r = await fetch(url, { method: 'DELETE' });
  return r.json();
}

/* ---------- Events API ---------- */
export type EventItem = {
  id: string;
  text: string;       // ← сервер отдаёт text
  type: 'EVENT';
  startAt: string;
  endAt?: string | null;
  chatId: string;
  groupId?: string | null;
};


export type EventParticipant = {
  chatId: string;
  role: 'ORGANIZER' | 'PARTICIPANT';
  name?: string | null;
};

export async function listEvents(chatId: string, groupId?: string | null) {
  const sp = new URLSearchParams();
  sp.set('chatId', chatId);
  if (groupId) sp.set('groupId', groupId);
  const r = await fetch(`${API_BASE}/events?${sp.toString()}`);
  return r.json() as Promise<{ ok: boolean; events: EventItem[] }>;
}

export async function createEvent(params: {
  chatId: string;
  groupId?: string | null;
  title: string;
  startAt: string;
  endAt?: string | null;
}) {
  const r = await fetch(`${API_BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // шлём и title, и text — совместимость с бэком
    body: JSON.stringify({
      chatId: params.chatId,
      groupId: params.groupId ?? null,
      title: params.title,
      text: params.title,
      startAt: params.startAt,
      endAt: params.endAt ?? null,
    }),
  });
  return r.json() as Promise<{ ok: boolean; event: EventItem }>;
}







export async function getEvent(id: string) {
  const r = await fetch(`${API_BASE}/events/${id}`);
  return r.json() as Promise<{ ok: boolean; event: EventItem }>;
}

export async function updateEvent(
  id: string,
  byChatId: string,
  patch: Partial<Pick<EventItem, 'text' | 'startAt' | 'endAt'>>
) {
  const r = await fetch(`${API_BASE}/events/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ byChatId, ...patch }),
  });
  return r.json() as Promise<{ ok: boolean; event: EventItem }>;
}

export async function deleteEvent(id: string, byChatId: string) {
  const url = `${API_BASE}/events/${id}?byChatId=${encodeURIComponent(byChatId)}`;
  const r = await fetch(url, { method: 'DELETE' });
  return r.json() as Promise<{ ok: boolean }>;
}

// participants
export async function listEventParticipants(eventId: string) {
  const r = await fetch(`${API_BASE}/events/${eventId}/participants`);
  return r.json() as Promise<{ ok: boolean; participants: EventParticipant[] }>;
}

export async function addEventParticipant(
  eventId: string,
  byChatId: string,
  chatId: string,
  role: 'PARTICIPANT' | 'ORGANIZER' = 'PARTICIPANT'
) {
  const r = await fetch(`${API_BASE}/events/${eventId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ byChatId, chatId, role }),
  });
  return r.json() as Promise<{ ok: boolean }>;
}

export async function removeEventParticipant(eventId: string, targetChatId: string, byChatId: string) {
  const url = `${API_BASE}/events/${eventId}/participants/${encodeURIComponent(targetChatId)}?byChatId=${encodeURIComponent(byChatId)}`;
  const r = await fetch(url, { method: 'DELETE' });
  return r.json() as Promise<{ ok: boolean }>;
}

// reminders (per-user)
export async function getMyEventReminders(eventId: string, _chatId: string) {
  // сервер возвращает {ok, offsets, reminders: [...]}, chatId в query не обязателен
  const r = await fetch(`${API_BASE}/events/${eventId}/reminders`);
  return r.json() as Promise<{ ok: boolean; offsets: number[]; reminders: { id: string; offsetMinutes: number }[] }>;
}

export async function setMyEventReminders(eventId: string, byChatId: string, offsets: number[]) {
  const r = await fetch(`${API_BASE}/events/${eventId}/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ byChatId, offsets }), // ⬅️ ВАЖНО: byChatId
  });
  return r.json() as Promise<{ ok: boolean; count: number }>;
}

export async function primeEventReminders(eventId: string, byChatId: string) {
  const r = await fetch(`${API_BASE}/events/${eventId}/reminders/prime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ byChatId }),
  });
  return r.json() as Promise<{ ok: boolean; primed: number; skipped: string[] }>;
}

// invite for EVENT
export async function createEventInvite(eventId: string, chatId: string) {
  const r = await fetch(`${API_BASE}/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, type: 'event', eventId }),
  });
  return r.json() as Promise<{ ok: boolean; token: string; link: string; shareText?: string }>;
}



/* ---------- Process API ---------- */

export type ProcessRecord = {
  id: string;
  groupId: string;
  title?: string | null;
  runMode: 'MANUAL' | 'SCHEDULE' | string;
  scheduleRRule?: string | null;
  timezone?: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ProcessNodeDTO = {
  id: string;
  processId: string;
  title: string;
  posX: number;
  posY: number;

  // роли
  assigneeChatId?: string | null;
  createdByChatId?: string | null;

  // тип/статус
  type: 'TASK' | 'EVENT';
  status: string;

  // условия запуска/отмены
  startMode: 'AFTER_ANY' | 'AFTER_SELECTED' | 'AT_DATE' | 'AT_DATE_AND_SELECTED' | 'AFTER_DAYS_AND_SELECTED';
  startDate?: string | null;
  startAfterDays?: number | null;
  cancelMode: 'NONE' | 'IF_ANY_SELECTED_CANCELED';

  // реальная задача (если создана)
  taskId?: string | null;

  // расширение
  metaJson?: any;

  createdAt: string;
};

export type ProcessEdgeDTO = {
  id: string;
  processId: string;
  sourceNodeId: string;
  targetNodeId: string;
  enabled: boolean;
};


export async function fetchProcess(groupId: string) {
  const r = await fetch(`${API_BASE}/groups/${groupId}/process`);
  const data = await r.json().catch(() => ({}));
  return data as {
    ok: boolean;
    process: ProcessRecord | null;
    nodes: ProcessNodeDTO[];
    edges: ProcessEdgeDTO[];
  };
}


 // для главной



export async function saveProcess(payload: {
  groupId: string;
  chatId: string;
  process?: { runMode?: 'MANUAL' | 'SCHEDULE' };
  nodes: Array<{
    id?: string;
    title: string;
    posX: number;
    posY: number;

    assigneeChatId?: string | null;
    createdByChatId?: string | null;

    type?: 'TASK' | 'EVENT';
    status?: string;

    startMode?: 'AFTER_ANY' | 'AFTER_SELECTED' | 'AT_DATE' | 'AT_DATE_AND_SELECTED' | 'AFTER_DAYS_AND_SELECTED';
    startDate?: string | null;       // ISO
    startAfterDays?: number | null;

    cancelMode?: 'NONE' | 'IF_ANY_SELECTED_CANCELED';

    watchers?: string[]; // chatIds наблюдателей (опционально)

    taskId?: string | null;
    metaJson?: any;
  }>;
  edges: Array<{ id?: string; source: string; target: string; enabled?: boolean }>;
}): Promise<{ ok: boolean; processId?: string; error?: string }> {
  const r = await fetch(`${API_BASE}/groups/${payload.groupId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId: payload.chatId,
      nodes: payload.nodes,
      edges: payload.edges,
      // backend сейчас это поле может игнорировать — прокидываем на будущее
      process: payload.process ?? undefined,
    }),
  });

  const data = await r.json().catch(() => ({}));
  return data as { ok: boolean; processId?: string; error?: string };
}



export async function uploadTaskMedia(taskId: string, chatId: string, file: File) {
  const form = new FormData();
  form.append('file', file, file.name);
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/media?chatId=${encodeURIComponent(chatId)}`, {
    method: 'POST',
    body: form,
  });
  return r.json() as Promise<{ ok: boolean; media?: TaskMedia }>;
}




export type TaskFeedItem = {
  id: string;
  text: string;
  updatedAt: string;
  createdAt: string;
  deadlineAt?: string | null;
  acceptCondition?: 'NONE' | 'PHOTO' | 'APPROVAL';
  bountyStars?: number;
  bountyStatus?: 'NONE' | 'PLEDGED' | 'PAID' | 'REFUNDED';
  status: string;
  groupId: string | null;
  groupTitle: string;
  creatorChatId: string;
  creatorName: string;
  assigneeChatId: string | null;
  assigneeName: string | null;

  labels?: { id: string; title: string }[];
  
  labelTitles?: string[];


    fromProcess?: boolean;       // ← новый флаг
  taskType?: 'TASK' | 'EVENT'; // ← если пробросишь из бэка


};

export async function listMyFeed(params: {
  chatId: string;
  role?: 'all' | 'creator' | 'assignee' | 'watcher';
  statuses?: string[]; // ['Новые','В работе',...]
  q?: string;
  sort?: 'updated_desc' | 'updated_asc';
  offset?: number;
  limit?: number;
}): Promise<{ ok: boolean; items: TaskFeedItem[]; nextOffset: number; hasMore: boolean }> {
  const API = API_BASE || (import.meta as any).env.VITE_API_BASE || '';
  const qs = new URLSearchParams();
  qs.set('chatId', params.chatId);
  if (params.role) qs.set('role', params.role);
  if (params.statuses?.length) qs.set('statuses', params.statuses.join(','));
  if (params.q) qs.set('q', params.q);
  if (params.sort) qs.set('sort', params.sort);
  if (typeof params.offset === 'number') qs.set('offset', String(params.offset));
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  const r = await fetch(`${API}/tasks/feed?` + qs.toString());
  return r.json();
}



// ==== STT (Whisper.cpp via backend) ====
export async function transcribeVoice(file: File, lang = 'ru'): Promise<{ ok: boolean; text?: string; error?: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/stt/whisper?lang=${encodeURIComponent(lang)}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`STT failed: ${res.status} ${msg}`);
  }
  return res.json();
}











// === Labels API ===
export type GroupLabel = {
  id: string;
  title: string;
  color?: string | null;
  order: number;
};

const BASE = import.meta.env.VITE_API_BASE;

/** Список ярлыков группы (создаст дефолтные при первом вызове) */
export async function getGroupLabels(groupId: string): Promise<GroupLabel[]> {
  const r = await fetch(`${BASE}/groups/${encodeURIComponent(groupId)}/labels`);
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'getGroupLabels_failed');
  return j.labels as GroupLabel[];
}

/** Создать ярлык в группе (только владелец) */
export async function createGroupLabel(
  groupId: string,
  params: { chatId: string | number; title: string; color?: string | null; order?: number }
): Promise<GroupLabel> {
  const r = await fetch(`${BASE}/groups/${encodeURIComponent(groupId)}/labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'createGroupLabel_failed');
  return j.label as GroupLabel;
}

/** Обновить ярлык (только владелец): можно менять title/color/order */
export async function updateGroupLabel(
  groupId: string,
  labelId: string,
  params: { chatId: string | number; title?: string; color?: string | null; order?: number }
): Promise<GroupLabel> {
  const r = await fetch(
    `${BASE}/groups/${encodeURIComponent(groupId)}/labels/${encodeURIComponent(labelId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }
  );
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'updateGroupLabel_failed');
  return j.label as GroupLabel;
}

/** Удалить ярлык (только владелец) */
export async function deleteGroupLabel(
  groupId: string,
  labelId: string,
  chatId: string | number
): Promise<void> {
  const r = await fetch(
    `${BASE}/groups/${encodeURIComponent(groupId)}/labels/${encodeURIComponent(labelId)}?chatId=${encodeURIComponent(
      String(chatId)
    )}`,
    { method: 'DELETE' }
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'deleteGroupLabel_failed');
}

/** Повесить ярлыки на задачу (участник или владелец группы) */
export async function attachTaskLabels(
  taskId: string,
  chatId: string | number,
  labelIds: string[]
): Promise<GroupLabel[]> {
  const r = await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, labelIds }),
  });
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'attachTaskLabels_failed');
  return j.labels as GroupLabel[];
}

/** Снять один ярлык с задачи (участник или владелец группы) */
export async function removeTaskLabel(
  taskId: string,
  labelId: string,
  chatId: string | number
): Promise<void> {
  const r = await fetch(
    `${BASE}/tasks/${encodeURIComponent(taskId)}/labels/${encodeURIComponent(labelId)}?chatId=${encodeURIComponent(
      String(chatId)
    )}`,
    { method: 'DELETE' }
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'removeTaskLabel_failed');
}




/** Текущие ярлыки задачи */
export async function getTaskLabels(taskId: string): Promise<GroupLabel[]> {
  const r = await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/labels`);
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'getTaskLabels_failed');
  return j.labels as GroupLabel[];
}

// ==== Deadline API ====
export async function setTaskDeadline(taskId: string, chatId: string, deadlineAt: string | null) {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/deadline`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, deadlineAt }),
  });
  const j = await r.json().catch(() => ({}));
  return j as { ok: boolean; task?: Task; error?: string };
}

// ==== Bounty (virtual stars) API ====
export async function setTaskBounty(taskId: string, chatId: string, amount: number) {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/bounty`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, amount }),
  });
  return r.json() as Promise<{ ok: boolean; task?: Task }>;
}

export async function fakeDeposit(taskId: string, chatId: string, amount: number) {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/deposit/fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, amount }),
  });
  return r.json() as Promise<{ ok: boolean }>;
}

export async function getPayoutMethod(chatId: string) {
  const r = await fetch(`${API_BASE}/payout-method?chatId=${encodeURIComponent(chatId)}`);
  return r.json() as Promise<{ ok: boolean; method?: { chatId: string; phone: string; bankCode?: string } | null }>;
}

export async function setPayoutMethod(chatId: string, phone: string, bankCode?: string) {
  const r = await fetch(`${API_BASE}/payout-method`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, phone, bankCode }),
  });
  return r.json();
}

export async function getStarsSummary(chatId: string) {
  const r = await fetch(`${API_BASE}/stars/summary?chatId=${encodeURIComponent(chatId)}`);
  return r.json() as Promise<{ ok: boolean; received: number; sent: number }>;
}

// ==== Likes API ====
export async function getTaskLikes(taskId: string, chatId?: string) {
  const u = new URL(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/likes`, window.location.origin);
  if (chatId) u.searchParams.set('chatId', chatId);
  const r = await fetch(u.toString().replace(window.location.origin, ''));
  return r.json() as Promise<{ ok: boolean; count: number; me?: boolean }>;
}
export async function likeTask(taskId: string, chatId: string) {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/likes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId }) });
  return r.json() as Promise<{ ok: boolean; count: number; me: boolean }>;
}
export async function unlikeTask(taskId: string, chatId: string) {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/likes?chatId=${encodeURIComponent(chatId)}`, { method: 'DELETE' });
  return r.json() as Promise<{ ok: boolean; count: number; me: boolean }>;
}
export async function getCommentLikes(taskId: string, commentId: string, chatId?: string) {
  const url = `${API_BASE}/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}/likes` + (chatId ? `?chatId=${encodeURIComponent(chatId)}` : '');
  const r = await fetch(url);
  return r.json() as Promise<{ ok: boolean; count: number; me?: boolean }>;
}
export async function likeComment(taskId: string, commentId: string, chatId: string) {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}/likes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId }) });
  return r.json() as Promise<{ ok: boolean; count: number; me: boolean }>;
}
export async function unlikeComment(taskId: string, commentId: string, chatId: string) {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}/likes?chatId=${encodeURIComponent(chatId)}`, { method: 'DELETE' });
  return r.json() as Promise<{ ok: boolean; count: number; me: boolean }>;
}

// ==== Accept condition API ====
export async function setAcceptCondition(
  taskId: string,
  chatId: string,
  condition: 'NONE' | 'PHOTO' | 'APPROVAL'
) {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/accept-condition`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, condition }),
  });
  const j = await r.json().catch(() => ({}));
  return j as { ok: boolean; task?: Task; error?: string };
}



export async function getTaskRelations(taskId: string): Promise<{ ok: boolean; outgoing: Array<{id:string;text:string}>; incoming: Array<{id:string;text:string}>; }> {
  const r = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/relations`);
  return r.json();
}
