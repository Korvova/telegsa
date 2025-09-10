// routes/tasks.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const GROUP_SEP = '::';

// --- Telegram helper (локально для этого файла) ---
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

// ===== helpers =====


// ===== helpers (обновлённые) =====
function miniAppLink(taskId) {
  const bot = process.env.BOT_USERNAME || process.env.TG_BOT_USERNAME || 'telegsar_bot';
  return `https://t.me/${bot}?startapp=task_${encodeURIComponent(taskId)}`;
}
function clip100(s = '') { return s.length > 100 ? s.slice(0, 100) + '…' : s; }
function joinName(u) {
  if (!u) return '';
  const fn = (u.firstName || '').trim();
  const ln = (u.lastName || '').trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ').trim();
  if (u.username) return `@${u.username}`;
  return String(u.chatId || '');
}

// Текст пуша без заголовка задачи — как просил:
function fmtCommentText({ authorName, comment }) {
  const who = `👤 ${authorName || 'Пользователь'}`;
  return `${who}\n𓂃✍︎\n${comment}`;
}

/**
 * Уведомить об комментарии:
 * - каждому адресату ровно ОДНО сообщение;
 * - если адресат = постановщик (есть task.sourceChatId/sourceMessageId) — шлём reply на исходное сообщение;
 * - у всех сообщений одна и та же inline-кнопка «Ответить» (открывает мини-апп на задаче).
 */
async function notifyAboutComment({ task, authorUser, authorChatId, text }) {
  try {
    // 1) Кого уведомляем: исполнитель + постановщик
    const rawTargets = [task.assigneeChatId, task.chatId].filter(Boolean).map(String);
    const targets = Array.from(new Set(rawTargets)); // <-- убираем дубли

    if (targets.length === 0) return;

    // 2) Проверим настройки (NotificationSetting.telegramId == chatId)
    const st = await prisma.notificationSetting.findMany({
      where: { telegramId: { in: targets } },
      select: { telegramId: true, receiveTaskComment: true, writeAccessGranted: true },
    });
    const allowed = new Set(
      st
        .filter((s) => (s.receiveTaskComment ?? true) && s.writeAccessGranted)
        .map((s) => String(s.telegramId))
    );

    // 3) Имя автора (падение на chatId, если нет профиля)
    const authorName = joinName(authorUser) || String(authorChatId || '') || 'Пользователь';
    const textMsg = fmtCommentText({ authorName, comment: text });

    const markup = {
      inline_keyboard: [[{ text: 'Ответить', url: miniAppLink(task.id) }]],
    };

    // 4) Отправки
    await Promise.all(
      targets
        .filter((t) => allowed.has(String(t)))
        .map((chatId) => {
          // Можно сделать reply только в чате, где лежит исходное сообщение задачи
          const canReplyHere =
            String(chatId) === String(task.sourceChatId) && Number.isInteger(task.sourceMessageId);

          const payload = {
            chat_id: chatId,
            text: textMsg,
            disable_web_page_preview: true,
            reply_markup: markup,
            ...(canReplyHere ? { reply_to_message_id: Number(task.sourceMessageId) } : {}),
          };
          return tg('sendMessage', payload);
        })
    );
  } catch (e) {
    console.error('[notifyAboutComment] error:', e);
  }
}


// Уведомление, когда появился ответственный
async function maybeNotifyTaskAccepted({ taskBefore, taskAfter, actorChatId }) {
  try {
    const was = taskBefore?.assigneeChatId || null;
    const now = taskAfter?.assigneeChatId || null;
    if (was === now || !now) return; // не изменилось или не назначен

    // новый ответственный
    const assignee = await prisma.user.findUnique({
      where: { chatId: String(now) },
      select: { chatId: true, firstName: true, lastName: true, username: true },
    });
    if (!assignee?.chatId) return;

    // настройки
    const st = await prisma.notificationSetting.findUnique({
      where: { telegramId: String(assignee.chatId) },
      select: { receiveTaskAccepted: true, writeAccessGranted: true },
    });
    if (st && (!st.receiveTaskAccepted || !st.writeAccessGranted)) return;

    // кто назначил (если есть)
    let actorName = 'Кто-то';
    if (actorChatId) {
      const actor = await prisma.user.findUnique({
        where: { chatId: String(actorChatId) },
        select: { chatId: true, firstName: true, lastName: true, username: true },
      });
      actorName = joinName(actor) || actorName;
    }

    const title = clip100(taskAfter.text || 'Без названия');
    const msg = `👤 <b>${actorName}</b> назначил(а) вам задачу: <b>${title}</b>`;

    await tg('sendMessage', {
      chat_id: String(assignee.chatId),
      text: msg,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: 'Открыть', url: miniAppLink(taskAfter.id) }]],
      },
    });
  } catch (e) {
    console.error('[maybeNotifyTaskAccepted] error:', e);
  }
}

