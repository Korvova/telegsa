import 'dotenv/config';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { tasksRouter } from './routes/tasks.js';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

/* ---------- Telegram helper ---------- */
async function tg(method, payload) {


const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`;



  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!data.ok) console.error('Telegram API error:', data);
  return data;
}

/* ---------- Short codes (без БД) ---------- */
function buildShortCodes(ids) {
  let len = 4;
  while (len <= 12) {
    const seen = new Map();
    let ok = true;
    for (const id of ids) {
      const pref = id.slice(0, len);
      if (seen.has(pref)) { ok = false; break; }
      seen.set(pref, id);
    }
    if (ok) {
      const map = {};
      for (const [pref, id] of seen.entries()) map[id] = pref;
      return map; // { <groupId>: <short> }
    }
    len++;
  }
  const map = {};
  for (const id of ids) map[id] = id.slice(0, 12);
  return map;
}

function parseGroupIdFromColumnName(name) {
  const sep = '::';
  const i = name.indexOf(sep);
  return i > 0 ? name.slice(0, i) : null;
}

async function userIsGroupMemberOrOwner(chatId, groupId) {
  const g = await prisma.group.findUnique({ where: { id: groupId } });
  if (!g) return false;
  if (g.ownerChatId === chatId) return true;
  const m = await prisma.groupMember.findFirst({ where: { groupId, chatId } });
  return Boolean(m);
}

function makeToken() {
  return crypto.randomBytes(16).toString('base64url');
}

/* ---------- Groups / Columns helpers ---------- */
const GROUP_SEP = '::';
const nameWithGroup = (groupId, plainName) =>
  groupId ? `${groupId}${GROUP_SEP}${plainName}` : plainName;
const stripGroupName = (name) => {
  const i = name.indexOf(GROUP_SEP);
  return i > 0 ? name.slice(i + GROUP_SEP.length) : name;
};

function resolveGroupId(raw) {
  const v = String(raw || '').trim();
  return v && v !== 'default' ? v : null;
}

// вернуть массив групп пользователя (ensure «Моя группа»)
async function getUserGroups(chatId) {
  let myGroups = await prisma.group.findMany({ where: { ownerChatId: chatId } });
  if (myGroups.length === 0) {
    const created = await prisma.group.create({
      data: { ownerChatId: chatId, title: 'Моя группа' },
    });
    myGroups = [created];
  }
  const memberLinks = await prisma.groupMember.findMany({
    where: { chatId },
    include: { group: true },
  });
  return [
    ...myGroups.map(g => ({ id: g.id, title: g.title, kind: 'own' })),
    ...memberLinks.map(m => ({ id: m.group.id, title: m.group.title, kind: 'member' })),
  ];
}

// по chatId + optional groupId создаёт Inbox/Doing/Done если их нет
async function ensureDefaultColumns(chatId, groupId = null) {
  const whereDefault = groupId
    ? { chatId, name: { startsWith: `${groupId}${GROUP_SEP}` } }
    : { chatId, name: { not: { contains: GROUP_SEP } } };

  const existing = await prisma.column.findMany({
    where: whereDefault,
    orderBy: { order: 'asc' },
  });
  if (existing.length) return existing;

  const base = [
    nameWithGroup(groupId, 'Inbox'),
    nameWithGroup(groupId, 'Doing'),
    nameWithGroup(groupId, 'Done'),
  ];

  const created = await prisma.$transaction(
    base.map((nm, i) =>
      prisma.column.create({
        data: { chatId, name: nm, order: i },
      })
    )
  );
  return created;
}

async function createTaskInGroup({ chatId, groupId, text }) {
  await ensureDefaultColumns(chatId, groupId);
  const inboxName = nameWithGroup(groupId, 'Inbox');
  const inbox = await prisma.column.findFirst({
    where: { chatId, name: inboxName },
  });
  if (!inbox) throw new Error('inbox_not_found');

  const last = await prisma.task.findFirst({
    where: { columnId: inbox.id },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? -1) + 1;

  const task = await prisma.task.create({
    data: {
      chatId,
      text: String(text || '').trim(),
      order: nextOrder,
      columnId: inbox.id,
    },
  });
  return task;
}

// обновить команды /g_* в конкретном чате
async function updateChatCommands(chatId) {
  const groups = await getUserGroups(chatId);
  const nonDefault = groups.filter(g => g.title !== 'Моя группа');
  const shortById = buildShortCodes(nonDefault.map(g => g.id));

  const commands = [
    { command: 'g_default', description: 'Моя группа (без группы)' },
    ...nonDefault.map(g => ({
      command: `g_${shortById[g.id]}`,
      description: g.title.substring(0, 64),
    })),
  ];

  await tg('setMyCommands', {
    commands,
    scope: { type: 'chat', chat_id: chatId },
  });
}

/* ---------- Health ---------- */
app.get('/health', (_req, res) => res.json({ ok: true, service: 'telegsar-api' }));

/* ---------- DELETE /tasks/:id из отдельного роутера ---------- */
app.use('/tasks', tasksRouter);

/* ---------- helper: имена ответственных в колонках ---------- */
async function enrichColumnsWithAssignees(columnsRaw) {
  const ids = Array.from(new Set(
    columnsRaw.flatMap(c => c.tasks)
      .map(t => t.assigneeChatId ? String(t.assigneeChatId) : null)
      .filter(Boolean)
  ));
  const users = ids.length ? await prisma.user.findMany({ where: { chatId: { in: ids } } }) : [];
  const nameByChat = new Map(
    users.map(u => [
      u.chatId,
      [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || u.chatId
    ])
  );

  return columnsRaw.map(c => ({
    ...c,
    name: stripGroupName(c.name),
    tasks: c.tasks.map(t => ({
      ...t,
      assigneeName: t.assigneeChatId ? nameByChat.get(String(t.assigneeChatId)) || null : null,
    })),
  }));
}

/* ---------- миграция: перенести колонки группы к владельцу ---------- */
async function adoptGroupColumnsToOwner(boardChatId, groupId) {
  const all = await prisma.column.findMany({
    where: { name: { startsWith: `${groupId}${GROUP_SEP}` } },
    orderBy: { order: 'asc' },
    include: { tasks: { orderBy: { order: 'asc' } } },
  });

  const aliens = all.filter(c => c.chatId !== boardChatId);
  if (!aliens.length) return;

  await ensureDefaultColumns(boardChatId, groupId);

  const ownerCols = await prisma.column.findMany({
    where: { chatId: boardChatId, name: { startsWith: `${groupId}${GROUP_SEP}` } },
    include: { tasks: true },
  });
  const ownerByShort = new Map(ownerCols.map(c => [stripGroupName(c.name), c]));

  for (const alien of aliens) {
    const short = stripGroupName(alien.name);
    const dst = ownerByShort.get(short);
    if (!dst) continue;

    await prisma.$transaction(async (tx) => {
      let base = await tx.task.count({ where: { columnId: dst.id } });
      for (const t of alien.tasks) {
        await tx.task.update({
          where: { id: t.id },
          data: {
            chatId: boardChatId,
            columnId: dst.id,
            order: base++,
          },
        });
      }
      await tx.column.delete({ where: { id: alien.id } });
    });
  }
}

/* ---------- Board (columns + tasks), group-aware ---------- */
app.get('/tasks', async (req, res) => {
  try {
    const chatId = String(req.query.chatId || '');
    const rawGroupId = String(req.query.groupId || '').trim();
    const onlyMine = ['1','true','yes'].includes(String(req.query.onlyMine || '').toLowerCase());
    const groupId = rawGroupId && rawGroupId !== 'default' ? rawGroupId : null;

    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId is required' });

    // ЛИЧНАЯ ДОСКА
    if (!groupId) {
      await ensureDefaultColumns(chatId, null);
      const columnsRaw = await prisma.column.findMany({
        where: { chatId, name: { not: { contains: GROUP_SEP } } },
        orderBy: { order: 'asc' },
        include: { tasks: { orderBy: { order: 'asc' } } },
      });

      let columns = await enrichColumnsWithAssignees(columnsRaw);
      if (onlyMine) {
        columns = columns.map(c => ({ ...c, tasks: c.tasks.filter(t => String(t.assigneeChatId || '') === chatId) }));
      }
      return res.json({ ok: true, columns });
    }

    // ГРУППОВАЯ ДОСКА (владелец = единый бэклог)
    const allowed = await userIsGroupMemberOrOwner(chatId, groupId);
    if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });

    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g) return res.status(404).json({ ok: false, error: 'group_not_found' });

    const boardChatId = g.ownerChatId;

    // гарантируем колонки и подтянем старые из аккаунтов участников
    await ensureDefaultColumns(boardChatId, groupId);
    await adoptGroupColumnsToOwner(boardChatId, groupId);

    const columnsRaw = await prisma.column.findMany({
      where: { chatId: boardChatId, name: { startsWith: `${groupId}${GROUP_SEP}` } },
      orderBy: { order: 'asc' },
      include: { tasks: { orderBy: { order: 'asc' } } },
    });

    let columns = await enrichColumnsWithAssignees(columnsRaw);
    if (onlyMine) {
      columns = columns.map(c => ({ ...c, tasks: c.tasks.filter(t => String(t.assigneeChatId || '') === chatId) }));
    }
    return res.json({ ok: true, columns });
  } catch (e) {
    console.error('GET /tasks error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/* ---------- Webhook (ТОЛЬКО через /g) ---------- */
app.post('/webhook', async (req, res) => {
  try {
    const secret = req.header('X-Telegram-Bot-Api-Secret-Token');
    if (!secret || secret !== process.env.WEBHOOK_SECRET) return res.sendStatus(403);

    const update = req.body;
    const msg = update?.message;

    if (msg?.text) {
      const chatId = String(msg.chat?.id || '');
      const text = String(msg.text).trim();

      // /g — обновить список команд
      if (text === '/g' || text === '/group' || text === '/groups' || text === '/refresh') {
        await updateChatCommands(chatId);
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Команды обновлены. Наберите "/" и выберите группу. Подсказка: можно долго удерживать команду, чтобы вставить её в поле ввода.',
        });
        return res.sendStatus(200);
      }

      // /g_<short> <текст>  или /g_default <текст>
      const m = text.match(/^\/g_([a-z0-9]+)\s*(.*)$/i);
      if (m) {
        const short = m[1];
        const rest = (m[2] || '').trim();

        if (!rest) {
          await tg('sendMessage', {
            chat_id: chatId,
            text: `Добавьте текст после команды. Пример: /g_${short} Купить молоко`,
          });
          return res.sendStatus(200);
        }

        let groupId = null; // default
        if (short !== 'default') {
          const all = await getUserGroups(chatId);
          const nonDefault = all.filter(g => g.title !== 'Моя группа');
          const shortById = buildShortCodes(nonDefault.map(g => g.id));
          const hit = Object.entries(shortById).find(([, s]) => s === short);
          if (!hit) {
            await tg('sendMessage', {
              chat_id: chatId,
              text: 'Неизвестный код группы. Наберите /g чтобы обновить список.',
            });
            return res.sendStatus(200);
          }
          groupId = hit[0];
        }

        try {
          const task = await createTaskInGroup({ chatId, groupId, text: rest });


const sent = await tg('sendMessage', {
  chat_id: chatId,
  text: `Задача создана: ${task.text}`,
  disable_notification: true,



reply_markup: {
  inline_keyboard: [[
    { text: 'Открыть задачу', url: `https://t.me/${process.env.BOT_USERNAME}/${process.env.APP_SHORT_NAME}?startapp=task_${task.id}` }
  ]]
}



});
try {
  if (sent?.ok && sent.result?.message_id) {
    await prisma.task.update({
      where: { id: task.id },
      data: { sourceChatId: chatId, sourceMessageId: sent.result.message_id }
    });
  }
} catch (e) { console.warn('store source msg failed', e); }




        } catch (e) {
          console.error('create by /g_<short> error:', e);
          await tg('sendMessage', { chat_id: chatId, text: 'Не удалось создать задачу.' });
        }
        return res.sendStatus(200);
      }

      // любое сообщение → задача в дефолтной группе
      if (msg?.chat?.type === 'private') {
        try { await tg('deleteMessage', { chat_id: chatId, message_id: msg.message_id }); } catch {}
      }
      const created = await createTaskInGroup({ chatId, groupId: null, text });
