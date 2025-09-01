//server.js
import 'dotenv/config';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

import { Readable } from 'node:stream'; // ⬅️ ДОБАВИЛИ
import Busboy from 'busboy'; // ⬅️ NEW


import { tasksRouter } from './routes/tasks.js';
import { notificationsRouter } from './routes/notifications.js';
import { assignRouter } from './routes/assign.js';  
import { eventsRouter } from './routes/events.js';
import { initReminderScheduler, scheduleRemindersForEvent } from './scheduler.js';

import processRouter from './routes/process.js';

import { shareNewTaskRouter } from './routes/sharenewtask.js';



const prisma = new PrismaClient();
const app = express();
app.use(express.json());










// 2) PATCH с try/catch
eventsRouter.patch('/:id', async (req, res) => {
  try {
    const eventId = String(req.params.id);
    const before = await prisma.task.findUnique({ where: { id: eventId } });
    if (!before) return res.status(404).json({ ok: false, error: 'not_found' });

    const updated = await prisma.task.update({ where: { id: eventId }, data: req.body });

    if (
      req.body.startAt &&
      (!before.startAt ||
       new Date(req.body.startAt).getTime() !== new Date(before.startAt).getTime())
    ) {
      await recomputeAndRescheduleEventReminders(prisma, tg, eventId, req.body.startAt);
    }

    return res.json({ ok: true, event: updated });
  } catch (e) {
    console.error('PATCH /events/:id error', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});







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



initReminderScheduler({ prisma, tg }).catch(console.error);




async function recomputeAndRescheduleEventReminders(prisma, tg, eventId, newStartAt) {
  const start = new Date(newStartAt);
  if (Number.isNaN(start.getTime())) return; // плохая дата — выходим

  await prisma.$transaction(async (tx) => {
    const rows = await tx.eventReminder.findMany({
      where: { eventId: String(eventId), sentAt: null },
      select: { id: true, offsetMinutes: true },
    });
    for (const r of rows) {
      await tx.eventReminder.update({
        where: { id: r.id },
        data: { fireAt: new Date(start.getTime() - (r.offsetMinutes ?? 0) * 60_000) },
      });
    }
  });

  await scheduleRemindersForEvent(prisma, tg, eventId);
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








// --- Telegram getFile helper ---
async function tgGetFile(fileId) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  const j = await r.json();
  if (!j?.ok || !j?.result?.file_path) throw new Error('getFile failed');
  return j.result.file_path; // e.g. "photos/file_123.jpg"
}

// --- Прокси: отдать файл по mediaId, не раскрывая токен ---
app.get('/files/:mediaId', async (req, res) => {
  try {
    const mediaId = String(req.params.mediaId);
    const m = await prisma.taskMedia.findUnique({ where: { id: mediaId } });
    if (!m) return res.status(404).send('not found');

    // Получаем путь к файлу в Telegram
    const filePath = await tgGetFile(m.tgFileId);
    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;

    const tgResp = await fetch(url);
    if (!tgResp.ok) return res.status(502).send('tg file fetch failed');

    // Контент-тайп: сначала наш из БД, иначе — из ответа Telegram
    const mime = m.mimeType || tgResp.headers.get('content-type') || undefined;
    if (mime) res.setHeader('Content-Type', mime);

    const len = tgResp.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Поддержка HEAD: только заголовки — без тела
    if (req.method === 'HEAD') return res.end();

    // В Node 18+ fetch() -> Web stream. Конвертируем в Node stream.
    const body = tgResp.body;
    if (!body) return res.status(502).send('tg empty body');

    // Конвертация и проксирование потока
    const nodeStream = Readable.fromWeb(body);
    nodeStream.on('error', (err) => {
      console.warn('[files proxy] stream error', err?.message || err);
      try { res.destroy(err); } catch {}
    });
    nodeStream.pipe(res);
  } catch (e) {
    console.error('[files proxy] error', e?.message || e);
    res.status(500).send('internal');
  }
});










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

/* ---------- Оповещение ---------- */

app.use('/notifications', notificationsRouter({ prisma }));



/* ---------- Назначения / приглашения ответственных ---------- */
app.use('/assign', assignRouter({ prisma })); 


/* ---------- Поделиться задачей для коппии ---------- */
app.use('/sharenewtask', shareNewTaskRouter({ prisma })); // ⬅️ новый



/* ---------- DELETE /tasks/:id из отдельного роутера ---------- */
app.use('/tasks', tasksRouter);

/* ---------- Мероприятия ---------- */

app.use('/events', eventsRouter);

/* ---------- Процесс ---------- */

app.use(processRouter);


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





// ---------- helper: проверка, что byChatId — организатор события ----------
async function isEventOrganizer(eventId, chatId) {
  const p = await prisma.eventParticipant.findFirst({
    where: { eventId: String(eventId), chatId: String(chatId), role: 'ORGANIZER' },
  });
  return !!p;
}


// ---------- helper:----------

async function ensureMyGroupId(ownerChatId) {
  const who = String(ownerChatId);
  let g = await prisma.group.findFirst({
    where: { ownerChatId: who, title: 'Моя группа' }
  });
  if (!g) {
    g = await prisma.group.create({
      data: { ownerChatId: who, title: 'Моя группа' }
    });
  }
  return g.id;
}






/* ---------- helper: отправить «Задача создана…» c тем же типом, что исходник ---------- */
async function sendTaskCreated(tg, { chatId, media, taskId, title }) {
  const caption = `Задача создана: ${title}`;
  const markup = {
    inline_keyboard: [[
      { text: 'Открыть задачу', url: `https://t.me/${process.env.BOT_USERNAME}?startapp=task_${taskId}` }
    ]]
  };

  // приоритет: photo > document > voice > text
  const photo = media.find(m => m.kind === 'photo');
  if (photo) {
    return tg('sendPhoto', {
      chat_id: chatId,
      photo: photo.tgFileId,        // используем file_id TG
      caption,
      reply_markup: markup,
    });
  }
  const doc = media.find(m => m.kind === 'document');
  if (doc) {
    return tg('sendDocument', {
      chat_id: chatId,
      document: doc.tgFileId,
      caption,
      reply_markup: markup,
    });
  }
  const voice = media.find(m => m.kind === 'voice');
  if (voice) {
    return tg('sendVoice', {
      chat_id: chatId,
      voice: voice.tgFileId,
      caption,
      reply_markup: markup,
    });
  }
  // fallback — просто текст
  return tg('sendMessage', {
    chat_id: chatId,
    text: caption,
    disable_notification: true,
    reply_markup: markup,
  });
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



/* ---------- Webhook (любой апдейт) ---------- */
app.post('/webhook', async (req, res) => {
  try {
    const secret = req.header('X-Telegram-Bot-Api-Secret-Token');
    if (!secret || secret !== process.env.WEBHOOK_SECRET) return res.sendStatus(403);

    const update = req.body;
    const msg = update?.message;
    if (!msg) return res.sendStatus(200);

    const chatId = String(msg.chat?.id || '');

    // ===== 1) РЕПЛАЙ на карточку задачи -> КОММЕНТАРИЙ (оставляем как у тебя) =====
    if (msg?.reply_to_message && (msg.text || msg.caption)) {
      try {
        const repliedId = Number(msg.reply_to_message.message_id);
        const authorChatId = String(msg.from?.id || '');
        const text = String(msg.text || msg.caption || '').trim();
        if (text) {
          const task = await prisma.task.findFirst({
            where: { sourceChatId: chatId, sourceMessageId: repliedId },
          });
          if (task) {
            // комментарий
            await prisma.comment.create({ data: { taskId: task.id, authorChatId, text } });

            // уведомления (как было)
            const posterId = task.sourceChatId ? String(task.sourceChatId) : String(task.chatId);
            const recipients = [task.assigneeChatId ? String(task.assigneeChatId) : null, posterId].filter(Boolean);

            if (recipients.length) {
              const authorUser = await prisma.user.findUnique({ where: { chatId: authorChatId } });
              const authorName = [authorUser?.firstName, authorUser?.lastName].filter(Boolean).join(' ')
                || (authorUser?.username ? `@${authorUser.username}` : authorChatId);

              const st = await prisma.notificationSetting.findMany({
                where: { telegramId: { in: recipients } },
                select: { telegramId: true, receiveTaskComment: true, writeAccessGranted: true },
              });
              const allowed = new Set(
                st.filter(s => (s.receiveTaskComment ?? true) && s.writeAccessGranted).map(s => String(s.telegramId))
              );
              const dmText = `👤 ${authorName}\n✐ᝰ\n${text}`;
              const markup = { inline_keyboard: [[{ text: 'Ответить', url: `https://t.me/${process.env.BOT_USERNAME}?startapp=task_${task.id}` }]] };

              await Promise.all(
                recipients
                  .filter(id => allowed.has(id))
                  .map(cid => tg('sendMessage', {
                    chat_id: cid,
                    text: dmText,
                    disable_web_page_preview: true,
                    reply_markup: markup,
                  }))
              );
            }
          }
        }
      } catch (e) {
        console.error('[webhook reply->comment] error:', e);
      }
      return res.sendStatus(200);
    }

    // ===== 2) /g_* команда (создание в конкретной группе из ТЕКСТА) =====
    if (msg.text) {
      const text = String(msg.text).trim();

      // /g — обновить список команд
      if (['/g', '/group', '/groups', '/refresh'].includes(text)) {
        await updateChatCommands(chatId);
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Команды обновлены. Наберите "/" и выберите группу. Можно долго удерживать команду, чтобы вставить её в поле ввода.',
        });
        return res.sendStatus(200);
      }

      const m = text.match(/^\/g_([a-z0-9]+)\s*(.*)$/i);
      if (m) {
        const short = m[1];
        const rest = (m[2] || '').trim();
        if (!rest) {
          await tg('sendMessage', { chat_id: chatId, text: `Добавьте текст после команды. Пример: /g_${short} Купить молоко` });
          return res.sendStatus(200);
        }

        // вычисляем groupId по short
        let groupId = null; // default
        if (short !== 'default') {
          const all = await getUserGroups(chatId);
          const nonDefault = all.filter(g => g.title !== 'Моя группа');
          const shortById = buildShortCodes(nonDefault.map(g => g.id));
          const hit = Object.entries(shortById).find(([, s]) => s === short);
          if (!hit) {
            await tg('sendMessage', { chat_id: chatId, text: 'Неизвестный код группы. Наберите /g чтобы обновить список.' });
            return res.sendStatus(200);
          }
          groupId = hit[0];
        }

        try {
          // создаём задачу ТОЛЬКО из текста rest (как и раньше для /g)
          const task = await createTaskInGroup({ chatId, groupId, text: rest });

          // сервиска с корректной ссылкой на мини-апп
const sent = await sendTaskCreated(tg, {
  chatId,
  media,
  taskId: task.id,
  title: task.text
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
      // если это просто текст без /g_* — продолжим обработку ниже как «любое сообщение»
    }

    // ===== 3) ЛЮБОЕ СООБЩЕНИЕ (текст/фото/док/голос) -> Задача в default-группе =====
    // Собираем медиа
    const media = [];
    if (Array.isArray(msg?.photo) && msg.photo.length) {
      const p = msg.photo[msg.photo.length - 1]; // самое большое фото
      media.push({ kind: 'photo', tgFileId: p.file_id, tgUniqueId: p.file_unique_id, width: p.width, height: p.height, fileSize: p.file_size });
    }
    if (msg?.document) {
      const d = msg.document;
      media.push({ kind: 'document', tgFileId: d.file_id, tgUniqueId: d.file_unique_id, mimeType: d.mime_type, fileName: d.file_name, fileSize: d.file_size });
    }
    if (msg?.voice) {
      const v = msg.voice;
      media.push({ kind: 'voice', tgFileId: v.file_id, tgUniqueId: v.file_unique_id, mimeType: 'audio/ogg', duration: v.duration, fileSize: v.file_size });
    }

    const caption = String(msg.caption || '').trim();
    const fileName = msg?.document?.file_name ? String(msg.document.file_name) : '';
    const textForTask = String(
      msg.text ||
      caption ||
      fileName ||
      (media[0]?.kind === 'photo' ? 'Фото'
        : media[0]?.kind === 'voice' ? 'Голосовое'
        : media[0]?.kind === 'document' ? 'Файл'
        : 'Задача')
    ).slice(0, 4096);

    // если ни текста, ни медиа — просто выходим
    if (!textForTask && !media.length) return res.sendStatus(200);

    // приват: удаляем исходник
    if (msg?.chat?.type === 'private') {
      try { await tg('deleteMessage', { chat_id: chatId, message_id: msg.message_id }); } catch {}
    }

    // создаём задачу
    const created = await createTaskInGroup({ chatId, groupId: null, text: textForTask });

    // сохраняем вложения
    if (media.length) {
      try {
        await prisma.$transaction(media.map(m => prisma.taskMedia.create({ data: { taskId: created.id, ...m } })));
      } catch (e) {
        console.warn('[taskMedia:create] failed', e);
      }
    }

    // сервиска с кнопкой




const sent = await sendTaskCreated(tg, {
  chatId,
  media,
  taskId: created.id,
  title: created.text
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
  } catch (e) {
    console.error('POST /webhook error:', e);
    res.sendStatus(200); // не рушим вебхук
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




/* ============ ============ */



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
        const nm = stripGroupName(col.name);
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

    let creatorName = null;
    try {
      const creatorId = task.sourceChatId ? String(task.sourceChatId) : null;
      if (creatorId) {
        const u = await prisma.user.findUnique({ where: { chatId: creatorId } });
        if (u) {
          creatorName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || creatorId;
        }
      }
    } catch {}

    // NEW: вложения
    let media = [];
    try {
      const rows = await prisma.taskMedia.findMany({
        where: { taskId: id },
        orderBy: { createdAt: 'asc' },
      });
      media = rows.map(m => ({
        id: m.id,
        kind: m.kind,               // 'photo' | 'document' | 'voice'
        url: `/files/${m.id}`,      // прокси-URL
        fileName: m.fileName,
        mimeType: m.mimeType,
        width: m.width,
        height: m.height,
        duration: m.duration,
        fileSize: m.fileSize,
      }));
    } catch {}

    res.json({
      ok: true,
      task: { ...task, assigneeName, creatorName },
      groupId,
      phase,
      media, // <-- добавили
    });
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

    // Сформируем patch
    const data = {};
    if (typeof text === 'string' && text.trim()) data.text = text.trim();
    if (typeof assigneeChatId === 'string' || assigneeChatId === null) {
      data.assigneeChatId = assigneeChatId ?? null;
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ ok: false, error: 'nothing_to_update' });
    }

    // 1) До обновления
    const before = await prisma.task.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ ok: false, error: 'not_found' });

    // 2) Обновляем
    const updated = await prisma.task.update({ where: { id }, data });

    // 3) Триггер: появился ответственный (assigneeChatId: null -> chatId)
    try {
      const was = before?.assigneeChatId ? String(before.assigneeChatId) : null;
      const now = updated?.assigneeChatId ? String(updated.assigneeChatId) : null;

      if (was !== now && now) {
        // Имя назначенного
        let assigneeName = null;
        try {
          const u = await prisma.user.findUnique({ where: { chatId: now } });
          assigneeName = u
            ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || now
            : now;
        } catch {}

        // Настройки уведомлений: используем chatId как telegramId
        const st = await prisma.notificationSetting.findUnique({
          where: { telegramId: now },
          select: { receiveTaskAccepted: true, writeAccessGranted: true },
        });

        if (!st || (st.receiveTaskAccepted && st.writeAccessGranted)) {
          const actorName = assigneeName || 'Пользователь';
          const title = updated.text || 'Без названия';

          await tg('sendMessage', {
            chat_id: now, // пишем назначенному
            text: `👤 <b>${actorName}</b> принял(а) задачу: <b>${title}</b>`,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          });
        }
      }
    } catch (e) {
      console.error('notify task accepted error', e);
    }

    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('PATCH /tasks/:id error:', e);
    res.status(500).json({ ok: false });
  }
});


/* ---------- Invites ---------- */
/* ---------- Invites ---------- */
app.post('/invites', async (req, res) => {
  try {
    const {
      chatId,
      type,
      taskId,
      groupId: rawGroupId,
      eventId: rawEventId,  // для EVENT-инвайта
    } = req.body || {};

    const inviter = String(chatId || '');
    if (!inviter || !type) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }

    const botUser = process.env.BOT_USERNAME || 'telegsar_bot';

    /* ===== EVENT invite ===== */
    if (String(type).toLowerCase() === 'event') {
      const eventId = String(rawEventId || '');
      if (!eventId) return res.status(400).json({ ok: false, error: 'eventId required' });

      const event = await prisma.task.findUnique({
        where: { id: eventId },
        include: { column: true },
      });
      if (!event || event.type !== 'EVENT') {
        return res.status(404).json({ ok: false, error: 'event_not_found' });
      }

      // только организатор может генерировать инвайт
      const isOrg = await isEventOrganizer(eventId, inviter);
      if (!isOrg) return res.status(403).json({ ok: false, error: 'only_organizer_allowed' });

      // groupId для тикета: из имени колонки (как у TASK)


const parsedGroupId = event?.column ? parseGroupIdFromColumnName(event.column.name) : null;
const fallbackGroup = await prisma.group.findFirst({
  where: { ownerChatId: event.chatId, title: 'Моя группа' },
});
const groupIdFinal = parsedGroupId ?? fallbackGroup?.id ?? null;

// ✅ гарантируем, что groupId точно есть
const groupIdResolved = groupIdFinal ?? (await ensureMyGroupId(inviter));

const token = makeToken();
const created = await prisma.inviteTicket.create({
  data: {
    token,
    type: 'EVENT',
    status: 'ACTIVE',
    groupId: groupIdResolved,
    taskId: null,
    eventId: eventId,
    invitedByChatId: inviter,
  },
});





      const link = `https://t.me/${botUser}?startapp=event__${created.eventId}__${created.token}`;
      const shareText = `Приглашаю тебя на событие: ${event.text || ''}`;

      return res.json({ ok: true, token, link, shareText });
    }

    /* ===== TASK / GROUP invites (как было) ===== */
    if (type !== 'task' && type !== 'group') {
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
        groupId:
          groupId ??
          (await prisma.group.findFirst({
            where: { ownerChatId: inviter, title: 'Моя группа' },
          }))?.id,
        taskId: type === 'task' ? String(taskId) : null,
        invitedByChatId: inviter,
      },
    });

    let link = '';
    let shareText = '';
    if (created.type === 'TASK') {
      link = `https://t.me/${botUser}?startapp=assign__${created.taskId}__${created.token}`;
      shareText = `Назначаю тебя ответственным по задаче. Открой ссылку:`;
    } else {
      link = `https://t.me/${botUser}?startapp=join__${created.groupId}__${created.token}`;
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

    // Добавляем в группу (если ещё не член)
    if (invite.groupId) {
      const isMember = await userIsGroupMemberOrOwner(who, invite.groupId);
      if (!isMember) {
        await prisma.groupMember.create({
          data: { groupId: invite.groupId, chatId: who, role: 'member' }
        });
      }
    }

    // === EVENT: принять приглашение в событие ===
    if (invite.type === 'EVENT' && invite.eventId) {
      const exists = await prisma.eventParticipant.findFirst({
        where: { eventId: invite.eventId, chatId: who },
      });
      if (!exists) {
        await prisma.eventParticipant.create({
          data: { eventId: invite.eventId, chatId: who, role: 'PARTICIPANT' },
        });
      }

      await prisma.inviteTicket.update({
        where: { token: tok },
        data: { status: 'USED' },
      });

      return res.json({
        ok: true,
        groupId: invite.groupId,
        eventId: invite.eventId,
        joined: true
      });
    }

    // === TASK: назначить ответственным ===
    let assigned = false;
    if (invite.type === 'TASK' && invite.taskId) {
      await prisma.task.update({
        where: { id: invite.taskId },
        data: { assigneeChatId: who }
      });
      assigned = true;

      // 🔔 уведомление назначенному
      try {
        const taskAfter = await prisma.task.findUnique({ where: { id: invite.taskId } });
        const now = String(who);
        const st = await prisma.notificationSetting.findUnique({
          where: { telegramId: now },
          select: { receiveTaskAccepted: true, writeAccessGranted: true },
        });

        // имя пригласившего
        let actorName = null;
        try {
          const actor = await prisma.user.findUnique({ where: { chatId: String(invite.invitedByChatId) } });
          actorName = actor
            ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.username || String(invite.invitedByChatId)
            : String(invite.invitedByChatId);
        } catch {}

        const title = taskAfter?.text || 'Без названия';
        const textMsg = `👤 <b>${actorName || 'Пользователь'}</b> принял(а) задачу: <b>${title}</b>`;

        if (!st || (st.receiveTaskAccepted && st.writeAccessGranted)) {
          await tg('sendMessage', {
            chat_id: now,
            text: textMsg,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          });
        }
      } catch (e) {
        console.error('notify via invites/accept error', e);
      }
    }

    // === GROUP или TASK (после обработки) — пометить тикет использованным
    await prisma.inviteTicket.update({
      where: { token: tok },
      data: { status: 'USED' }
    });

    return res.json({
      ok: true,
      groupId: invite.groupId,
      taskId: invite.taskId ?? null,
      assigned
    });
  } catch (e) {
    console.error('POST /invites/accept error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});






// POST /tasks/:id/media?chatId=<number>
// multipart: field name="file"
app.post('/tasks/:id/media', async (req, res) => {
  try {
    const taskId = String(req.params.id);
    const chatId = String(req.query.chatId || '').trim();
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });

    // Проверим, что задача есть
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    const bb = Busboy({ headers: req.headers });
    let fileBufs = [];
    let fileName = '';
    let mimeType = '';

    bb.on('file', (_name, file, info) => {
      fileName = info?.filename || 'file.bin';
      mimeType = info?.mimeType || 'application/octet-stream';
      file.on('data', (d) => fileBufs.push(d));
    });

    bb.on('finish', async () => {
      try {
        const buf = Buffer.concat(fileBufs);
        if (!buf.length) return res.status(400).json({ ok: false, error: 'empty_file' });

        // Готовим multipart на сторону Telegram (Node18+: FormData/Blob доступны глобально)
        const form = new FormData();
        form.append('chat_id', chatId);

        const isPhoto = /^image\//i.test(mimeType);
        if (isPhoto) {
          form.append('photo', new Blob([buf], { type: mimeType }), fileName || 'photo.jpg');
        } else {
          form.append('document', new Blob([buf], { type: mimeType }), fileName);
        }

        const method = isPhoto ? 'sendPhoto' : 'sendDocument';
        const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`;
        const r = await fetch(url, { method: 'POST', body: form });
        const data = await r.json();

        if (!data?.ok) {
          console.error('[media upload] Telegram error:', data);
          return res.status(502).json({ ok: false, error: 'telegram_error', details: data?.description || '' });
        }

        // Достаём file_id и метадату из ответа
        let payloadForDb = null;
        if (isPhoto) {
          const sizes = data.result?.photo || [];
          const p = sizes[sizes.length - 1] || sizes[0];
          payloadForDb = {
            taskId,
            kind: 'photo',
            tgFileId: p.file_id,
            tgUniqueId: p.file_unique_id,
            width: p.width,
            height: p.height,
            fileSize: p.file_size || null,
            fileName: fileName || null,
            mimeType: mimeType || null,
          };
        } else {
          const d = data.result?.document;
          payloadForDb = {
            taskId,
            kind: 'document',
            tgFileId: d.file_id,
            tgUniqueId: d.file_unique_id,
            fileSize: d.file_size || null,
            fileName: d.file_name || fileName || null,
            mimeType: d.mime_type || mimeType || null,
          };
        }

        const saved = await prisma.taskMedia.create({ data: payloadForDb });

        // По возможности удалим "временное" сообщение у пользователя
        try {
          const msgId = data.result?.message_id;
          if (msgId) await tg('deleteMessage', { chat_id: chatId, message_id: msgId });
        } catch {}

        return res.json({
          ok: true,
          media: {
            id: saved.id,
            kind: saved.kind,
            url: `/files/${saved.id}`,
            fileName: saved.fileName,
            mimeType: saved.mimeType,
            width: saved.width,
            height: saved.height,
            duration: saved.duration,
            fileSize: saved.fileSize,
          }
        });
      } catch (e) {
        console.error('[media upload] finish handler error', e);
        return res.status(500).json({ ok: false, error: 'internal' });
      }
    });

    req.pipe(bb);
  } catch (e) {
    console.error('POST /tasks/:id/media error', e);
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

    // Уже в Done → только переупорядочивание
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

    // Перенос в Done
    const toIndex = await prisma.task.count({ where: { columnId: done.id } });
    const fromColumnId = task.columnId;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { columnId: fromColumnId, order: { gt: task.order } },
        data: { order: { decrement: 1 } },
      });
      return tx.task.update({ where: { id }, data: { columnId: done.id, order: toIndex } });
    });

    // 🔔 Уведомляем ПОСТАНОВЩИКА (sourceChatId), если включено receiveTaskCompletedMine
    (async () => {
      try {
        const creatorId = task?.sourceChatId ? String(task.sourceChatId) : null;
        if (!creatorId) return;

        const st = await prisma.notificationSetting.findUnique({
          where: { telegramId: creatorId },
          select: { receiveTaskCompletedMine: true, writeAccessGranted: true },
        });

        // Если настроек нет — трактуем как включено (дефолт true), но писать можно только если writeAccessGranted=true
        const allow =
          (!st && false /* без writeAccessGranted писать нельзя */) ||
          (!!st && st.receiveTaskCompletedMine && st.writeAccessGranted);

        if (!allow) return;

        // Кто завершил — берём назначенного (если есть)
        let whoName = null;
        try {
          const aid = updated?.assigneeChatId ? String(updated.assigneeChatId) : null;
          if (aid) {
            const u = await prisma.user.findUnique({ where: { chatId: aid } });
            whoName = u
              ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || aid
              : null;
          }
        } catch {}

        const title = updated?.text || 'Без названия';
        const textMsg = whoName
          ? `✅ <b>${whoName}</b> завершил(а) задачу: <b>${title}</b>`
          : `✅ Задача завершена: <b>${title}</b>`;

        await tg('sendMessage', {
          chat_id: creatorId,
          text: textMsg,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
      } catch (err) {
        console.error('notify task completed (creator) error', err);
      }
    })().catch(() => { /* noop */ });

    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('POST /tasks/:id/complete error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});






// === PRIME: разослать базовые сообщения участникам события и сохранить replyToMessageId ===
// POST /events/:id/reminders/prime
// body: { byChatId: string }
app.post('/events/:id/reminders/prime', async (req, res) => {
  try {
    const eventId = String(req.params.id);
    const { byChatId } = req.body || {};
    if (!byChatId) return res.status(400).json({ ok: false, error: 'byChatId required' });

    const event = await prisma.task.findUnique({ where: { id: eventId } });
    if (!event || event.type !== 'EVENT') {
      return res.status(404).json({ ok: false, error: 'event_not_found' });
    }
    if (!event.startAt) return res.status(400).json({ ok: false, error: 'event_has_no_start' });

    // только организатор может праймить
    const allowed = await isEventOrganizer(eventId, String(byChatId));
    if (!allowed) return res.status(403).json({ ok: false, error: 'only_organizer_allowed' });

    // участники события
    const participants = await prisma.eventParticipant.findMany({
      where: { eventId },
      select: { chatId: true },
      orderBy: { createdAt: 'asc' },
    });
    const chatIds = participants.map(p => String(p.chatId));
    if (!chatIds.length) return res.json({ ok: true, primed: 0 });

    // у кого есть напоминания и нет replyToMessageId
    const needMap = new Map(); // chatId -> true, если хотя бы одна запись без reply
    const rows = await prisma.eventReminder.findMany({
      where: { eventId, chatId: { in: chatIds } },
      select: { chatId: true, replyToMessageId: true },
    });
    for (const r of rows) {
      if (!r.replyToMessageId) needMap.set(String(r.chatId), true);
    }
    const toPrime = chatIds.filter(cid => needMap.get(cid));
    if (!toPrime.length) return res.json({ ok: true, primed: 0 });

    // уважим writeAccessGranted: шлём только тем, кому можно
    const settings = await prisma.notificationSetting.findMany({
      where: { telegramId: { in: toPrime } },
      select: { telegramId: true, writeAccessGranted: true },
    });
    const canDM = new Set(settings.filter(s => !!s.writeAccessGranted).map(s => String(s.telegramId)));
    const recipients = toPrime.filter(cid => canDM.has(cid));

    let primed = 0;
    // текст базового сообщения
    const fmt = (d) => new Date(d).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
    const title = event.text || 'Событие';
    const timeLine = event.endAt
      ? `${fmt(event.startAt)} — ${fmt(event.endAt)}`
      : `${fmt(event.startAt)}`;
    const baseText = `📅 <b>${title}</b>\n${timeLine}`;

    for (const chat_id of recipients) {
      try {
        const sent = await tg('sendMessage', {
          chat_id,
          text: baseText,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });

        const mid = sent?.ok && sent.result?.message_id ? Number(sent.result.message_id) : null;
        if (mid) {
          await prisma.eventReminder.updateMany({
            where: { eventId, chatId: chat_id, replyToMessageId: null },
            data: { replyToMessageId: mid },
          });
          primed++;
        }
      } catch (e) {
        console.warn('[prime] send to', chat_id, 'failed:', e?.description || e);
      }
    }

await scheduleRemindersForEvent(prisma, tg, eventId);




    // вернём, кому НЕ отправили из-за writeAccessGranted=false (может пригодиться в UI)
    const skipped = toPrime.filter(cid => !recipients.includes(cid));
    return res.json({ ok: true, primed, skipped });
  } catch (e) {
    console.error('POST /events/:id/reminders/prime error:', e);
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

    // 2) Fallback — отправим новое сообщение с кнопкой “Открыть”
    const botUser = process.env.BOT_USERNAME;
    const taskId = id;
    const startappUrl = `https://t.me/${botUser}?startapp=task_${taskId}`;

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
// POST /tasks/:id/share-prepared
// body: { userId: number, allowGroups?: boolean, withButton?: boolean }
app.post('/tasks/:id/share-prepared', async (req, res) => {
  try {
    const taskId = String(req.params.id);
    const { userId, allowGroups = true, withButton = true } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false, error: 'no_user_id' });

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: true },
    });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    const botUser  = process.env.BOT_USERNAME;      // без @
    const appShort = process.env.APP_SHORT_NAME;    // короткое имя Mini App из BotFather
    if (!botUser || !appShort) {
      console.error('[share-prepared] missing .env', { botUser: !!botUser, appShort: !!appShort });
      return res.status(500).json({ ok: false, error: 'missing_bot_env' });
    }

    // NEW: создаём инвайт TASK и шлём ссылку assign__<taskId>__<token>
    const inviter = String(userId);
    const parsedGroupId = task?.column ? parseGroupIdFromColumnName(task.column.name) : null;
    const fallbackGroup = await prisma.group.findFirst({
      where: { ownerChatId: task.chatId, title: 'Моя группа' }
    });
    const groupIdFinal = parsedGroupId ?? fallbackGroup?.id ?? null;

    const invite = await prisma.inviteTicket.create({
      data: {
        token: makeToken(),
        type: 'TASK',
        status: 'ACTIVE',
        groupId: groupIdFinal,
        taskId: taskId,
        invitedByChatId: inviter,
      }
    });

    const text = `Задача: ${task.text || ''}`.trim().slice(0, 4096);
    const startappUrl = `https://t.me/${botUser}?startapp=assign__${taskId}__${invite.token}`;

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

    // Фолбэк на "минимальный" вариант, если TG откажет
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

    // Собираем ВСЕ колонки этой группы у всех пользователей (на всякий случай),
    // но по идее после adoptGroupColumnsToOwner все уже у владельца.
    const cols = await prisma.column.findMany({
      where: { name: { startsWith: `${id}${GROUP_SEP}` } },
      select: { id: true },
    });
    const colIds = cols.map(c => c.id);

    await prisma.$transaction(async (tx) => {
      if (colIds.length) {
        await tx.task.deleteMany({ where: { columnId: { in: colIds } } });
        await tx.column.deleteMany({ where: { id: { in: colIds } } });
      }
      await tx.groupMember.deleteMany({ where: { groupId: id } });
      await tx.inviteTicket.deleteMany({ where: { groupId: id } });
      await tx.group.delete({ where: { id } });
    });

    // Обновим команды для владельца
    updateChatCommands(String(chatId)).catch(console.error);

    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /groups/:id error:', e);
    res.status(500).json({ ok: false });
  }
});






/* ============ Group Members (list/invite/remove/leave) ============ */

// Подсчитать задачи участника в рамках конкретной группы
async function countUserTasksInGroup({ groupId, ownerChatId, assigneeChatId }) {
  return prisma.task.count({
    where: {
      assigneeChatId: String(assigneeChatId),
      column: {
        chatId: String(ownerChatId),
        name: { startsWith: `${groupId}${GROUP_SEP}` },
      },
    },
  });
}

// GET /groups/:id/members
// Возвращает: { ok, owner: {chatId, name}, members: [{chatId, name, assignedCount}] }
// В members — все участники (GroupMember), все ответственные из задач, и "приглашённые" (активные инвайты)
app.get('/groups/:id/members', async (req, res) => {
  try {
    const groupId = String(req.params.id);
    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g) return res.status(404).json({ ok: false, error: 'group_not_found' });

    // Владелец
    const ownerUser = await prisma.user.findUnique({ where: { chatId: String(g.ownerChatId) } });
    const ownerName = ownerUser
      ? [ownerUser.firstName, ownerUser.lastName].filter(Boolean).join(' ') || ownerUser.username || ownerUser.chatId
      : String(g.ownerChatId);

    // Участники по таблице GroupMember
    const links = await prisma.groupMember.findMany({ where: { groupId }, select: { chatId: true } });
    const linkIds = links.map(l => String(l.chatId));

    // Ассайни из задач в колонках группы (у владельца)
    const cols = await prisma.column.findMany({
      where: { chatId: String(g.ownerChatId), name: { startsWith: `${groupId}${GROUP_SEP}` } },
      select: { id: true },
    });
    const colIds = cols.map(c => c.id);
    let assignees = [];
    if (colIds.length) {
      const tasks = await prisma.task.findMany({
        where: { columnId: { in: colIds }, assigneeChatId: { not: null } },
        select: { assigneeChatId: true },
      });
      assignees = Array.from(new Set(tasks.map(t => String(t.assigneeChatId))));
    }

    // "Приглашённые" — активные инвайты в группу
    const invites = await prisma.inviteTicket.findMany({
      where: { groupId, type: 'GROUP', status: 'ACTIVE' },
      select: { invitedByChatId: true }, // конкретного «кого приглашать» нет — ссылка общая
    });
    const invitedPlaceholders = invites.length ? ['invited'] : []; // маркер, покажем запись «Приглашённые (ожидают принятия)»

    // Соберём уникальные chatId (кроме владельца)
    const memberIds = Array.from(new Set([
      ...linkIds,
      ...assignees,
    ])).filter(id => id && id !== String(g.ownerChatId));

    // Подтянем имена
    const users = memberIds.length
      ? await prisma.user.findMany({ where: { chatId: { in: memberIds } } })
      : [];
    const nameByChat = new Map(
      users.map(u => [
        u.chatId,
        [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || u.chatId
      ])
    );

    // Посчитаем "assignedCount" на каждого
    const membersWithCounts = await Promise.all(memberIds.map(async (mid) => {
      const assignedCount = await countUserTasksInGroup({
        groupId,
        ownerChatId: g.ownerChatId,
        assigneeChatId: mid,
      });
      return { chatId: mid, name: nameByChat.get(mid) || mid, role: 'member', assignedCount };
    }));

    // Псевдо‑строка о том, что есть активные приглашения (опционально)
    const invitedRows = invitedPlaceholders.length
      ? [{ chatId: '—', name: 'Приглашённые (ожидают принятия)', role: 'invited', assignedCount: 0 }]
      : [];

    return res.json({
      ok: true,
      owner: { chatId: String(g.ownerChatId), name: ownerName, role: 'owner', assignedCount: null },
      members: [...membersWithCounts, ...invitedRows],
    });
  } catch (e) {
    console.error('GET /groups/:id/members error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// POST /groups/:id/invite  body: { chatId }  -> { ok, link, shareText }
app.post('/groups/:id/invite', async (req, res) => {
  try {
    const groupId = String(req.params.id);
    const actor = String(req.body?.chatId || '');
    if (!actor) return res.status(400).json({ ok: false, error: 'chatId_required' });

    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g) return res.status(404).json({ ok: false, error: 'group_not_found' });

    // Разрешим приглашать владельцу и участникам
    const allowed = await userIsGroupMemberOrOwner(actor, groupId);
    if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });

    const token = makeToken();
    const created = await prisma.inviteTicket.create({
      data: {
        token,
        type: 'GROUP',
        status: 'ACTIVE',
        groupId,
        taskId: null,
        invitedByChatId: actor,
      },
    });

    const link = `https://t.me/${process.env.BOT_USERNAME}?startapp=join__${created.groupId}__${created.token}`;
    const shareText = `Приглашаю тебя в группу: ${g.title}`;

    res.json({ ok: true, link, shareText });
  } catch (e) {
    console.error('POST /groups/:id/invite error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// DELETE /groups/:id/members/:memberChatId?byChatId=<OWNER>
// Только владелец может удалить участника. Все задачи участника в этой группе переходят на владельца.
app.delete('/groups/:id/members/:memberChatId', async (req, res) => {
  try {
    const groupId = String(req.params.id);
    const memberChatId = String(req.params.memberChatId);
    const byChatId = String(req.query.byChatId || ''); // владелец

    if (!byChatId) return res.status(400).json({ ok: false, error: 'byChatId_required' });

    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g) return res.status(404).json({ ok: false, error: 'group_not_found' });
    if (String(g.ownerChatId) !== byChatId) {
      return res.status(403).json({ ok: false, error: 'only_owner_allowed' });
    }
    if (String(memberChatId) === String(g.ownerChatId)) {
      return res.status(400).json({ ok: false, error: 'cannot_remove_owner' });
    }

    // Перевесим задачи участника в колонках этой группы на владельца
    await prisma.task.updateMany({
      where: {
        assigneeChatId: memberChatId,
        column: {
          chatId: String(g.ownerChatId),
          name: { startsWith: `${groupId}${GROUP_SEP}` },
        },
      },
      data: { assigneeChatId: String(g.ownerChatId) },
    });

    // Удалим участника из GroupMember (если был)
    await prisma.groupMember.deleteMany({
      where: { groupId, chatId: memberChatId },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /groups/:id/members/:memberChatId error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// POST /groups/:id/leave  body: { chatId }
// Не владелец может выйти из группы. Его задачи переходят на владельца.
app.post('/groups/:id/leave', async (req, res) => {
  try {
    const groupId = String(req.params.id);
    const who = String(req.body?.chatId || '');
    if (!who) return res.status(400).json({ ok: false, error: 'chatId_required' });

    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g) return res.status(404).json({ ok: false, error: 'group_not_found' });

    if (String(g.ownerChatId) === who) {
      return res.status(400).json({ ok: false, error: 'owner_cannot_leave' });
    }

    const isMember = await userIsGroupMemberOrOwner(who, groupId);
    if (!isMember) return res.status(403).json({ ok: false, error: 'not_member' });

    await prisma.task.updateMany({
      where: {
        assigneeChatId: who,
        column: {
          chatId: String(g.ownerChatId),
          name: { startsWith: `${groupId}${GROUP_SEP}` },
        },
      },
      data: { assigneeChatId: String(g.ownerChatId) },
    });

    await prisma.groupMember.deleteMany({
      where: { groupId, chatId: who },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /groups/:id/leave error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});




// === Prepared Share for GROUP invites ===
// POST /groups/:id/share-prepared
// body: { userId: number, allowGroups?: boolean, withButton?: boolean }
app.post('/groups/:id/share-prepared', async (req, res) => {
  try {
    const groupId = String(req.params.id);
    const { userId, allowGroups = true, withButton = true } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false, error: 'no_user_id' });

    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g) return res.status(404).json({ ok: false, error: 'group_not_found' });

    const botUser  = process.env.BOT_USERNAME;      // без @
    const appShort = process.env.APP_SHORT_NAME;    // короткое имя Mini App из BotFather
    if (!botUser || !appShort) {
      console.error('[group share-prepared] missing .env', { botUser: !!botUser, appShort: !!appShort });
      return res.status(500).json({ ok: false, error: 'missing_bot_env' });
    }

    // Создаём GROUP-инвайт и кладём join__<groupId>__<token> в кнопку
    const invite = await prisma.inviteTicket.create({
      data: {
        token: makeToken(),
        type: 'GROUP',
        status: 'ACTIVE',
        groupId: groupId,
        taskId: null,
        invitedByChatId: String(userId),
      }
    });

    const text = `Приглашаю тебя в группу: ${g.title}`.slice(0, 4096);
    const startappUrl = `https://t.me/${botUser}?startapp=join__${groupId}__${invite.token}`;

    const unique = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    const baseResult = {
      type: 'article',
      id: `group_${groupId}_${unique}`.slice(0,64),
      title: `Группа: ${g.title}`.slice(0, 64),
      input_message_content: { message_text: text }
    };

    const withUrlButton = withButton
      ? {
          ...baseResult,
          reply_markup: {
            inline_keyboard: [[ { text: 'Принять приглашение', url: startappUrl } ]]
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

    console.log('[group share-prepared:req]', { groupId, userId, resultId: payload.result.id, startappUrl });
    let tgResp = await tg('savePreparedInlineMessage', payload);
    console.log('[group share-prepared:resp]', JSON.stringify(tgResp));

    // Фолбэк на «минимальный» вариант, если TG откажет
    if (!tgResp?.ok || !(tgResp?.result?.id || tgResp?.result?.prepared_message_id)) {
      const fallback = { ...payload, result: baseResult };
      console.warn('[group share-prepared:fallback-minimal]', { resultId: fallback.result.id });
      tgResp = await tg('savePreparedInlineMessage', fallback);
      console.log('[group share-prepared:resp-fallback]', JSON.stringify(tgResp));
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
    console.error('POST /groups/:id/share-prepared error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});



const PORT = process.env.PORT || 3300;
app.listen(PORT, () => {
  console.log(`telegsar-api listening on :${PORT}`);
});