/* ==================== КОММЕНТАРИИ ==================== */

// Получить последние комментарии задачи
// GET /tasks/:id/comments
router.get('/:id/comments', async (req, res) => {
  try {
    const id = String(req.params.id);
    const items = await prisma.comment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, authorChatId: true, text: true, createdAt: true },
    });

    // Подтянуть авторов разом
    const authorIds = Array.from(new Set(items.map((c) => String(c.authorChatId)))).filter(Boolean);
    const authors = await prisma.user.findMany({
      where: { chatId: { in: authorIds } },
      select: { chatId: true, firstName: true, lastName: true, username: true },
    });
    const map = new Map(authors.map((u) => [String(u.chatId), joinName(u)]));

    const result = items.map((c) => ({
      id: c.id,
      text: c.text,
      createdAt: c.createdAt,
      authorChatId: c.authorChatId,
      authorName: map.get(String(c.authorChatId)) || String(c.authorChatId),
    }));

    res.json({ ok: true, comments: result });
  } catch (e) {
    console.error('GET /tasks/:id/comments error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// Добавить комментарий
// POST /tasks/:id/comments { authorChatId: string, text: string }
// POST /tasks/:id/comments { authorChatId?: string, chatId?: string, text: string }
router.post('/:id/comments', async (req, res) => {
  try {
    const id = String(req.params.id);

    // ✅ поддерживаем оба варианта: authorChatId ИЛИ chatId
    const rawAuthor = req.body?.authorChatId ?? req.body?.chatId ?? null;
    const author = rawAuthor ? String(rawAuthor) : null;

    const commentText = String(req.body?.text || '').trim();
    if (!commentText) {
      return res.status(400).json({ ok: false, error: 'text_required' });
    }

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    const authorUser = author
      ? await prisma.user.findUnique({
          where: { chatId: author },
          select: { chatId: true, firstName: true, lastName: true, username: true },
        })
      : null;

    await prisma.comment.create({
      data: { taskId: id, authorChatId: author || '', text: commentText },
    });

    await notifyAboutComment({
      task,
      authorUser,
      authorChatId: author,
      text: commentText,
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('POST /tasks/:id/comments error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/* ==================== ЗАДАЧИ ==================== */

// Удалить задачу
router.delete('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);

    const task = await prisma.task.findUnique({
      where: { id },
      include: { column: true },
    });
    if (!task) return res.status(404).json({ ok: false, error: 'not_found' });

    let groupId = null;
    const nm = task.column?.name || '';
    const i = nm.indexOf(GROUP_SEP);
    if (i > 0) groupId = nm.slice(0, i);

    await prisma.$transaction(async (tx) => {
      // Если есть PLEDGED bounty — вернём
      if ((task as any).bountyStars > 0 && String((task as any).bountyStatus) !== 'PAID') {
        await tx.starLedger.create({ data: { taskId: id, fromChatId: String(task.chatId), toChatId: null, amount: (task as any).bountyStars, kind: 'REFUND' } });
      }
      // удалим и сместим ордера
      await tx.task.delete({ where: { id } });
      await tx.task.updateMany({
        where: { columnId: task.columnId, order: { gt: task.order } },
        data: { order: { decrement: 1 } },
      });
    });

    return res.json({ ok: true, groupId });
  } catch (e) {
    console.error('DELETE /tasks/:id error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});







// для процесса


// GET /tasks/:id/relations -> { outgoing: Task[], incoming: Task[] }
router.get('/:id/relations', async (req, res) => {
  try {
    const id = String(req.params.id);
    const outs = await prisma.taskRelation.findMany({ where: { fromTaskId: id } });
    const ins  = await prisma.taskRelation.findMany({ where: { toTaskId: id } });

    const outIds = outs.map(r => r.toTaskId);
    const inIds  = ins.map(r => r.fromTaskId);

    const outTasks = outIds.length
      ? await prisma.task.findMany({ where: { id: { in: outIds } }, select: { id: true, text: true } })
      : [];
    const inTasks = inIds.length
      ? await prisma.task.findMany({ where: { id: { in: inIds } }, select: { id: true, text: true } })
      : [];

    res.json({ ok: true, outgoing: outTasks, incoming: inTasks });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'relations_failed' });
  }
});





// Обновить задачу (текст / перемещение / назначение исполнителя)
router.patch('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const patch = {};

    if ('text' in req.body) patch.text = String(req.body.text ?? '');
    if ('title' in req.body) patch.text = String(req.body.title ?? '');

    if ('columnId' in req.body) patch.columnId = String(req.body.columnId);
    if ('order' in req.body) patch.order = Number(req.body.order);

    if ('assigneeChatId' in req.body) {
      patch.assigneeChatId =
        req.body.assigneeChatId === null ? null : String(req.body.assigneeChatId);
    }
    if ('responsibleId' in req.body) {
      patch.assigneeChatId =
        req.body.responsibleId === null ? null : String(req.body.responsibleId);
    }

    const before = await prisma.task.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ ok: false, error: 'not_found' });

    const updated = await prisma.task.update({ where: { id }, data: patch });

    const actorChatId =
      (req.user && req.user.chatId) ||
      (req.body && req.body.actorChatId) ||
      null;

    await maybeNotifyTaskAccepted({
      taskBefore: before,
      taskAfter: updated,
      actorChatId,
    });

    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('PATCH /tasks/:id error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});




// GET /tasks/feed
// --- Лента задач для "Главной": только мои как постановщик или ответственный ---
router.get('/feed', async (req, res) => {
  try {
    const me = String(req.query.chatId || '').trim();
    if (!me) return res.status(400).json({ ok: false, error: 'chatId_required' });

    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    const limit  = Math.min(50, Math.max(1, parseInt(String(req.query.limit  || '30'), 10) || 30));

    const tasks = await prisma.task.findMany({
      where: {
        OR: [{ chatId: me }, { assigneeChatId: me }],
      },
      include: { column: { select: { name: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit,
    });

    // подтянем заголовки групп по префиксу до "::"
    const groupIds = Array.from(new Set(
      tasks.map(t => {
        const nm = t.column?.name || '';
        const i = nm.indexOf(GROUP_SEP);
        return i > 0 ? nm.slice(0, i) : null;
      }).filter(Boolean)
    ));
    const groups = groupIds.length
      ? await prisma.group.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, title: true },
        })
      : [];
    const gmap = new Map(groups.map(g => [g.id, g.title]));

    // имена людей
    const ids = Array.from(new Set([
      ...tasks.map(t => String(t.chatId)),
      ...tasks.map(t => (t.assigneeChatId ? String(t.assigneeChatId) : '')).filter(Boolean),
    ]));
    const users = ids.length
      ? await prisma.user.findMany({
          where: { chatId: { in: ids } },
          select: { chatId: true, firstName: true, lastName: true, username: true },
        })
      : [];
    const fullName = (cid) => {
      const u = users.find(u => String(u.chatId) === String(cid));
      if (!u) return String(cid);
      const fn = (u.firstName || '').trim();
      const ln = (u.lastName || '').trim();
      if (fn || ln) return [fn, ln].filter(Boolean).join(' ');
      return u.username ? `@${u.username}` : String(cid);
    };

const items = tasks.map(t => {
  const cname = t.column?.name || '';
  const i = cname.indexOf(GROUP_SEP);
  const status  = i >= 0 ? cname.slice(i + GROUP_SEP.length) : cname;
  const groupId = i >= 0 ? cname.slice(0, i) : null;

  return {
    id: t.id,
    text: t.text,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    deadlineAt: t.deadlineAt,
    bountyStars: t.bountyStars,
    bountyStatus: t.bountyStatus,
    acceptCondition: t.acceptCondition,
    status,
    groupId,
    groupTitle: groupId ? (gmap.get(groupId) || 'Без группы') : 'Моя группа',
    creatorChatId: String(t.chatId),
    creatorName: fullName(t.chatId),
    assigneeChatId: t.assigneeChatId ? String(t.assigneeChatId) : null,
    assigneeName: t.assigneeChatId ? fullName(t.assigneeChatId) : null,

    fromProcess: !!t.fromProcess,     // ← добавили 🔀
    taskType: t.type || 'TASK',       // ← (необязательно, но удобно)
  };
});


    res.json({
      ok: true,
      items,
      nextOffset: offset + items.length,
      hasMore: items.length === limit,
    });
  } catch (e) {
    console.error('GET /tasks/feed simple error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});


export { router as tasksRouter };