const sent = await tg('sendMessage', {
  chat_id: chatId,
  text: `Задача создана: ${created.text}`,
  disable_notification: true,



reply_markup: {
  inline_keyboard: [[
    { text: 'Открыть задачу',
      url: `https://t.me/${process.env.BOT_USERNAME}?startapp=task_${created.id}` }
  ]]
}




});
try {
  if (sent?.ok && sent.result?.message_id) {
    await prisma.task.update({
      where: { id: created.id },
      data: { sourceChatId: chatId, sourceMessageId: sent.result.message_id }
    });
  }
} catch (e) { console.warn('store source msg failed', e); }


      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error:', e);
    res.sendStatus(200);
  }
});

/* ============ Tasks API (move/get/update/complete/create) ============ */
app.patch('/tasks/:id/move', async (req, res) => {
  try {
    const taskId = String(req.params.id);
    const { toColumnId, toIndex } = req.body || {};
    if (typeof toColumnId !== 'string' || typeof toIndex !== 'number') {
      return res.status(400).json({ ok: false, error: 'toColumnId (string) и toIndex (number) обязательны' });
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return res.status(404).json({ ok: false, error: 'task not found' });

    const fromColumnId = task.columnId;
    if (fromColumnId === toColumnId && toIndex === task.order) {
      return res.json({ ok: true, task });
    }

    const [fromCol, toCol] = await Promise.all([
      prisma.column.findUnique({ where: { id: fromColumnId } }),
      prisma.column.findUnique({ where: { id: toColumnId } }),
    ]);
    if (!toCol || !fromCol || toCol.chatId !== task.chatId) {
      return res.status(400).json({ ok: false, error: 'invalid toColumnId' });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (fromColumnId === toColumnId) {
        if (toIndex < task.order) {
          await tx.task.updateMany({
            where: { columnId: fromColumnId, order: { gte: toIndex, lt: task.order } },
            data: { order: { increment: 1 } },
          });
        } else {
          await tx.task.updateMany({
            where: { columnId: fromColumnId, order: { lte: toIndex, gt: task.order } },
            data: { order: { decrement: 1 } },
          });
        }
        const updated = await tx.task.update({ where: { id: taskId }, data: { order: toIndex } });
        return updated;
      } else {
        await tx.task.updateMany({
          where: { columnId: fromColumnId, order: { gt: task.order } },
          data: { order: { decrement: 1 } },
        });
        await tx.task.updateMany({
          where: { columnId: toColumnId, order: { gte: toIndex } },
          data: { order: { increment: 1 } },
        });
        const updated = await tx.task.update({
          where: { id: taskId },
          data: { columnId: toColumnId, order: toIndex },
        });
        return updated;
      }
    });

    res.json({ ok: true, task: result });
  } catch (e) {
    console.error('PATCH /tasks/:id/move error:', e);
    res.status(500).json({ ok: false });
  }
});

