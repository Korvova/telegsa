// api/src/routes/watchers.js
import express from 'express';
import { logTaskHistory, joinName } from '../services/taskHistory.js';

export function watchersRouter({ prisma }) {
  const router = express.Router();

  const GROUP_SEP = '::';
  const parseGroupIdFromColumnName = (name) => {
    const i = String(name || '').indexOf(GROUP_SEP);
    return i > 0 ? name.slice(0, i) : null;
  };

  async function getTask(taskId) {
    return prisma.task.findUnique({ where: { id: String(taskId) }, include: { column: true } });
  }

  // GET /tasks/:id/watchers
  router.get('/tasks/:id/watchers', async (req, res) => {
    try {
      const id = String(req.params.id);
      const rows = await prisma.taskWatcher.findMany({ where: { taskId: id }, orderBy: { createdAt: 'asc' } });
      const chatIds = rows.map((r) => String(r.chatId));
      const users = await prisma.user.findMany({ where: { chatId: { in: chatIds } } });
      const map = new Map(users.map((u) => [String(u.chatId), u]));
      const watchers = rows.map((r) => {
        const u = map.get(String(r.chatId));
        const name = u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || String(r.chatId) : String(r.chatId);
        return { chatId: String(r.chatId), name };
      });
      res.json({ ok: true, watchers });
    } catch (e) {
      console.error('[watchers] list error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // POST /tasks/:id/watchers { chatId }
  router.post('/tasks/:id/watchers', async (req, res) => {
    try {
      const id = String(req.params.id);
      const chatId = String(req.body?.chatId || '').trim();
      if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      const task = await getTask(id);
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });
      // permissions: if group forbids watchers edit, allow only owner or override
      try {
        const i = String(task?.column?.name || '').indexOf(GROUP_SEP);
        const groupId = i > 0 ? String(task?.column?.name || '').slice(0, i) : null;
        if (groupId) {
          const g = await prisma.group.findUnique({ where: { id: groupId } });
          if (g && g.permEditJson && g.permEditJson.watchers === false) {
            const isOwner = String(g.ownerChatId) === chatId;
            if (!isOwner) {
              const gm = await prisma.groupMember.findFirst({ where: { groupId, chatId } });
              const ov = gm?.permOverrides || null;
              if (!(ov && ov.edit && ov.edit.watchers === true)) {
                return res.status(403).json({ ok: false, error: 'no_rights' });
              }
            }
          }
        }
      } catch {}
      const result = await prisma.taskWatcher.upsert({
        where: { taskId_chatId: { taskId: id, chatId } },
        update: {},
        create: { taskId: id, chatId },
      });

      // Логируем добавление наблюдателя
      ;(async () => {
        try {
          const user = await prisma.user.findUnique({ where: { chatId }, select: { chatId: true, firstName: true, lastName: true, username: true } });
          const userName = user ? joinName(user) : chatId;
          await logTaskHistory(id, 'watcher_added', chatId, null, userName);
        } catch (e) {
          console.error('[watchers] history logging error:', e);
        }
      })().catch(() => {});

      res.json({ ok: true });
    } catch (e) {
      console.error('[watchers] subscribe error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // DELETE /tasks/:id/watchers?chatId=
  router.delete('/tasks/:id/watchers', async (req, res) => {
    try {
      const id = String(req.params.id);
      const targetChatId = String(req.query?.chatId || '').trim(); // кого убрать
      let actor = String(req.query?.byChatId || '').trim();        // кто выполняет
      if (!targetChatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      if (!actor) actor = targetChatId; // обратная совместимость: если нет byChatId — считаем, что снимает сам

      const task = await getTask(id);
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

      // permissions: если редактирование наблюдателей запрещено — разрешаем только владельцу или override; 
      // но сам себя (actor === target) можно всегда отписать
      try {
        const i = String(task?.column?.name || '').indexOf(GROUP_SEP);
        const groupId = i > 0 ? String(task?.column?.name || '').slice(0, i) : null;
        if (groupId && actor !== targetChatId) {
          const g = await prisma.group.findUnique({ where: { id: groupId } });
          if (g && g.permEditJson && g.permEditJson.watchers === false) {
            const isOwner = String(g.ownerChatId) === actor;
            if (!isOwner) {
              const gm = await prisma.groupMember.findFirst({ where: { groupId, chatId: actor } });
              const ov = gm?.permOverrides || null;
              if (!(ov && ov.edit && ov.edit.watchers === true)) {
                return res.status(403).json({ ok: false, error: 'no_rights' });
              }
            }
          }
        }
      } catch {}

      // Получаем имя наблюдателя перед удалением
      const user = await prisma.user.findUnique({ where: { chatId: targetChatId }, select: { chatId: true, firstName: true, lastName: true, username: true } });
      const userName = user ? joinName(user) : targetChatId;

      await prisma.taskWatcher.deleteMany({ where: { taskId: id, chatId: targetChatId } });

      // Логируем удаление наблюдателя
      ;(async () => {
        try {
          await logTaskHistory(id, 'watcher_removed', actor, userName, null);
        } catch (e) {
          console.error('[watchers] history logging error:', e);
        }
      })().catch(() => {});

      res.json({ ok: true });
    } catch (e) {
      console.error('[watchers] unsubscribe error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // POST /watchers/invite { taskId }
  router.post('/watchers/invite', async (req, res) => {
    try {
      const { taskId } = req.body || {};
      if (!taskId) return res.status(400).json({ ok: false, error: 'bad_request' });
      const task = await getTask(taskId);
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

      let groupId = task.column ? parseGroupIdFromColumnName(task.column.name) : null;
      if (!groupId) {
        const my = await prisma.group.findFirst({ where: { ownerChatId: String(task.chatId), title: 'Моя группа' }, select: { id: true } });
        if (my?.id) {
          groupId = my.id;
        } else {
          const created = await prisma.group.create({ data: { ownerChatId: String(task.chatId), title: 'Моя группа' } });
          groupId = created.id;
        }
      }

      const token = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 22).replace(/[^A-Za-z0-9_\-]/g, '_');
      await prisma.inviteTicket.create({
        data: {
          token,
          type: 'WATCH',
          status: 'ACTIVE',
          groupId: groupId,
          taskId: String(taskId),
          invitedByChatId: String(task.sourceChatId || task.chatId || ''),
        },
      });

      const botUser = process.env.BOT_USERNAME || process.env.BOT_USER || '';
      const startParam = `watch__${String(taskId)}__${token}`;
      const tmeStartApp = botUser
        ? `https://t.me/${botUser}?startapp=${encodeURIComponent(startParam)}`
        : `https://t.me/?startapp=${encodeURIComponent(startParam)}`;
      res.json({ ok: true, tmeStartApp, token });
    } catch (e) {
      console.error('[watchers] invite error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  return router;
}

export default watchersRouter;
