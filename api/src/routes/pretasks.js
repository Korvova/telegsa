// api/src/routes/pretasks.js
import { Router } from 'express';
import { evaluatePreTask } from '../scheduler.js';

export function preTasksRouter({ prisma, tg }) {
  const router = Router();

  function normMode(mode) {
    const m = String(mode || '').toUpperCase();
    if (['AFTER_ALL_DONE','DATE_PLUS','DELAY_AFTER','AFTER_ALL_CANCELED'].includes(m)) return m;
    return 'AFTER_ALL_DONE';
  }

  async function detectCycle(preTaskId, links) {
    // links: array of { depPreTaskId? }
    const graph = new Map(); // preId -> set(deps)
    async function addNode(id) {
      if (!id) return;
      if (!graph.has(id)) graph.set(id, new Set());
      const rows = await prisma.preTaskLink.findMany({ where: { preTaskId: id } });
      for (const r of rows) if (r.depPreTaskId) graph.get(id).add(String(r.depPreTaskId));
    }
    await addNode(preTaskId);
    for (const l of links) if (l.depPreTaskId) {
      await addNode(String(l.depPreTaskId));
    }
    // include incoming edges being added now
    const set = graph.get(preTaskId) || new Set();
    for (const l of links) if (l.depPreTaskId) set.add(String(l.depPreTaskId));
    graph.set(preTaskId, set);

    // DFS cycle detect: does there exist path from any dep back to preTaskId
    function hasCycleFrom(node, target, visited = new Set()) {
      if (node === target) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      const deps = graph.get(node) || new Set();
      for (const d of deps) {
        if (hasCycleFrom(d, target, visited)) return true;
      }
      return false;
    }
    for (const d of graph.get(preTaskId) || new Set()) {
      if (hasCycleFrom(d, String(preTaskId), new Set())) return true;
    }
    return false;
  }

  // Create pre-task
  router.post('/pre-tasks', async (req, res) => {
    try {
      const body = req.body || {};
      const creatorChatId = String(body.chatId || body.creatorChatId || '').trim();
      if (!creatorChatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      const groupId = body.groupId ? String(body.groupId) : null;
      const text = String(body.text || '').trim();
      if (!text) return res.status(400).json({ ok: false, error: 'text_required' });
      const plannedAssigneeChatId = body.plannedAssigneeChatId ? String(body.plannedAssigneeChatId) : null;
      const triggerMode = normMode(body.triggerMode || body.mode);
      const startAt = body.startAt ? new Date(String(body.startAt)) : null;
      const delayMinutes = typeof body.delayMinutes === 'number' ? Math.max(0, Math.round(body.delayMinutes)) : null;
      const autoCancelOnAny = !!body.autoCancelOnAny;
      const timezone = body.timezone ? String(body.timezone) : null;

      const created = await prisma.preTask.create({
        data: {
          creatorChatId,
          groupId,
          text,
          payload: body.payload ?? null,
          plannedAssigneeChatId,
          triggerMode,
          startAt,
          delayMinutes,
          autoCancelOnAny,
          timezone,
          status: 'PREVIEW',
        },
      });

      const deps = Array.isArray(body.links) ? body.links : [];
      if (deps.length) {
        // prevent cycles
        const willCycle = await detectCycle(created.id, deps.filter(d => d.depPreTaskId));
        if (willCycle) return res.status(400).json({ ok: false, error: 'зацикленый алгоритм' });

        await prisma.$transaction(async (tx) => {
          for (const d of deps) {
            const row = { preTaskId: created.id, taskId: null, depPreTaskId: null };
            if (d.taskId) row.taskId = String(d.taskId);
            if (d.preTaskId || d.depPreTaskId) row.depPreTaskId = String(d.preTaskId || d.depPreTaskId);
            await tx.preTaskLink.create({ data: row });
          }
        });
      }

      const arm = !!body.arm;
      let armed = created;
      if (arm) {
        armed = await prisma.preTask.update({ where: { id: created.id }, data: { status: 'ARMED' } });
        // immediate evaluation
        try { await evaluatePreTask(prisma, tg, created.id); } catch {}
      }

      res.status(201).json({ ok: true, preTask: armed });
    } catch (e) {
      console.error('POST /pre-tasks error:', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // List pre-tasks by creator and optional group
  // GET /pre-tasks?chatId=...&groupId=...&status=PREVIEW,ARMED
  router.get('/pre-tasks', async (req, res) => {
    try {
      const chatId = String(req.query.chatId || '').trim();
      if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
      const groupId = req.query.groupId ? String(req.query.groupId) : undefined;
      const st = String(req.query.status || '').trim();
      let statuses = ['PREVIEW', 'ARMED'];
      if (st) statuses = st.split(',').map(s => s.trim()).filter(Boolean);

      const where = {
        creatorChatId: chatId,
        status: { in: statuses },
        ...(groupId ? { groupId } : {}),
      };
      const rows = await prisma.preTask.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        include: { links: true },
      });
      res.json({ ok: true, preTasks: rows });
    } catch (e) {
      console.error('GET /pre-tasks error:', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // Get one
  router.get('/pre-tasks/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      const row = await prisma.preTask.findUnique({ where: { id }, include: { links: true } });
      if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true, preTask: row });
    } catch (e) {
      console.error('GET /pre-tasks/:id error:', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // Update basic fields
  router.patch('/pre-tasks/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      const patch = {};
      if ('text' in req.body) patch.text = String(req.body.text || '');
      if ('plannedAssigneeChatId' in req.body) patch.plannedAssigneeChatId = req.body.plannedAssigneeChatId ? String(req.body.plannedAssigneeChatId) : null;
      if ('triggerMode' in req.body) patch.triggerMode = normMode(req.body.triggerMode);
      if ('startAt' in req.body) patch.startAt = req.body.startAt ? new Date(String(req.body.startAt)) : null;
      if ('delayMinutes' in req.body) patch.delayMinutes = typeof req.body.delayMinutes === 'number' ? Math.max(0, Math.round(req.body.delayMinutes)) : null;
      if ('autoCancelOnAny' in req.body) patch.autoCancelOnAny = !!req.body.autoCancelOnAny;
      if ('payload' in req.body) patch.payload = req.body.payload ?? null;
      if ('groupId' in req.body) patch.groupId = req.body.groupId ? String(req.body.groupId) : null;
      if ('timezone' in req.body) patch.timezone = req.body.timezone ? String(req.body.timezone) : null;

      const updated = await prisma.preTask.update({ where: { id }, data: patch });

      res.json({ ok: true, preTask: updated });
    } catch (e) {
      console.error('PATCH /pre-tasks/:id error:', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // Replace links
  router.put('/pre-tasks/:id/links', async (req, res) => {
    try {
      const id = String(req.params.id);
      const links = Array.isArray(req.body?.links) ? req.body.links : [];

      // цикл
      const willCycle = await detectCycle(id, links.filter(d => d.depPreTaskId || d.preTaskId));
      if (willCycle) return res.status(400).json({ ok: false, error: 'зацикленый алгоритм' });

      await prisma.$transaction(async (tx) => {
        await tx.preTaskLink.deleteMany({ where: { preTaskId: id } });
        for (const d of links) {
          const row = { preTaskId: id, taskId: null, depPreTaskId: null };
          if (d.taskId) row.taskId = String(d.taskId);
          if (d.preTaskId || d.depPreTaskId) row.depPreTaskId = String(d.preTaskId || d.depPreTaskId);
          await tx.preTaskLink.create({ data: row });
        }
      });
      res.json({ ok: true });
    } catch (e) {
      console.error('PUT /pre-tasks/:id/links error:', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // Arm / Cancel / Force-fire
  router.post('/pre-tasks/:id/arm', async (req, res) => {
    try {
      const id = String(req.params.id);
      const full = await prisma.preTask.findUnique({ where: { id }, include: { links: true } });
      if (!full) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!full.links || full.links.length === 0) return res.status(400).json({ ok: false, error: 'links_required' });
      // блок: AFTER_ALL_DONE + есть отменённые зависимости → зацикл/вечное ожидание
      if (String(full.triggerMode) === 'AFTER_ALL_DONE') {
        // compute anyCanceled
        let anyCanceled = false;
        for (const l of full.links) {
          if (l.taskId) {
            const t = await prisma.task.findUnique({ where: { id: String(l.taskId) }, include: { column: true } });
            if (!t || !t.column) { anyCanceled = true; break; }
            const phase = t.column.name?.includes('::') ? t.column.name.split('::').pop() : t.column.name;
            if (phase === 'Cancel') { anyCanceled = true; break; }
          } else if (l.depPreTaskId) {
            const p = await prisma.preTask.findUnique({ where: { id: String(l.depPreTaskId) } });
            if (!p) { anyCanceled = true; break; }
            if (String(p.status || '') === 'CANCELED') { anyCanceled = true; break; }
            if (p.targetTaskId) {
              const t = await prisma.task.findUnique({ where: { id: String(p.targetTaskId) }, include: { column: true } });
              const phase = t?.column?.name?.includes('::') ? t.column.name.split('::').pop() : t?.column?.name;
              if (phase === 'Cancel') { anyCanceled = true; break; }
            }
          }
        }
        if (anyCanceled) return res.status(400).json({ ok: false, error: 'dependency_canceled' });
      }

      const row = await prisma.preTask.update({ where: { id }, data: { status: 'ARMED' } });
      try { await evaluatePreTask(prisma, tg, id); } catch {}
      res.json({ ok: true, preTask: row });
    } catch (e) {
      console.error('POST /pre-tasks/:id/arm error:', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  router.post('/pre-tasks/:id/cancel', async (req, res) => {
    try {
      const id = String(req.params.id);
      const row = await prisma.preTask.update({ where: { id }, data: { status: 'CANCELED' } });
      res.json({ ok: true, preTask: row });
    } catch (e) {
      console.error('POST /pre-tasks/:id/cancel error:', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  router.post('/pre-tasks/:id/force-fire', async (req, res) => {
    try {
      const id = String(req.params.id);
      // просто переведём в ARMED и сразу evaluate
      await prisma.preTask.update({ where: { id }, data: { status: 'ARMED' } });
      await evaluatePreTask(prisma, tg, id);
      res.json({ ok: true });
    } catch (e) {
      console.error('POST /pre-tasks/:id/force-fire error:', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // DELETE /pre-tasks/:id — удалить предзадачу целиком (и её связи)
  router.delete('/pre-tasks/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      await prisma.$transaction(async (tx) => {
        await tx.preTaskLink.deleteMany({ where: { preTaskId: id } });
        await tx.preTask.delete({ where: { id } });
      });
      res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /pre-tasks/:id error:', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  return router;
}

export default preTasksRouter;
