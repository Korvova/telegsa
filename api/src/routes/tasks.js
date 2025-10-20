// routes/tasks.js
import { Router } from 'express';
import { reevaluatePreTasksByTaskId } from '../scheduler.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const GROUP_SEP = '::';

// Status filters (column-name based)
const DONE_FILTER = [
  { column: { name: { equals: 'Done' } } },
  { column: { name: { endsWith: '::Done' } } },
];
const CANCEL_FILTER = [
  { column: { name: { equals: 'Cancel' } } },
  { column: { name: { endsWith: '::Cancel' } } },
];

function creatorIsMe(me) {
  return {
    OR: [
      { createdByChatId: String(me) },
      { AND: [{ createdByChatId: null }, { chatId: String(me) }] },
    ],
  };
}

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

// === TASK HISTORY HELPER ===
/**
 * Логирует действие в историю задачи
 * @param {string} taskId - ID задачи
 * @param {string} action - тип действия (status_changed, assignee_changed, etc.)
 * @param {string|null} actorChatId - кто совершил действие
 * @param {string|null} oldValue - старое значение
 * @param {string|null} newValue - новое значение
 * @param {object|null} metadata - дополнительные данные
 */
async function logTaskHistory(taskId, action, actorChatId, oldValue = null, newValue = null, metadata = null) {
  try {
    await prisma.taskHistory.create({
      data: {
        taskId: String(taskId),
        action: String(action),
        actorChatId: actorChatId ? String(actorChatId) : null,
        oldValue: oldValue ? String(oldValue) : null,
        newValue: newValue ? String(newValue) : null,
        metadata: metadata || undefined,
      },
    });
  } catch (e) {
    console.error('[logTaskHistory] error:', e);
  }
}

// ---- TG group aware notification helpers ----
async function resolveTaskGroup(task) {
  try {
    const col = await prisma.column.findUnique({ where: { id: task.columnId } });
    if (!col) return { groupId: null, tgChatId: null };
    const name = String(col.name || '');
    const i = name.indexOf(GROUP_SEP);
    const groupId = i > 0 ? name.slice(0, i) : null;
    if (!groupId) return { groupId: null, tgChatId: null };
    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g || !g.isTelegramGroup || !g.tgChatId) return { groupId, tgChatId: null };
    return { groupId, tgChatId: String(g.tgChatId) };
  } catch { return { groupId: null, tgChatId: null }; }
}

async function dmWriteAllowed(chatId) {
  try {
    const st = await prisma.notificationSetting.findUnique({ where: { telegramId: String(chatId) }, select: { writeAccessGranted: true } });
    return !!(st && st.writeAccessGranted);
  } catch { return false; }
}

async function sendTaskNotice(task, text, markup) {
  const { tgChatId } = await resolveTaskGroup(task);
  if (tgChatId) {
    try {
      const payload = {
        chat_id: tgChatId,
        text,
        disable_web_page_preview: true,
        reply_markup: markup,
      };
      if (String(task.sourceChatId || '') === String(tgChatId) && Number.isInteger(task.sourceMessageId)) {
        payload.reply_to_message_id = Number(task.sourceMessageId);
        payload.allow_sending_without_reply = true;
      }
      const sent = await tg('sendMessage', payload);
      if (sent?.ok) return true;
    } catch {}
  }
  // fallback to DM creator
  const to = String(task.createdByChatId || task.chatId);
  if (!(await dmWriteAllowed(to))) return false;
  try {
    await tg('sendMessage', { chat_id: to, text, disable_web_page_preview: true, reply_markup: markup });
    return true;
  } catch { return false; }
}

/**
 * Уведомить об комментарии:
 * - каждому адресату ровно ОДНО сообщение;
 * - если адресат = постановщик (есть task.sourceChatId/sourceMessageId) — шлём reply на исходное сообщение;
 * - у всех сообщений одна и та же inline-кнопка «Ответить» (открывает мини-апп на задаче).
 */
