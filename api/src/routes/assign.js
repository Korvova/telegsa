// api/src/routes/assign.js
import express from 'express';
import crypto from 'crypto';
import { logTaskHistory, joinName } from '../services/taskHistory.js';

export function assignRouter({ prisma }) {
  const router = express.Router();

  const GROUP_SEP = '::';
  const b64url = (buf) =>
    buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const makeToken = () => b64url(crypto.randomBytes(16)); // 22 символа

  const parseGroupIdFromColumnName = (name) => {
    const i = String(name || '').indexOf(GROUP_SEP);
    return i > 0 ? name.slice(0, i) : null;
  };

  async function getTaskOr404(taskId, res) {
    const task = await prisma.task.findUnique({ where: { id: String(taskId) } });
    if (!task) {
      res.status(404).json({ ok: false, error: 'task_not_found' });
      return null;
    }
    return task;
  }

  // 👉 POST /assign/self { taskId, chatId }
  router.post('/self', async (req, res) => {
    try {
      const { taskId, chatId } = req.body || {};
      if (!taskId || !chatId) {
        return res.status(400).json({ ok: false, error: 'bad_request' });
      }

      const task = await getTaskOr404(taskId, res);
      if (!task) return;

      const updated = await prisma.task.update({
        where: { id: String(taskId) },
        data: { assigneeChatId: String(chatId) },
      });

      // Логируем изменение ответственного
      ;(async () => {
        try {
          const oldUser = task.assigneeChatId ? await prisma.user.findUnique({ where: { chatId: String(task.assigneeChatId) } }) : null;
          const newUser = await prisma.user.findUnique({ where: { chatId: String(chatId) } });
          await logTaskHistory(
            String(taskId),
            'assignee_changed',
            String(chatId),
            oldUser ? joinName(oldUser) : null,
            newUser ? joinName(newUser) : null
          );
        } catch (e) {
          console.error('[assign.self] history logging error:', e);
        }
      })().catch(() => {});

      // (опционально: можно уведомлять здесь,
      // но у тебя уже есть триггеры в другом месте — не трогаем)
      return res.json({
        ok: true,
        task: { id: updated.id, assigneeChatId: updated.assigneeChatId },
      });
    } catch (e) {
      console.error('[assign.self] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // 👉 POST /assign/invite { taskId }
  // Возвращает startParam и t.me ссылку для шейринга в другие мессенджеры
  router.post('/invite', async (req, res) => {
    try {
      const { taskId } = req.body || {};
      if (!taskId) return res.status(400).json({ ok: false, error: 'bad_request' });

      const task = await prisma.task.findUnique({
        where: { id: String(taskId) },
        include: { column: true },
      });
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

      // определяем groupId из имени колонки вида "<groupId>::Inbox"
      let groupId = task.column ? parseGroupIdFromColumnName(task.column.name) : null;
      if (!groupId) {
        // фолбэк: "Моя группа" владельца доски
        const my = await prisma.group.findFirst({
          where: { ownerChatId: String(task.chatId), title: 'Моя группа' },
          select: { id: true },
        });
        groupId = my?.id || null;
      }

      const token = makeToken();
      const invite = await prisma.inviteTicket.create({
        data: {
          token,
          type: 'TASK',
          status: 'ACTIVE',
          groupId: groupId,
          taskId: String(taskId),
          invitedByChatId: String(task.sourceChatId || task.chatId || ''), // кто инициировал
        },
      });

      const botUsername = process.env.BOT_USERNAME || process.env.BOT_USER || '';
      const startParam = `assign__${String(taskId)}__${invite.token}`; // поддерживается твоим парсером
      const tmeStartApp = botUsername
        ? `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`
        : `https://t.me/?startapp=${encodeURIComponent(startParam)}`;

      return res.json({ ok: true, token: invite.token, startParam, tmeStartApp });
    } catch (e) {
      console.error('[assign.invite] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // 👉 POST /assign/ping { taskId, toChatId }
  // Сервер отправляет в ЛС кандидату кнопку "Открыть задачу"
  router.post('/ping', async (req, res) => {
    try {
      const { taskId, toChatId } = req.body || {};
      if (!taskId || !toChatId) {
        return res.status(400).json({ ok: false, error: 'bad_request' });
      }

      const task = await prisma.task.findUnique({
        where: { id: String(taskId) },
        include: { column: true },
      });
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

      let groupId = task.column ? parseGroupIdFromColumnName(task.column.name) : null;
      if (!groupId) {
        const my = await prisma.group.findFirst({
          where: { ownerChatId: String(task.chatId), title: 'Моя группа' },
          select: { id: true },
        });
        groupId = my?.id || null;
      }

      const token = makeToken();
      await prisma.inviteTicket.create({
        data: {
          token,
          type: 'TASK',
          status: 'ACTIVE',
          groupId,
          taskId: String(taskId),
          invitedByChatId: String(task.sourceChatId || task.chatId || ''),
        },
      });

      const botUsername = process.env.BOT_USERNAME || process.env.BOT_USER || '';
      const startParam = `assign__${String(taskId)}__${token}`;
      const tmeStartApp = botUsername
        ? `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`
        : `https://t.me/?startapp=${encodeURIComponent(startParam)}`;

      // отправляем ЛС
      const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: String(toChatId),
          text: `Вас назначают ответственным по задаче «${task.text}». Нажмите, чтобы открыть и принять.`,
          reply_markup: { inline_keyboard: [[{ text: 'Открыть задачу', url: tmeStartApp }]] },
          disable_web_page_preview: true,
        }),
      });
      const data = await r.json();
      if (!data?.ok) {
        if (String(data?.error_code || '') === '403') {
          // пользователь не писал боту
          return res.json({ ok: false, error: 'need_manual' });
        }
        console.error('[assign.ping] telegram error', data);
        return res
          .status(502)
          .json({ ok: false, error: 'telegram_error', details: data?.description || '' });
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error('[assign.ping] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // 👉 POST /assign/unassign { taskId, chatId }
  // Убирает ответственного. Разрешено постановщику задачи, текущему ответственному,
  // а также владельцу/участнику группы, если задача в группе.
  router.post('/unassign', async (req, res) => {
    try {
      const { taskId, chatId } = req.body || {};
      if (!taskId || !chatId) {
        return res.status(400).json({ ok: false, error: 'bad_request' });
      }

      const task = await prisma.task.findUnique({
        where: { id: String(taskId) },
        include: { column: true },
      });
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

      // Проверка прав
      const colName = task?.column?.name || '';
      const groupId = parseGroupIdFromColumnName(colName);
      const isCreator = String(task.chatId) === String(chatId);
      const isAssignee = task.assigneeChatId && String(task.assigneeChatId) === String(chatId);

      let allowed = isCreator || isAssignee;
      if (!allowed && groupId) {
        // владелец/участник группы
        const g = await prisma.group.findUnique({ where: { id: groupId } });
        if (g && String(g.ownerChatId) === String(chatId)) allowed = true;
        if (!allowed) {
          const m = await prisma.groupMember.findFirst({ where: { groupId, chatId: String(chatId) } });
          allowed = Boolean(m);
        }
      }
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });

      const updated = await prisma.task.update({
        where: { id: String(taskId) },
        data: { assigneeChatId: null },
      });

      // Логируем удаление ответственного
      ;(async () => {
        try {
          const oldUser = task.assigneeChatId ? await prisma.user.findUnique({ where: { chatId: String(task.assigneeChatId) } }) : null;
          await logTaskHistory(
            String(taskId),
            'assignee_changed',
            String(chatId),
            oldUser ? joinName(oldUser) : null,
            null
          );
        } catch (e) {
          console.error('[assign.unassign] history logging error:', e);
        }
      })().catch(() => {});

      return res.json({ ok: true, task: { id: updated.id, assigneeChatId: updated.assigneeChatId } });
    } catch (e) {
      console.error('[assign.unassign] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  return router;
}