app.get('/tasks/:id', async (req, res) => {
  try {
    const id = String(req.params.id);

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ ok: false, error: 'not_found' });

    let groupId = null;
    let phase = null;
    try {
      const col = await prisma.column.findUnique({ where: { id: task.columnId } });
      if (col) {
        const nm = stripGroupName(col.name); // 'Inbox' | 'Doing' | 'Done' | ...
        phase = nm;
        const i = col.name.indexOf(GROUP_SEP);
        groupId = i > 0 ? col.name.slice(0, i) : null;
      }
    } catch {}

    let assigneeName = null;
    if (task.assigneeChatId) {
      try {
        const u = await prisma.user.findUnique({ where: { chatId: String(task.assigneeChatId) } });
        if (u) assigneeName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || String(task.assigneeChatId);
      } catch {}
    }

    res.json({ ok: true, task: { ...task, assigneeName }, groupId, phase });
  } catch (e) {
    console.error('GET /tasks/:id error', e);
    res.status(500).json({ ok: false });
  }
});

/* ---------- User profile (для ownerName/assigneeName) ---------- */
app.post('/me', async (req, res) => {
  try {
    const { chatId, firstName, lastName, username } = req.body || {};
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });

    await prisma.user.upsert({
      where: { chatId: String(chatId) },
      create: {
        chatId: String(chatId),
        firstName: firstName || null,
        lastName: lastName || null,
        username: username || null,
      },
      update: {
        firstName: firstName || null,
        lastName: lastName || null,
        username: username || null,
      },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('POST /me error:', e);
    res.status(500).json({ ok: false });
  }
});