async function notifyAboutComment({ task, authorUser, authorChatId, text }) {
  try {
    // Если это TG‑проект — отправим одно сообщение в группу / fallback DM создателю
    const { tgChatId } = await resolveTaskGroup(task);
    const authorName = joinName(authorUser) || String(authorChatId || '') || 'Пользователь';
    const textMsg = fmtCommentText({ authorName, comment: text });
    const markup = { inline_keyboard: [[{ text: 'Ответить', url: miniAppLink(task.id) }]] };
    if (tgChatId) {
      await sendTaskNotice(task, textMsg, markup);
      return;
    }

    // Иначе — старая логика: 1) Кого уведомляем: исполнитель + постановщик
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

    // кто назначил (если есть)
    let actorName = 'Кто-то';
    if (actorChatId) {
      const actor = await prisma.user.findUnique({ where: { chatId: String(actorChatId) }, select: { chatId: true, firstName: true, lastName: true, username: true } });
      actorName = joinName(actor) || actorName;
    }
    const title = clip100(taskAfter.text || 'Без названия');
    const msg = `👤 <b>${actorName}</b> назначил(а) ответственного: <b>${joinName(assignee) || assignee.chatId}</b>\nЗадача: <b>${title}</b>`;
    const markup = { inline_keyboard: [[{ text: 'Открыть', url: miniAppLink(taskAfter.id) }]] };

    const { tgChatId } = await resolveTaskGroup(taskAfter);
    if (tgChatId) {
      await sendTaskNotice(taskAfter, msg, markup);
      return;
    }
    // DM (как было), но с учётом настроек
    const st = await prisma.notificationSetting.findUnique({ where: { telegramId: String(assignee.chatId) }, select: { receiveTaskAccepted: true, writeAccessGranted: true } });
    if (st && (!st.receiveTaskAccepted || !st.writeAccessGranted)) return;
    await tg('sendMessage', { chat_id: String(assignee.chatId), text: msg, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup });
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

    const task = await prisma.task.findUnique({ where: { id }, include: { column: true } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    // permissions: group comments or private board
    try {
      const nm = String(task?.column?.name || '');
      const i = nm.indexOf(GROUP_SEP);
      const groupId = i > 0 ? nm.slice(0, i) : null;
      if (groupId) {
        const g = await prisma.group.findUnique({ where: { id: groupId } });
        if (g && g.permEditJson && g.permEditJson.comments === false) {
          const isOwner = author && String(g.ownerChatId) === String(author);
          if (!isOwner) {
            const gm = author ? await prisma.groupMember.findFirst({ where: { groupId, chatId: String(author) } }) : null;
            const ov = gm?.permOverrides || null;
            const allow = !!(ov && ov.edit && ov.edit.comments === true);
            if (!allow) return res.status(403).json({ ok: false, error: 'no_rights' });
          }
        }
      } else {
        // private: разрешим постановщику/создателю/исполнителю
        const me = String(author || '');
        const creator = String(task.createdByChatId || task.chatId || '');
        const assignee = String(task.assigneeChatId || '');
        if (me && me !== creator && me !== assignee) {
          return res.status(403).json({ ok: false, error: 'no_rights' });
        }
      }
    } catch {}

    const authorUser = author
      ? await prisma.user.findUnique({
          where: { chatId: author },
          select: { chatId: true, firstName: true, lastName: true, username: true },
        })
      : null;

    const created = await prisma.comment.create({
      data: { taskId: id, authorChatId: author || '', text: commentText },
    });

    await notifyAboutComment({
      task,
      authorUser,
      authorChatId: author,
      text: commentText,
    });

    // Логируем добавление комментария
    ;(async () => {
      try {
        await logTaskHistory(id, 'comment_added', author, null, null, { commentId: created.id, text: commentText });
      } catch (e) {
        console.error('[POST /tasks/:id/comments] history logging error:', e);
      }
    })();

    res.json({ ok: true, comment: created });
  } catch (e) {
    console.error('POST /tasks/:id/comments error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// Удалить комментарий
// DELETE /tasks/:id/comments/:cid?chatId=...
router.delete('/:id/comments/:cid', async (req, res) => {
  try {
    const taskId = String(req.params.id);
    const cid = String(req.params.cid);
    const actor = String(req.query.chatId || '').trim();
    if (!actor) return res.status(400).json({ ok: false, error: 'chatId_required' });

    const c = await prisma.comment.findUnique({ where: { id: cid } });
    if (!c || String(c.taskId) !== taskId) return res.status(404).json({ ok: false, error: 'not_found' });

    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { column: true } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    // allow author always
    if (String(c.authorChatId) !== actor) {
      // group rules
      try {
        const nm = String(task?.column?.name || '');
        const i = nm.indexOf(GROUP_SEP);
        const groupId = i > 0 ? nm.slice(0, i) : null;
        if (groupId) {
          const g = await prisma.group.findUnique({ where: { id: groupId } });
          if (!g) return res.status(403).json({ ok: false, error: 'no_rights' });
          const isOwner = String(g.ownerChatId) === actor;
          if (!isOwner) {
            const gm = await prisma.groupMember.findFirst({ where: { groupId, chatId: actor } });
            const ov = gm?.permOverrides || null;
            const allow = !!(ov && ov.edit && ov.edit.comments === true);
            if (!allow) return res.status(403).json({ ok: false, error: 'no_rights' });
          }
        } else {
          // private: разрешим только автору (выше) — сюда не попадём
          return res.status(403).json({ ok: false, error: 'no_rights' });
        }
      } catch {
        return res.status(403).json({ ok: false, error: 'no_rights' });
      }
    }

    await prisma.comment.delete({ where: { id: cid } });

    // Логируем удаление комментария
    ;(async () => {
      try {
        await logTaskHistory(taskId, 'comment_deleted', actor, null, null, { commentId: cid, text: c.text });
      } catch (e) {
        console.error('[DELETE /tasks/:id/comments/:cid] history logging error:', e);
      }
    })();

    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /tasks/:id/comments/:cid error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/* ==================== ЗАДАЧИ ==================== */

// Установить вознаграждение (RUB) для задачи
// PATCH /tasks/:id/bounty { chatId, amount }
router.patch('/:id/bounty', async (req, res) => {
  try {
    const id = String(req.params.id);
    const amount = Number(req.body?.amount || 0);
    const chatId = String(req.body?.chatId || '');
    if (!Number.isFinite(amount) || amount < 0) return res.status(422).json({ ok: false, error: 'bad_amount' });

    const task = await prisma.task.findUnique({ where: { id }, select: { id: true, chatId: true } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });
    // (минимальная проверка) — можно усилить позднее
    if (chatId && String(task.chatId) !== String(chatId)) {
      // ignore for now
    }

    const rub = Math.max(0, Math.round(amount));
    const st = rub > 0 ? 'PLEDGED' : 'NONE';
    const updated = await prisma.task.update({ where: { id }, data: { bountyStars: rub, bountyStatus: st } });
    res.json({ ok: true, task: { id: updated.id, bountyStars: updated.bountyStars, bountyStatus: updated.bountyStatus } });
  } catch (e) {
    console.error('PATCH /tasks/:id/bounty error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// Удалить задачу
router.delete('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);

    const task = await prisma.task.findUnique({
      where: { id },
      include: { column: true },
    });
    if (!task) return res.status(404).json({ ok: false, error: 'not_found' });

    // --- Permissions: delete (group edit-json or private board creator/assignee) ---
    try {
      const nm = String(task?.column?.name || '');
      const iPerm = nm.indexOf(GROUP_SEP);
      const groupIdPerm = iPerm > 0 ? nm.slice(0, iPerm) : null;
      if (groupIdPerm) {
        // Determine actor from query/body when possible (best-effort)
        const actor = String(req.query?.chatId || req.body?.chatId || '').trim();
        if (actor) {
          const g = await prisma.group.findUnique({ where: { id: groupIdPerm } });
          if (g && String(g.ownerChatId) !== actor) {
            if (g.permEditJson && g.permEditJson.delete === false) {
              const gm = await prisma.groupMember.findFirst({ where: { groupId: groupIdPerm, chatId: actor } });
              const ov = gm?.permOverrides || null;
              const allowed = !!(ov && ov.edit && ov.edit.delete === true);
              if (!allowed) return res.status(403).json({ ok: false, error: 'no_rights' });
            }
          }
        }
      } else {
        // private board: require creator or assignee; try to read actor from req
        const actor = String(req.query?.chatId || req.body?.chatId || '').trim();
        if (actor) {
          const amCreator = String(task.chatId) === actor || String(task.createdByChatId || '') === actor;
          const amAssignee = task.assigneeChatId && String(task.assigneeChatId) === actor;
          if (!amCreator && !amAssignee) return res.status(403).json({ ok: false, error: 'forbidden' });
        }
      }
    } catch {}

    let groupId = null;
    const nm = task.column?.name || '';
    const i = nm.indexOf(GROUP_SEP);
    if (i > 0) groupId = nm.slice(0, i);

    // авто-рефанд поручителю (асинхронно, не блокируем удаление)
    ;(async () => {
      try {
        const ru = Number(task.bountyStars || 0);
        const st = String(task.bountyStatus || 'NONE');
        if (ru > 0 && st !== 'PAID') {
          const ownerChatId = String(task.createdByChatId || task.chatId || '');
          if (ownerChatId) {
            const port = Number(process.env.PORT || 3300);
            const base = `http://127.0.0.1:${port}`;
            await fetch(`${base}/bounty/refund-request`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId: ownerChatId, amountRub: ru, taskId: id }),
            }).catch(()=>{});
          }
        }
      } catch (e) { console.warn('[auto-refund:delete]', e); }
    })().catch(()=>{});

    await prisma.$transaction(async (tx) => {
      // Если есть PLEDGED bounty — вернём
      if (Number(task.bountyStars || 0) > 0 && String(task.bountyStatus || 'NONE') !== 'PAID') {
        await tx.starLedger.create({ data: { taskId: id, fromChatId: String(task.chatId), toChatId: null, amount: Number(task.bountyStars || 0), kind: 'REFUND' } });
      }
      // удалим и сместим ордера
      await tx.task.delete({ where: { id } });
      await tx.task.updateMany({
        where: { columnId: task.columnId, order: { gt: task.order } },
        data: { order: { decrement: 1 } },
      });
    });

    // reevaluate pretasks depending on this task (async, non-blocking)
    ;(async () => { try { await reevaluatePreTasksByTaskId(prisma, tg, id); } catch {} })();

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

    const before = await prisma.task.findUnique({ where: { id }, include: { column: true } });
    if (!before) return res.status(404).json({ ok: false, error: 'not_found' });

    // --- Permissions (group-level edit-json for text/assignee) ---
    try {
      const nm = String(before?.column?.name || '');
      const i = nm.indexOf(GROUP_SEP);
      const groupId = i > 0 ? nm.slice(0, i) : null;
      if (groupId) {
        const g = await prisma.group.findUnique({ where: { id: groupId } });
        if (g) {
          const actor = String(
            (req.body && (req.body.chatId || req.body.actorChatId)) ||
            (req.user && (req.user.chatId)) ||
            ''
          ).trim();
          const isOwner = actor && String(g.ownerChatId) === actor;
          const gm = actor ? await prisma.groupMember.findFirst({ where: { groupId, chatId: actor } }) : null;
          const ov = gm?.permOverrides || null;

          if ('text' in req.body || 'title' in req.body) {
            const def = g.permEditJson && g.permEditJson.text;
            if (def === false) {
              if (!actor) return res.status(403).json({ ok: false, error: 'no_rights' });
              if (!isOwner && !(ov && ov.edit && ov.edit.text === true)) {
                return res.status(403).json({ ok: false, error: 'no_rights' });
              }
            }
          }
          if ('assigneeChatId' in req.body || 'responsibleId' in req.body) {
            const def = g.permEditJson && g.permEditJson.assignee;
            if (def === false) {
              if (!actor) return res.status(403).json({ ok: false, error: 'no_rights' });
              if (!isOwner && !(ov && ov.edit && ov.edit.assignee === true)) {
                return res.status(403).json({ ok: false, error: 'no_rights' });
              }
            }
          }
        }
      }
    } catch {}

    const updated = await prisma.task.update({ where: { id }, data: patch });

    const actorChatId =
      (req.user && req.user.chatId) ||
      (req.body && (req.body.chatId || req.body.actorChatId)) ||
      null;

    // === LOG TASK HISTORY ===
    ;(async () => {
      try {
        // Логируем изменение текста
        if ('text' in patch && String(before.text) !== String(updated.text)) {
          await logTaskHistory(id, 'text_changed', actorChatId, before.text, updated.text);
        }

        // Логируем изменение статуса (смена колонки)
        if ('columnId' in patch && String(before.columnId) !== String(updated.columnId)) {
          const oldCol = await prisma.column.findUnique({ where: { id: before.columnId }, select: { name: true } });
          const newCol = await prisma.column.findUnique({ where: { id: updated.columnId }, select: { name: true } });
          const oldStatus = oldCol?.name?.split(GROUP_SEP).pop() || oldCol?.name || '';
          const newStatus = newCol?.name?.split(GROUP_SEP).pop() || newCol?.name || '';
          await logTaskHistory(id, 'status_changed', actorChatId, oldStatus, newStatus);
        }

        // Логируем изменение ответственного (assigneeChatId ИЛИ responsibleId)
        if (('assigneeChatId' in patch || 'responsibleId' in req.body) && String(before.assigneeChatId || '') !== String(updated.assigneeChatId || '')) {
          const oldUser = before.assigneeChatId ? await prisma.user.findUnique({ where: { chatId: String(before.assigneeChatId) } }) : null;
          const newUser = updated.assigneeChatId ? await prisma.user.findUnique({ where: { chatId: String(updated.assigneeChatId) } }) : null;
          await logTaskHistory(
            id,
            'assignee_changed',
            actorChatId,
            oldUser ? joinName(oldUser) : null,
            newUser ? joinName(newUser) : null
          );
        }
      } catch (e) {
        console.error('[PATCH /tasks/:id] history logging error:', e);
      }
    })();

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
    const limit  = Math.min(500, Math.max(1, parseInt(String(req.query.limit  || '30'), 10) || 30));
    const qRaw = String(req.query.q || '').trim();
    const q = qRaw ? qRaw : '';
    const statusesRaw = String(req.query.statuses || '').trim();
    const statusTokens = statusesRaw
      ? statusesRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];

    // include tasks I own/assigned + tasks from watched public groups
    const watched = await prisma.groupWatcher.findMany({ where: { chatId: me }, select: { groupId: true } });
    const watchedIds = watched.map(w => String(w.groupId));
    const watchedOr = watchedIds.map(id => ({ column: { name: { startsWith: `${id}${GROUP_SEP}` } } }));
    // Map human-readable statuses → canonical stage keys
    const mapToStage = (s) => {
      const t = String(s || '').toLowerCase();
      if (['inbox','новые','новое'].includes(t)) return 'Inbox';
      if (['doing','в работе'].includes(t)) return 'Doing';
      if (['approval','на согласовании','согласование'].includes(t)) return 'Approval';
      if (['wait','ждет','ждёт','ожидание'].includes(t)) return 'Wait';
      if (['done','готово','готов'].includes(t)) return 'Done';
      if (['cancel','отмена','отменено','отменена'].includes(t)) return 'Cancel';
      return null;
    };
    const stages = Array.from(new Set(statusTokens.map(mapToStage).filter(Boolean)));
    const statusClauses = [];
    for (const st of stages) {
      statusClauses.push({ column: { name: { equals: st } } });
      statusClauses.push({ column: { name: { endsWith: `${GROUP_SEP}${st}` } } });
    }

    const whereMembership = {
      OR: [
        { chatId: me },
        { assigneeChatId: me },
        ...watchedOr,
      ],
    };

    const andParts = [whereMembership];
    if (statusClauses.length) andParts.push({ OR: statusClauses });
    if (q) andParts.push({ text: { contains: q, mode: 'insensitive' } });

    // ----- advanced search (users by name/username/chatId; groups by title; labels by title) -----
    const qOrClauses = [];
    if (q) {
      // text contains
      qOrClauses.push({ text: { contains: q, mode: 'insensitive' } });
      // labels contain
      qOrClauses.push({ labels: { some: { label: { title: { contains: q, mode: 'insensitive' } } } } });
      // users by name/username/chatId
      try {
        const usersHit = await prisma.user.findMany({
          where: {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName:  { contains: q, mode: 'insensitive' } },
              { username:  { contains: q, mode: 'insensitive' } },
              { chatId:    { equals: q } },
            ],
          },
          select: { chatId: true },
          take: 100,
        });
        const ids = Array.from(new Set(usersHit.map(u => String(u.chatId))));
        if (ids.length) {
          qOrClauses.push({ createdByChatId: { in: ids } });
          qOrClauses.push({ assigneeChatId: { in: ids } });
          qOrClauses.push({ chatId: { in: ids } });
          qOrClauses.push({ sourceChatId: { in: ids } });
        }
      } catch {}
      // groups by title -> build OR on column name prefix
      try {
        const grpHit = await prisma.group.findMany({
          where: { title: { contains: q, mode: 'insensitive' } },
          select: { id: true },
          take: 100,
        });
        const gids = grpHit.map(g => String(g.id));
        if (gids.length) {
          qOrClauses.push({ OR: gids.map(id => ({ column: { name: { startsWith: `${id}${GROUP_SEP}` } } })) });
        }
      } catch {}
      if (qOrClauses.length) andParts.push({ OR: qOrClauses });
    }

    const tasks = await prisma.task.findMany({
      where: { AND: andParts },
      include: { column: { select: { name: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit,
    });

    const taskIds = tasks.map(t => t.id);
    const now = new Date();
    let nextByTask = new Map();
    if (taskIds.length) {
      try {
        const groups = await prisma.taskReminder.groupBy({
          by: ['taskId'],
          where: { taskId: { in: taskIds }, sentAt: null, fireAt: { gt: now } },
          _min: { fireAt: true },
        });
        nextByTask = new Map(groups.map(g => [g.taskId, g._min.fireAt]));
      } catch (e) {
        console.error('feed: groupBy task reminders failed:', e?.message || e);
      }
    }

    // comments count by task (for feed UI strip)
    let commentsCountByTask = new Map();
    if (taskIds.length) {
      try {
        const grp = await prisma.comment.groupBy({
          by: ['taskId'],
          where: { taskId: { in: taskIds } },
          _count: { _all: true },
        });
        commentsCountByTask = new Map(grp.map(g => [g.taskId, (g._count && typeof g._count._all === 'number') ? g._count._all : 0]));
      } catch (e) {
        console.error('feed: groupBy task comments failed:', e?.message || e);
      }
    }

    // подтянем заголовки групп по префиксу до "::"
    const groupIds = Array.from(new Set(
      tasks.map(t => {
        const nm = t.column?.name || '';
        const i = nm.indexOf(GROUP_SEP);
        return i > 0 ? nm.slice(0, i) : null;
      }).filter(Boolean)
    ));
    const groups = groupIds.length
      ? await prisma.group.findMany({ where: { id: { in: groupIds } }, select: { id: true, title: true, isTelegramGroup: true, isPublic: true } })
      : [];
    const gTitle = new Map(groups.map(g => [g.id, g.title]));
    const gIsTg  = new Map(groups.map(g => [g.id, !!g.isTelegramGroup]));
    const gIsPublic = new Map(groups.map(g => [g.id, !!g.isPublic]));

    // имена людей
    const ids = Array.from(new Set([
      ...tasks.map(t => String(t.chatId)),
      ...tasks.map(t => (t.assigneeChatId ? String(t.assigneeChatId) : '')).filter(Boolean),
      ...tasks.map(t => (t.sourceChatId ? String(t.sourceChatId) : '')).filter(Boolean),
      ...tasks.map(t => (t.createdByChatId ? String(t.createdByChatId) : '')).filter(Boolean),
    ]));
    const users = ids.length
      ? await prisma.user.findMany({
          where: { chatId: { in: ids } },
          select: { chatId: true, firstName: true, lastName: true, username: true },
        })
      : [];
    const userSet = new Set(users.map(u => String(u.chatId)));
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

  // определим корректного "постановщика": если sourceChatId есть и это известный user, берём его; иначе — task.chatId
  const creatorCid = t.createdByChatId ? String(t.createdByChatId)
    : (t.sourceChatId && userSet.has(String(t.sourceChatId)) ? String(t.sourceChatId) : String(t.chatId));

  // process graph quick stats for feed badges
  const leftKeys  = Array.isArray(t.processLeftKeys)  ? t.processLeftKeys  : [];
  const rightKeys = Array.isArray(t.processRightKeys) ? t.processRightKeys : [];
  const processLeftCount  = leftKeys.length;
  const processRightCount = rightKeys.length;
  const preChildrenCount  = rightKeys.filter(k => String(k).startsWith('pretask:')).length;
  const processHasEdges   = (processLeftCount + processRightCount) > 0;

  return {
    id: t.id,
    text: t.text,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    progress: typeof t.progress === 'number' ? t.progress : 0,
    deadlineAt: t.deadlineAt,
    nextReminderAt: nextByTask.get(t.id) || null,
    commentsCount: commentsCountByTask.get(t.id) || 0,
    bountyStars: t.bountyStars,
    bountyStatus: t.bountyStatus,
    complexity: t.complexity,
    acceptCondition: t.acceptCondition,
    status,
    groupId,
    groupTitle: groupId ? (gTitle.get(groupId) || 'Без группы') : 'Моя группа',
    isTelegramGroup: groupId ? (gIsTg.get(groupId) || false) : false,
    isPublicGroup: groupId ? (gIsPublic.get(groupId) || false) : false,
    creatorChatId: creatorCid,
    creatorName: fullName(creatorCid),
    assigneeChatId: t.assigneeChatId ? String(t.assigneeChatId) : null,
    assigneeName: t.assigneeChatId ? fullName(t.assigneeChatId) : null,

    // Показываем «процесс» бейдж, если задача создана из процесса ИЛИ имеет связи
    fromProcess: !!(t.fromProcess || processHasEdges),
    taskType: t.type || 'TASK',

    // Для UI: быстрая статистика процесса
    processLeftCount,
    processRightCount,
    preChildrenCount,
    processHasEdges,
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


// GET /tasks/created/count?chatId=ME&mode=active|total|done|cancel
router.get('/created/count', async (req, res) => {
  try {
    const me = String(req.query.chatId || '').trim();
    const mode = String(req.query.mode || 'active').toLowerCase();
    if (!me) return res.status(400).json({ ok: false, error: 'chatId_required' });

    const byMe = creatorIsMe(me);
    let where = byMe;
    if (mode === 'active') where = { AND: [byMe, { NOT: { OR: [...DONE_FILTER, ...CANCEL_FILTER] } }] };
    else if (mode === 'done') where = { AND: [byMe, { OR: [...DONE_FILTER] }] };
    else if (mode === 'cancel') where = { AND: [byMe, { OR: [...CANCEL_FILTER] }] };
    // else total

    const count = await prisma.task.count({ where });
    res.json({ ok: true, count });
  } catch (e) {
    console.error('GET /tasks/created/count error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

export { router as tasksRouter };
// Build task graph for a root task using denormalized keys (fallback to relations if absent)
router.get('/:id/graph', async (req, res) => {
  try {
    const id = String(req.params.id);
    const task = await prisma.task.findUnique({ where: { id }, select: { id: true, text: true, processLeftKeys: true, processRightKeys: true } });
    if (!task) return res.status(404).json({ ok: false, error: 'not_found' });

    const keys = new Set([`task:${id}`]);
    const left = Array.isArray(task.processLeftKeys) ? task.processLeftKeys : [];
    const right = Array.isArray(task.processRightKeys) ? task.processRightKeys : [];
    left.forEach(k => keys.add(String(k)));
    right.forEach(k => keys.add(String(k)));

    // Gather nodes data
    const taskIds = Array.from(keys).filter(k => k.startsWith('task:')).map(k => k.slice(5));
    const preIds = Array.from(keys).filter(k => k.startsWith('pretask:')).map(k => k.slice(8));
    const tasks = taskIds.length ? await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, text: true } }) : [];
    const pretasks = preIds.length ? await prisma.preTask.findMany({ where: { id: { in: preIds } }, select: { id: true, text: true, status: true, targetTaskId: true } }) : [];

    // Build edges from denormalized arrays for root only (will extend with process edges below)
    const edges = [];
    right.forEach((k) => edges.push({ source: `task:${id}`, target: String(k) }));
    left.forEach((k) => edges.push({ source: String(k), target: `task:${id}` }));

    // Positions (if any) from ProcessNode by scope groupId = `task:${id}`
    const proc = await prisma.groupProcess.findFirst({ where: { groupId: `task:${id}`, isActive: true }, orderBy: { createdAt: 'desc' } });
    const positions = {};
    if (proc) {
      // Collect process nodes to extend positions and include deeper nodes (grandchildren, etc.)
      const pNodes = await prisma.processNode.findMany({ where: { processId: proc.id }, select: { id: true, posX: true, posY: true, metaJson: true, taskId: true } });
      const keyByNodeId = new Map();
      const taskIdsExtra = new Set();
      const preIdsExtra = new Set();
      const inferKey = (n) => {
        let key = n?.metaJson?.key || null;
        if (!key) {
          const pre = n?.metaJson?.preTaskId ? String(n.metaJson.preTaskId) : null;
          if (pre) key = `pretask:${pre}`;
        }
        if (!key && n?.taskId) key = `task:${String(n.taskId)}`;
        if (!key && n?.metaJson?.clientRef) {
          const ref = String(n.metaJson.clientRef);
          if (/^pretask:/.test(ref) || preIds.includes(ref)) key = ref.startsWith('pretask:') ? ref : `pretask:${ref}`;
          else if (/^task:/.test(ref) || taskIds.includes(ref)) key = ref.startsWith('task:') ? ref : `task:${ref}`;
        }
        return key;
      };

      for (const n of pNodes) {
        const key = inferKey(n);
        if (!key) continue;
        keyByNodeId.set(String(n.id), String(key));
        positions[String(key)] = { x: n.posX || 0, y: n.posY || 0 };
        if (key.startsWith('task:')) taskIdsExtra.add(key.slice(5));
        if (key.startsWith('pretask:')) preIdsExtra.add(key.slice(8));
      }

      // Extend edges with process edges
      const pEdges = await prisma.processEdge.findMany({ where: { processId: proc.id } });
      const seen = new Set(edges.map((e) => `${e.source}->${e.target}`));
      for (const e of pEdges) {
        const s = keyByNodeId.get(String(e.sourceNodeId));
        const t = keyByNodeId.get(String(e.targetNodeId));
        if (!s || !t) continue;
        const k = `${s}->${t}`;
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push({ source: s, target: t });
      }

      // Дополнительно: если предзадача FIRED — копируем координаты в ключ задачи
      try {
        const allPreIds = Array.from(new Set([...(pretasks || []).map(p => String(p.id)), ...preIdsExtra]));
        if (allPreIds.length) {
          const preMeta = await prisma.preTask.findMany({ where: { id: { in: allPreIds } }, select: { id: true, status: true, targetTaskId: true } });
          const remap = new Map(); // pretask:<id> -> task:<id>
          for (const p of preMeta) {
            const pid = String(p.id);
            const tgt = p?.targetTaskId ? String(p.targetTaskId) : null;
            const fired = String(p.status || '') === 'FIRED' && !!tgt;
            if (!fired) continue;
            const preKey = `pretask:${pid}`;
            const taskKey = `task:${tgt}`;
            if (positions[preKey] && !positions[taskKey]) positions[taskKey] = positions[preKey];
            taskIdsExtra.add(tgt);
            remap.set(preKey, taskKey);
          }

          // Remap existing edges to task:<id> if endpoint pretasks are FIRED
          if (remap.size) {
            for (let i = 0; i < edges.length; i++) {
              const e = edges[i];
              const sNew = remap.get(String(e.source)) || e.source;
              const tNew = remap.get(String(e.target)) || e.target;
              edges[i] = { source: sNew, target: tNew };
            }
            // Deduplicate after remap
            const uniq = new Map();
            for (const e of edges) uniq.set(`${e.source}->${e.target}`, e);
            edges.length = 0; edges.push(...Array.from(uniq.values()));
          }
        }
      } catch {}

      // Fetch and append extra nodes not present in initial denorm lists
      const existingTaskIds = new Set(tasks.map(t => String(t.id)));
      const missingTaskIds = Array.from(taskIdsExtra).filter(id2 => !existingTaskIds.has(String(id2)));
      if (missingTaskIds.length) {
        const moreTasks = await prisma.task.findMany({ where: { id: { in: missingTaskIds } }, select: { id: true, text: true } });
        tasks.push(...moreTasks);
      }
      const existingPreIds = new Set(pretasks.map(p => String(p.id)));
      const missingPreIds = Array.from(preIdsExtra).filter(id2 => !existingPreIds.has(String(id2)));
      if (missingPreIds.length) {
        const morePre = await prisma.preTask.findMany({ where: { id: { in: missingPreIds } }, select: { id: true, text: true, status: true, targetTaskId: true } });
        pretasks.push(...morePre);
      }
    }

    // Fallback synthesis (recursive) for pretask -> pretask edges that were created from feed (no process edges yet)
    // 1) ensure direct pretasks of the root task
    try {
      const seenEdge = new Set(edges.map((e) => `${e.source}->${e.target}`));
      const existingPreIds = new Set(pretasks.map((p) => String(p.id)));

      const directPre = await prisma.preTask.findMany({
        where: { links: { some: { taskId: id } } },
        select: { id: true, text: true, status: true, targetTaskId: true },
      });
      for (const p of directPre) {
        const pid = String(p.id);
        if (!existingPreIds.has(pid)) { pretasks.push(p); existingPreIds.add(pid); }
        const ekey = `task:${id}->pretask:${pid}`;
        if (!seenEdge.has(ekey)) { seenEdge.add(ekey); edges.push({ source: `task:${id}`, target: `pretask:${pid}` }); }
      }

      // 2) рекурсивно добавляем потомков предзадач (pretask -> pretask)
      let frontier = new Set(directPre.map((p) => String(p.id)));
      const MAX_DEPTH = 5;
      for (let depth = 0; depth < MAX_DEPTH && frontier.size > 0; depth++) {
        const front = Array.from(frontier);
        frontier = new Set();
        if (!front.length) break;
        const children = await prisma.preTask.findMany({
          where: { links: { some: { depPreTaskId: { in: front } } } },
          select: { id: true, text: true, status: true, targetTaskId: true, links: { select: { depPreTaskId: true } } },
        });
        for (const ch of children) {
          const cid = String(ch.id);
          if (!existingPreIds.has(cid)) { pretasks.push({ id: ch.id, text: ch.text, status: ch.status, targetTaskId: ch.targetTaskId }); existingPreIds.add(cid); }
          // add edges from each parent in current layer
          for (const l of (ch.links || [])) {
            const pid = String(l.depPreTaskId || '');
            if (!pid || !front.includes(pid)) continue;
            const ekey = `pretask:${pid}->pretask:${cid}`;
            if (!seenEdge.has(ekey)) { seenEdge.add(ekey); edges.push({ source: `pretask:${pid}`, target: `pretask:${cid}` }); }
          }
          // grow next frontier
          frontier.add(cid);
        }
      }
    } catch (e) {
      console.warn('graph synth (pretask->pretask) failed', e?.message || e);
    }

    // Fallback synthesis: TaskRelation transitive closure around root (task -> task),
    // plus direct pretasks for all visited tasks and their recursive pretask-dependencies.
    try {
      const seen = new Set(edges.map((e) => `${e.source}->${e.target}`));
      const ensureEdge = (s, t) => { const k = `${s}->${t}`; if (!seen.has(k)) { edges.push({ source: s, target: t }); seen.add(k); } };

      // 2.1) BFS over TaskRelation to collect tasks around root
      const visitedTasks = new Set([String(id)]);
      let frontier = new Set([String(id)]);
      const MAX_TASK_DEPTH = 6;
      for (let depth = 0; depth < MAX_TASK_DEPTH && frontier.size > 0; depth++) {
        const layer = Array.from(frontier);
        frontier = new Set();
        const rels = await prisma.taskRelation.findMany({
          where: { OR: [ { fromTaskId: { in: layer } }, { toTaskId: { in: layer } } ] },
        });
        for (const r of rels) {
          const from = String(r.fromTaskId);
          const to = String(r.toTaskId);
          ensureEdge(`task:${from}`, `task:${to}`);
          if (!visitedTasks.has(from)) { visitedTasks.add(from); frontier.add(from); }
          if (!visitedTasks.has(to)) { visitedTasks.add(to); frontier.add(to); }
        }
      }
      // add missing tasks data
      const haveTaskIds = new Set(tasks.map((t) => String(t.id)));
      const moreTaskIds = Array.from(visitedTasks).filter((tid) => !haveTaskIds.has(tid));
      if (moreTaskIds.length) {
        const more = await prisma.task.findMany({ where: { id: { in: moreTaskIds } }, select: { id: true, text: true } });
        tasks.push(...more);
      }

      // 2.2) For all visited tasks, pull direct pretask children and edges task->pretask
      const vTaskArr = Array.from(visitedTasks);
      if (vTaskArr.length) {
        const links = await prisma.preTaskLink.findMany({ where: { taskId: { in: vTaskArr } }, select: { preTaskId: true, taskId: true } });
        const preIds = Array.from(new Set(links.map(l => String(l.preTaskId))));
        if (preIds.length) {
          const pres = await prisma.preTask.findMany({ where: { id: { in: preIds } }, select: { id: true, text: true, status: true, targetTaskId: true } });
          const preById = new Map(pres.map(p => [String(p.id), p]));
          for (const l of links) {
            const pid = String(l.preTaskId);
            const tid2 = String(l.taskId);
            ensureEdge(`task:${tid2}`, `pretask:${pid}`);
          }
          // append missing pretasks
          const havePreIds = new Set(pretasks.map(p => String(p.id)));
          const missingPre = pres.filter(p => !havePreIds.has(String(p.id)));
          if (missingPre.length) pretasks.push(...missingPre);

          // 2.3) Recursively add pre->pre children for these pretasks (transitive)
          let preFront = new Set(preIds);
          const MAX_PRE_DEPTH = 6;
          for (let d = 0; d < MAX_PRE_DEPTH && preFront.size > 0; d++) {
            const layer = Array.from(preFront);
            preFront = new Set();
            const children = await prisma.preTask.findMany({
              where: { links: { some: { depPreTaskId: { in: layer } } } },
              select: { id: true, text: true, status: true, targetTaskId: true, links: { select: { depPreTaskId: true } } },
            });
            for (const ch of children) {
              const cid = String(ch.id);
              // edges from each parent in current layer
              for (const l of (ch.links || [])) {
                const pid = String(l.depPreTaskId || '');
                if (!pid) continue;
                if (!layer.includes(pid)) continue;
                ensureEdge(`pretask:${pid}`, `pretask:${cid}`);
              }
              // add node
              if (!pretasks.some(p => String(p.id) === cid)) pretasks.push({ id: ch.id, text: ch.text, status: ch.status, targetTaskId: ch.targetTaskId });
              preFront.add(cid);
              // FIRED → task edge
              if (String(ch.status || '') === 'FIRED' && ch.targetTaskId) {
                const tgt = String(ch.targetTaskId);
                ensureEdge(`pretask:${cid}`, `task:${tgt}`);
                if (!tasks.some(t => String(t.id) === tgt)) {
                  const moreT = await prisma.task.findUnique({ where: { id: tgt }, select: { id: true, text: true } });
                  if (moreT) tasks.push(moreT);
                }
              }
            }
          }
        }
      }

      // 2.4) Traverse FIRED pre-tasks upwards to include ancestor tasks as well
      let taskFront = new Set(Array.from(visitedTasks));
      const MAX_FIRED_UP = 6;
      for (let d = 0; d < MAX_FIRED_UP && taskFront.size > 0; d++) {
        const layer = Array.from(taskFront);
        taskFront = new Set();
        const fired = await prisma.preTask.findMany({
          where: { targetTaskId: { in: layer }, status: 'FIRED' },
          select: { id: true, text: true, status: true, targetTaskId: true, links: { select: { taskId: true, depPreTaskId: true } } },
        });
        for (const p of fired) {
          const pid = String(p.id);
          // add node
          if (!pretasks.some(x => String(x.id) === pid)) pretasks.push({ id: p.id, text: p.text, status: p.status, targetTaskId: p.targetTaskId });
          // pre -> its target task (already in layer)
          ensureEdge(`pretask:${pid}`, `task:${String(p.targetTaskId)}`);
          // add edges from parent tasks to this pre
          for (const l of (p.links || [])) {
            if (l.taskId) {
              const parentTid = String(l.taskId);
              ensureEdge(`task:${parentTid}`, `pretask:${pid}`);
              if (!visitedTasks.has(parentTid)) { visitedTasks.add(parentTid); taskFront.add(parentTid); }
              if (!tasks.some(t => String(t.id) === parentTid)) {
                const moreT = await prisma.task.findUnique({ where: { id: parentTid }, select: { id: true, text: true } });
                if (moreT) tasks.push(moreT);
              }
            }
            if (l.depPreTaskId) {
              const parentPre = String(l.depPreTaskId);
              ensureEdge(`pretask:${parentPre}`, `pretask:${pid}`);
              if (!pretasks.some(x => String(x.id) === parentPre)) {
                const morePre = await prisma.preTask.findUnique({ where: { id: parentPre }, select: { id: true, text: true, status: true, targetTaskId: true } });
                if (morePre) pretasks.push(morePre);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('graph synth (task relations BFS) failed', e?.message || e);
    }

    res.json({ ok: true, root: `task:${id}`, tasks, pretasks, edges, positions });
  } catch (e) {
    console.error('GET /tasks/:id/graph error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/* ==================== TASK HISTORY ==================== */

// GET /tasks/:id/history - получить историю изменений задачи
router.get('/:id/history', async (req, res) => {
  try {
    const id = String(req.params.id);

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

    const history = await prisma.taskHistory.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
    });

    // Получаем имена всех участников
    const actorIds = Array.from(new Set(history.map(h => h.actorChatId).filter(Boolean)));
    const users = await prisma.user.findMany({
      where: { chatId: { in: actorIds } },
      select: { chatId: true, firstName: true, lastName: true, username: true },
    });
    const userMap = new Map(users.map(u => [String(u.chatId), joinName(u)]));

    const result = history.map(h => ({
      id: h.id,
      action: h.action,
      actorChatId: h.actorChatId,
      actorName: h.actorChatId ? (userMap.get(String(h.actorChatId)) || String(h.actorChatId)) : 'Система',
      oldValue: h.oldValue,
      newValue: h.newValue,
      metadata: h.metadata,
      createdAt: h.createdAt,
    }));

    res.json({ ok: true, history: result });
  } catch (e) {
    console.error('GET /tasks/:id/history error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

export default router;
