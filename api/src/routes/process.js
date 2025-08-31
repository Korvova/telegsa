// api/src/routes/process.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

/* GET /groups/:groupId/process */
router.get('/groups/:groupId/process', async (req, res) => {
  const { groupId } = req.params;
  try {
    const proc = await prisma.groupProcess.findFirst({
      where: { groupId: String(groupId), isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!proc) {
      return res.json({ ok: true, process: null, nodes: [], edges: [] });
    }

    const nodes = await prisma.processNode.findMany({
      where: { processId: proc.id },
      orderBy: { createdAt: 'asc' },
    });

    const edges = await prisma.processEdge.findMany({
      where: { processId: proc.id },
    });

    res.json({ ok: true, process: proc, nodes, edges });
  } catch (e) {
    console.error('[process] GET error', e);
    res.status(500).json({ ok: false, error: 'process_get_failed' });
  }
});

/* POST /groups/:groupId/process */
router.post('/groups/:groupId/process', async (req, res) => {
  const { groupId } = req.params;
  const { chatId, nodes = [], edges = [] } = req.body || {};
  if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });

  try {
    // найти/создать активный процесс
    let proc = await prisma.groupProcess.findFirst({
      where: { groupId: String(groupId), isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!proc) {
      proc = await prisma.groupProcess.create({
        data: {
          groupId: String(groupId),
          createdBy: String(chatId),
          runMode: 'MANUAL',
          isActive: true,
        },
      });
    }

    // снести старую схему
    await prisma.processEdge.deleteMany({ where: { processId: proc.id } });
    await prisma.processNode.deleteMany({ where: { processId: proc.id } });

    // карта clientId -> dbId
    const idMap = new Map();

    // создать узлы (id не передаём — БД генерит)
    for (const n of nodes) {
      const clientId = n?.id ? String(n.id) : null;

  const created = await prisma.processNode.create({
  data: {
    processId: proc.id,
    title: String(n?.title || 'Новая задача').slice(0, 100),

    posX: Number.isFinite(n?.posX) ? Number(n.posX) : 0,
    posY: Number.isFinite(n?.posY) ? Number(n.posY) : 0,

    // роли
    assigneeChatId: n?.assigneeChatId ?? null,
    createdByChatId: n?.createdByChatId ?? String(chatId),

    // тип/статус
    type: (n?.type === 'EVENT' ? 'EVENT' : 'TASK'),
    status: String(n?.status || 'PLANNED'),

    // стартовые условия
    startMode: (n?.startMode ?? 'AFTER_ANY'),
    startDate: n?.startDate ? new Date(n.startDate) : null,
    startAfterDays: (Number.isFinite(n?.startAfterDays) ? Number(n.startAfterDays) : null),

    // условия отмены
    cancelMode: (n?.cancelMode ?? 'NONE'),

    // связь с задачей (если есть)
    taskId: n?.taskId ?? null,

    // расширяемый карман
    metaJson: n?.metaJson ?? null,
  },
});

// watchers (если пришли)
if (Array.isArray(n?.watchers) && n.watchers.length) {
  await prisma.processNodeWatcher.createMany({
    data: n.watchers
      .filter(Boolean)
      .map((w) => ({ nodeId: created.id, chatId: String(w) })),
    skipDuplicates: true,
  });
}

if (clientId) idMap.set(clientId, created.id);


     
    }

    // создать рёбра с ремапом source/target (id не передаём — БД генерит)
    for (const e of edges) {
      if (!e?.source || !e?.target) continue;

      const rawSrc = String(e.source);
      const rawTgt = String(e.target);
      const src = idMap.get(rawSrc) ?? rawSrc;
      const tgt = idMap.get(rawTgt) ?? rawTgt;

await prisma.processEdge.create({
  data: {
    processId: proc.id,
    sourceNodeId: src,
    targetNodeId: tgt,
    enabled: (e?.enabled !== false), // по умолчанию true
  },
});

    }

    res.json({ ok: true, processId: proc.id });
  } catch (e) {
    console.error('[process] POST error', e);
    res.status(500).json({ ok: false, error: 'process_save_failed' });
  }
});

export default router;
