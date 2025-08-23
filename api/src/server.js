import 'dotenv/config';
import express from 'express';
import { PrismaClient } from '@prisma/client';

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
// строим минимально-уникальные префиксы id (начиная с длины 4)
function buildShortCodes(ids) {
  let len = 4;
  while (len <= 12) {
    const seen = new Map(); // pref -> id
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
  // fallback — первые 12 символов
  const map = {};
  for (const id of ids) map[id] = id.slice(0, 12);
  return map;
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

/* ---------- Board (columns + tasks), group-aware ---------- */
app.get('/tasks', async (req, res) => {
  try {
    const chatId = String(req.query.chatId || '');
    const rawGroupId = String(req.query.groupId || '').trim();
    const groupId = rawGroupId && rawGroupId !== 'default' ? rawGroupId : null;
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId is required' });

    await ensureDefaultColumns(chatId, groupId);

    const whereByGroup = groupId
      ? { chatId, name: { startsWith: `${groupId}${GROUP_SEP}` } }
      : { chatId, name: { not: { contains: GROUP_SEP } } };

    const columns = await prisma.column.findMany({
      where: whereByGroup,
      orderBy: { order: 'asc' },
      include: { tasks: { orderBy: { order: 'asc' } } },
    });

    const sanitized = columns.map(c => ({ ...c, name: stripGroupName(c.name) }));
    res.json({ ok: true, columns: sanitized });
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

      // /g — обновить список команд в «/»
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
          const shortById = buildShortCodes(nonDefault.map(g => g.id)); // {id: short}
          // найти id по short
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
          await tg('sendMessage', {
            chat_id: chatId,
            text: `Задача создана: ${task.text}`,
            disable_notification: true,
            reply_markup: {
              inline_keyboard: [[
                { text: 'Открыть задачу', web_app: { url: `${process.env.PUBLIC_WEBAPP_URL}?from=${chatId}&task=${task.id}` } }
              ]]
            }
          });
        } catch (e) {
          console.error('create by /g_<short> error:', e);
          await tg('sendMessage', { chat_id: chatId, text: 'Не удалось создать задачу.' });
        }
        return res.sendStatus(200);
      }

      // Прежний flow: любое сообщение → задача в дефолтной группе
      if (msg?.chat?.type === 'private') {
        try { await tg('deleteMessage', { chat_id: chatId, message_id: msg.message_id }); } catch {}
      }
      const created = await createTaskInGroup({ chatId, groupId: null, text });
      await tg('sendMessage', {
        chat_id: chatId,
        text: `Задача создана: ${created.text}`,
        disable_notification: true,
        reply_markup: {
          inline_keyboard: [[
            { text: 'Открыть задачу', web_app: { url: `${process.env.PUBLIC_WEBAPP_URL}?from=${chatId}&task=${created.id}` } }
          ]]
        }
      });

      return res.sendStatus(200);
    }

    // неинтересные апдейты — 200
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
    const task = await prisma.task.findUnique({ where: { id: String(req.params.id) } });
    if (!task) return res.status(404).json({ ok: false, error: 'task not found' });
    res.json({ ok: true, task });
  } catch (e) {
    console.error('GET /tasks/:id error:', e);
    res.status(500).json({ ok: false });
  }
});

app.patch('/tasks/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { text } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'text is required' });
    }
    const updated = await prisma.task.update({
      where: { id },
      data: { text: text.trim() },
    });
    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('PATCH /tasks/:id error:', e);
    res.status(500).json({ ok: false });
  }
});

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

app.post('/tasks', async (req, res) => {
  try {
    const { chatId, text, groupId: rawGroupId } = req.body || {};
    if (!chatId || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'chatId и text обязательны' });
    }
    const chat = String(chatId).trim();
    const groupId = resolveGroupId(rawGroupId);

    await ensureDefaultColumns(chat, groupId);

    const inboxName = nameWithGroup(groupId, 'Inbox');
    const inbox = await prisma.column.findFirst({ where: { chatId: chat, name: inboxName } });
    if (!inbox) return res.status(500).json({ ok: false, error: 'inbox_not_found' });

    const last = await prisma.task.findFirst({
      where: { columnId: inbox.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const task = await prisma.task.create({
      data: { chatId: chat, text: text.trim(), order: nextOrder, columnId: inbox.id },
    });

    try {
      await tg('sendMessage', {
        chat_id: chat,
        text: `Новая задача: ${task.text}`,
        disable_notification: true,
        reply_markup: {
          inline_keyboard: [[
            { text: 'Открыть', web_app: { url: `${process.env.PUBLIC_WEBAPP_URL}?from=${chat}&task=${task.id}` } }
          ]]
        }
      });
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
      const created = await prisma.group.create({
        data: { ownerChatId: chatId, title: 'Моя группа' },
      });
      myGroups = [created];
    }

    const memberLinks = await prisma.groupMember.findMany({
      where: { chatId },
      include: { group: true },
    });

    const groups = [
      ...myGroups.map(g => ({ id: g.id, title: g.title, kind: 'own' })),
      ...memberLinks.map(m => ({ id: m.group.id, title: m.group.title, kind: 'member' })),
    ];

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
