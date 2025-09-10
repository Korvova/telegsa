// api/src/routes/watchers.js
import express from 'express';

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
      await prisma.taskWatcher.upsert({
        where: { taskId_chatId: { taskId: id, chatId } },
        update: {},
        create: { taskId: id, chatId },
      });
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
      const chatId = String(req.query?.chatId || '').trim();
      if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      await prisma.taskWatcher.deleteMany({ where: { taskId: id, chatId } });
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
        groupId = my?.id || null;
      }

      const token = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 22).replace(/[^A-Za-z0-9_\-]/g, '_');
      await prisma.inviteTicket.create({
        data: {
          token,
          type: 'WATCH',
          status: 'ACTIVE',
          groupId: groupId!,
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