app.patch('/tasks/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { text, assigneeChatId } = req.body || {};

    const data = {};
    if (typeof text === 'string' && text.trim()) data.text = text.trim();
    if (typeof assigneeChatId === 'string' || assigneeChatId === null) {
      data.assigneeChatId = assigneeChatId ?? null;
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ ok: false, error: 'nothing_to_update' });
    }

    const updated = await prisma.task.update({ where: { id }, data });
    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('PATCH /tasks/:id error:', e);
    res.status(500).json({ ok: false });
  }
});

/* ---------- Invites ---------- */
app.post('/invites', async (req, res) => {
  try {
    const { chatId, type, taskId, groupId: rawGroupId } = req.body || {};
    const inviter = String(chatId || '');

    if (!inviter || (type !== 'task' && type !== 'group')) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }

    let groupId = String(rawGroupId || '') || null;
    let task = null;

    if (type === 'task') {
      if (!taskId) return res.status(400).json({ ok: false, error: 'taskId required' });
      task = await prisma.task.findUnique({
        where: { id: String(taskId) },
        include: { column: true },
      });
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });
      groupId = parseGroupIdFromColumnName(task.column.name); // может быть null (личная)
    } else if (type === 'group') {
      if (!rawGroupId) return res.status(400).json({ ok: false, error: 'groupId required' });
      groupId = String(rawGroupId);
    }

    if (groupId) {
      const allowed = await userIsGroupMemberOrOwner(inviter, groupId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const token = makeToken();
    const created = await prisma.inviteTicket.create({
      data: {
        token,
        type: type === 'task' ? 'TASK' : 'GROUP',
        status: 'ACTIVE',
        groupId: groupId ?? (await prisma.group.findFirst({ where: { ownerChatId: inviter, title: 'Моя группа' } })).id,
        taskId: type === 'task' ? String(taskId) : null,
        invitedByChatId: inviter,
      }
    });

    let link = '';
    let shareText = '';
    if (created.type === 'TASK') {
      link = `https://t.me/telegsar_bot?startapp=assign__${created.taskId}__${created.token}`;
      shareText = `Назначаю тебя ответственным по задаче. Открой ссылку:`;
    } else {
      link = `https://t.me/telegsar_bot?startapp=join__${created.groupId}__${created.token}`;
      shareText = `Приглашаю тебя в группу. Открой ссылку:`;
    }

    return res.json({ ok: true, token, link, shareText });
  } catch (e) {
    console.error('POST /invites error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

app.post('/invites/accept', async (req, res) => {
  try {
    const { chatId, token } = req.body || {};
    const who = String(chatId || '');
    const tok = String(token || '');
    if (!who || !tok) return res.status(400).json({ ok: false, error: 'bad_request' });

    const invite = await prisma.inviteTicket.findUnique({ where: { token: tok } });
    if (!invite || invite.status !== 'ACTIVE') {
      return res.status(410).json({ ok: false, error: 'invite_invalid' });
    }

    const isMember = await userIsGroupMemberOrOwner(who, invite.groupId);
    if (!isMember) {
      await prisma.groupMember.create({
        data: { groupId: invite.groupId, chatId: who, role: 'member' }
      });
    }

    let assigned = false;
    if (invite.type === 'TASK' && invite.taskId) {
      await prisma.task.update({
        where: { id: invite.taskId },
        data: { assigneeChatId: who }
      });
      assigned = true;
    }

    await prisma.inviteTicket.update({
      where: { token: tok },
      data: { status: 'USED' }
    });

    return res.json({ ok: true, groupId: invite.groupId, taskId: invite.taskId ?? null, assigned });
  } catch (e) {
    console.error('POST /invites/accept error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/* ---------- Complete / Reopen ---------- */
app.post('/tasks/:id/complete', async (req, res) => {
  try {
    const id = String(req.params.id);
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ ok: false, error: 'task not found' });

    const curCol = await prisma.column.findUnique({ where: { id: task.columnId } });
    if (!curCol) return res.status(500).json({ ok: false, error: 'column_not_found' });

    const i = curCol.name.indexOf(GROUP_SEP);
    const groupId = i > 0 ? curCol.name.slice(0, i) : null;

    await ensureDefaultColumns(task.chatId, groupId);
    const doneName = nameWithGroup(groupId, 'Done');
    const done = await prisma.column.findFirst({ where: { chatId: task.chatId, name: doneName } });
    if (!done) return res.status(500).json({ ok: false, error: 'Done column not found' });

    if (task.columnId === done.id) {
      const count = await prisma.task.count({ where: { columnId: done.id } });
      const lastIndex = count - 1;
      if (task.order === lastIndex) return res.json({ ok: true, task });

      const updated = await prisma.$transaction(async (tx) => {
        await tx.task.updateMany({
          where: { columnId: done.id, order: { gt: task.order } },
          data: { order: { decrement: 1 } },
        });
        return tx.task.update({ where: { id }, data: { order: lastIndex } });
      });
      return res.json({ ok: true, task: updated });
    }

    const toIndex = await prisma.task.count({ where: { columnId: done.id } });
    const fromColumnId = task.columnId;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { columnId: fromColumnId, order: { gt: task.order } },
        data: { order: { decrement: 1 } },
      });
      return tx.task.update({ where: { id }, data: { columnId: done.id, order: toIndex } });
    });

    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('POST /tasks/:id/complete error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

app.post('/tasks/:id/reopen', async (req, res) => {
  try {
    const id = String(req.params.id);
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ ok: false, error: 'task not found' });

    const curCol = await prisma.column.findUnique({ where: { id: task.columnId } });
    if (!curCol) return res.status(500).json({ ok: false, error: 'column_not_found' });

    const i = curCol.name.indexOf(GROUP_SEP);
    const groupId = i > 0 ? curCol.name.slice(0, i) : null;

    await ensureDefaultColumns(task.chatId, groupId);
    const doingName = nameWithGroup(groupId, 'Doing');
    const doing = await prisma.column.findFirst({ where: { chatId: task.chatId, name: doingName } });
    if (!doing) return res.status(500).json({ ok: false, error: 'Doing column not found' });

    const toIndex = await prisma.task.count({ where: { columnId: doing.id } });
    const fromColumnId = task.columnId;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { columnId: fromColumnId, order: { gt: task.order } },
        data: { order: { decrement: 1 } },
      });
      return tx.task.update({ where: { id }, data: { columnId: doing.id, order: toIndex } });
    });

    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('POST /tasks/:id/reopen error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});











app.post('/tasks/:id/forward', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { toChatId } = req.body || {};
    const target = String(toChatId || '').trim();
    if (!target) return res.status(400).json({ ok: false, error: 'toChatId required' });

    const task = await prisma.task.findUnique({
      where: { id },
      include: { column: true },
    });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    // 1) Есть исходное сообщение — пересылаем его (⚠️ клавиатура НЕ сохранится в forwardMessage)
    if (task.sourceChatId && task.sourceMessageId) {
      const resFwd = await tg('forwardMessage', {
        chat_id: target,
        from_chat_id: task.sourceChatId,
        message_id: task.sourceMessageId,
      });
      if (!resFwd?.ok) {
        return res.status(502).json({ ok: false, error: 'forward_failed', details: resFwd?.description || '' });
      }
      return res.json({ ok: true, method: 'forward' });
    }






    // 2) Fallback для старых задач — отправим новое сообщение с кнопкой “Открыть”
const startappUrl =
  `https://t.me/${botUser}?startapp=task_${taskId}`;

const resCopy = await tg('sendMessage', {
  chat_id: target,
  text: `Задача: ${task.text}`,
  disable_notification: true,
  reply_markup: {
    inline_keyboard: [[
      { text: 'Открыть задачу', url: startappUrl }
    ]]
  }
});



    if (!resCopy?.ok) {
      return res.status(502).json({ ok: false, error: 'send_failed', details: resCopy?.description || '' });
    }
    return res.json({ ok: true, method: 'copy' });
  } catch (e) {
    console.error('POST /tasks/:id/forward error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});




// === Prepared Share for Mini Apps (savePreparedInlineMessage) ===
// === Prepared Share for Mini Apps (savePreparedInlineMessage) ===
// POST /tasks/:id/share-prepared
// body: { userId: number, allowGroups?: boolean, withButton?: boolean }
app.post('/tasks/:id/share-prepared', async (req, res) => {
  try {
    const taskId = String(req.params.id);
    const { userId, allowGroups = true, withButton = true } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false, error: 'no_user_id' });

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    const botUser  = process.env.BOT_USERNAME;      // без @ (пример: telegsar_bot)
    const appShort = process.env.APP_SHORT_NAME;     // короткое имя Mini App из BotFather
    if (!botUser || !appShort) {
      console.error('[share-prepared] missing .env', { botUser: !!botUser, appShort: !!appShort });
      return res.status(500).json({ ok: false, error: 'missing_bot_env' });
    }

    const text = `Задача: ${task.text || ''}`.trim().slice(0, 4096);
  const startappUrl =
  `https://t.me/${botUser}?startapp=task_${taskId}`;

    const unique = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    const baseResult = {
      type: 'article',
      id: `task_${taskId}_${unique}`.slice(0,64),
      title: 'Задача',
      input_message_content: { message_text: text }
    };

    const withUrlButton = withButton
      ? {
          ...baseResult,
          reply_markup: {
            inline_keyboard: [[ { text: 'Открыть задачу', url: startappUrl } ]]
          }
        }
      : baseResult;

    const payload = {
      user_id: Number(userId),
      allow_user_chats: true,
      allow_group_chats: !!allowGroups,
      allow_channel_chats: !!allowGroups,
      allow_bot_chats: false,
      result: withUrlButton
    };

    console.log('[share-prepared:req]', { taskId, userId, allowGroups, withButton, resultId: payload.result.id, startappUrl });
    let tgResp = await tg('savePreparedInlineMessage', payload);
    console.log('[share-prepared:resp]', JSON.stringify(tgResp));

    // Фолбэк на "минимальный" вариант (как у тебя в curl), если вдруг Telegram откажет
    if (!tgResp?.ok || !(tgResp?.result?.id || tgResp?.result?.prepared_message_id)) {
      const fallback = { ...payload, result: baseResult };
      console.warn('[share-prepared:fallback-minimal]', { resultId: fallback.result.id });
      tgResp = await tg('savePreparedInlineMessage', fallback);
      console.log('[share-prepared:resp-fallback]', JSON.stringify(tgResp));
    }

    const preparedId =
      tgResp?.result?.id ||
      tgResp?.result?.prepared_message_id ||
      tgResp?.prepared_message_id ||
      null;

    if (!tgResp?.ok || !preparedId) {
      return res.status(502).json({
        ok: false,
        error: 'tg_save_prepared_failed',
        details: tgResp?.description || JSON.stringify(tgResp)
      });
    }

    return res.json({ ok: true, preparedMessageId: preparedId });
  } catch (e) {
    console.error('POST /tasks/:id/share-prepared error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});





/* ---------- Создание задачи (личная/групповая) ---------- */
app.post('/tasks', async (req, res) => {
  try {
    const { chatId, text, groupId: rawGroupId } = req.body || {};
    if (!chatId || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'chatId и text обязательны' });
    }
    const caller = String(chatId).trim();
    const groupId = resolveGroupId(rawGroupId);

    let boardChatId = caller;

    if (groupId) {
      const allowed = await userIsGroupMemberOrOwner(caller, groupId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });

      const g = await prisma.group.findUnique({ where: { id: groupId } });
      if (!g) return res.status(404).json({ ok: false, error: 'group_not_found' });
      boardChatId = g.ownerChatId; // все групповые задачи у владельца
    }

    await ensureDefaultColumns(boardChatId, groupId);

    const inboxName = nameWithGroup(groupId, 'Inbox');
    const inbox = await prisma.column.findFirst({ where: { chatId: boardChatId, name: inboxName } });
    if (!inbox) return res.status(500).json({ ok: false, error: 'inbox_not_found' });

    const last = await prisma.task.findFirst({
      where: { columnId: inbox.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const task = await prisma.task.create({
      data: { chatId: boardChatId, text: text.trim(), order: nextOrder, columnId: inbox.id },
    });

    try {
  const sent = await tg('sendMessage', {
    chat_id: caller,
    text: `Новая задача: ${task.text}`,
    disable_notification: true,


reply_markup: {
  inline_keyboard: [[
 { text: 'Открыть задачу',
  url: `https://t.me/${process.env.BOT_USERNAME}?startapp=task_${task.id}` }
  ]]
}

  });



  try {
    if (sent?.ok && sent.result?.message_id) {
      await prisma.task.update({
        where: { id: task.id },
        data: { sourceChatId: caller, sourceMessageId: sent.result.message_id }
      });
    }
  } catch (e2) { console.warn('store source msg failed', e2); }
} catch (e) {
  console.warn('sendMessage failed:', e?.description || e);
}

    res.status(201).json({ ok: true, task });
  } catch (e) {
    console.error('POST /tasks error:', e);
    res.status(500).json({ ok: false });
  }
});

/* ============ Groups REST ============ */
app.get('/groups', async (req, res) => {
  try {
    const chatId = String(req.query.chatId || '');
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId required' });

    let myGroups = await prisma.group.findMany({ where: { ownerChatId: chatId } });
    if (myGroups.length === 0) {
      const created = await prisma.group.create({ data: { ownerChatId: chatId, title: 'Моя группа' } });
      myGroups = [created];
    }

    const memberLinks = await prisma.groupMember.findMany({
      where: { chatId },
      include: { group: true },
    });

    const raw = [
      ...myGroups.map(g => ({ id: g.id, title: g.title, ownerChatId: g.ownerChatId, kind: 'own' })),
      ...memberLinks.map(m => ({ id: m.group.id, title: m.group.title, ownerChatId: m.group.ownerChatId, kind: 'member' })),
    ];

    const ownerIds = Array.from(new Set(raw.map(g => g.ownerChatId)));
    const owners = await prisma.user.findMany({ where: { chatId: { in: ownerIds } } });
    const nameByChat = new Map(
      owners.map(u => [
        u.chatId,
        [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || u.chatId
      ])
    );

    const groups = raw.map(g => ({
      ...g,
      ownerName: nameByChat.get(g.ownerChatId) || null,
    }));

    res.json({ ok: true, groups });
  } catch (e) {
    console.error('GET /groups error:', e);
    res.status(500).json({ ok: false });
  }
});

app.post('/groups', async (req, res) => {
  try {
    const { chatId, title } = req.body || {};
    if (!chatId || !String(title || '').trim()) {
      return res.status(400).json({ ok: false, error: 'chatId and title are required' });
    }
    const group = await prisma.group.create({
      data: { ownerChatId: String(chatId), title: String(title).trim() },
    });

    updateChatCommands(String(chatId)).catch(console.error);

    res.json({ ok: true, group: { id: group.id, title: group.title, kind: 'own' } });
  } catch (e) {
    if (String(e?.code) === 'P2002') {
      return res.status(409).json({ ok: false, error: 'У вас уже есть группа с таким названием' });
    }
    console.error('POST /groups error:', e);
    res.status(500).json({ ok: false });
  }
});

app.patch('/groups/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { chatId, title } = req.body || {};
    if (!chatId || !String(title || '').trim()) {
      return res.status(400).json({ ok: false, error: 'chatId and title are required' });
    }
    const grp = await prisma.group.findUnique({ where: { id } });
    if (!grp) return res.status(404).json({ ok: false, error: 'not found' });
    if (grp.ownerChatId !== String(chatId)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    const updated = await prisma.group.update({
      where: { id },
      data: { title: String(title).trim() },
    });

    updateChatCommands(String(chatId)).catch(console.error);

    res.json({ ok: true, group: { id: updated.id, title: updated.title, kind: 'own' } });
  } catch (e) {
    if (String(e?.code) === 'P2002') {
      return res.status(409).json({ ok: false, error: 'Группа с таким названием уже есть' });
    }
    console.error('PATCH /groups/:id error:', e);
    res.status(500).json({ ok: false });
  }
});

app.delete('/groups/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const chatId = String(req.query.chatId || '');
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId required' });
    const grp = await prisma.group.findUnique({ where: { id } });
    if (!grp) return res.status(404).json({ ok: false, error: 'not found' });
    if (grp.ownerChatId !== chatId) return res.status(403).json({ ok: false, error: 'forbidden' });

    await prisma.group.delete({ where: { id } });

    updateChatCommands(String(chatId)).catch(console.error);

    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /groups/:id error:', e);
    res.status(500).json({ ok: false });
  }
});

const PORT = process.env.PORT || 3300;
app.listen(PORT, () => {
  console.log(`telegsar-api listening on :${PORT}`);
});
