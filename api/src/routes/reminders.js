// api/src/routes/reminders.js
import express from 'express';
import { scheduleTaskReminder, cancelTaskReminder } from '../scheduler.js';

export function remindersRouter({ prisma, tg }) {
  const router = express.Router();

  async function getTask(taskId) {
    return prisma.task.findUnique({ where: { id: String(taskId) } });
  }

  const TARGETS = new Set(['ME', 'RESPONSIBLE', 'ALL']);

  // GET /tasks/:id/reminders
  router.get('/tasks/:id/reminders', async (req, res) => {
    try {
      const id = String(req.params.id);
      const rows = await prisma.taskReminder.findMany({
        where: { taskId: id },
        orderBy: [{ sentAt: 'asc' }, { fireAt: 'asc' }],
      });
      res.json({ ok: true, reminders: rows });
    } catch (e) {
      console.error('[reminders] list error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // POST /tasks/:id/reminders  { createdBy, target, fireAt }
  router.post('/tasks/:id/reminders', async (req, res) => {
    try {
      const id = String(req.params.id);
      const { createdBy, target, fireAt } = req.body || {};
      const me = String(createdBy || '').trim();
      const t = String(target || '').trim().toUpperCase();
      const at = new Date(String(fireAt || ''));

      if (!me) return res.status(400).json({ ok: false, error: 'createdBy_required' });
      if (!TARGETS.has(t)) return res.status(400).json({ ok: false, error: 'bad_target' });
      if (Number.isNaN(at.getTime())) return res.status(400).json({ ok: false, error: 'bad_datetime' });

      const task = await getTask(id);
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

      // permissions: if group forbids reminders edit, check overrides
      try {
        const col = await prisma.column.findUnique({ where: { id: task.columnId } });
        const i = String(col?.name || '').indexOf('::');
        const groupId = i > 0 ? String(col?.name || '').slice(0, i) : null;
        if (groupId) {
          const g = await prisma.group.findUnique({ where: { id: groupId } });
          if (g && g.permEditJson && g.permEditJson.reminders === false) {
            const gm = await prisma.groupMember.findFirst({ where: { groupId, chatId: me } });
            const ov = gm?.permOverrides || null;
            const isOwner = String(g.ownerChatId) === me;
            const allow = isOwner || (ov && ov.edit && ov.edit.reminders === true);
            if (!allow) return res.status(403).json({ ok: false, error: 'no_rights' });
          }
        }
      } catch {}

      const created = await prisma.taskReminder.create({
        data: {
          taskId: id,
          target: t,
          fireAt: at,
          createdBy: me,
        },
      });

      try { await scheduleTaskReminder(prisma, tg, created.id); } catch {}
      res.json({ ok: true, reminder: created });
    } catch (e) {
      console.error('[reminders] create error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // DELETE /tasks/:taskId/reminders/:rid?chatId=
  router.delete('/tasks/:id/reminders/:rid', async (req, res) => {
    try {
      const id = String(req.params.id);
      const rid = String(req.params.rid);
      const me = String(req.query?.chatId || '').trim();
      const task = await getTask(id);
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

      try {
        const col = await prisma.column.findUnique({ where: { id: task.columnId } });
        const i = String(col?.name || '').indexOf('::');
        const groupId = i > 0 ? String(col?.name || '').slice(0, i) : null;
        if (groupId) {
          const g = await prisma.group.findUnique({ where: { id: groupId } });
          if (g && g.permEditJson && g.permEditJson.reminders === false) {
            const gm = await prisma.groupMember.findFirst({ where: { groupId, chatId: me } });
            const ov = gm?.permOverrides || null;
            const isOwner = String(g.ownerChatId) === me;
            const allow = isOwner || (ov && ov.edit && ov.edit.reminders === true);
            if (!allow) return res.status(403).json({ ok: false, error: 'no_rights' });
          }
        }
      } catch {}

      await prisma.taskReminder.delete({ where: { id: rid } }).catch(async () => {
        // При несоответствии — безопасно вернуть ok=false
        const ex = await prisma.taskReminder.findUnique({ where: { id: rid } });
        if (!ex) return; else throw new Error('delete_failed');
      });
      try { cancelTaskReminder(rid); } catch {}

      res.json({ ok: true });
    } catch (e) {
      console.error('[reminders] delete error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  return router;
}

export default remindersRouter;
