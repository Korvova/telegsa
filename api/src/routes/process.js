// api/src/routes/process.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

/**
 * GET /groups/:groupId/process
 * Возвращает активный процесс для группы + массивы узлов/рёбер.
 * (Реляции в Prisma не настраивали — читаем отдельными запросами)
 */
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

/**
 * POST /groups/:groupId/process
 * Сохраняет схему: перезаписывает узлы/рёбра для активного процесса.
 * Вход: { chatId, nodes: [{id?, title, assigneeChatId, posX, posY}], edges: [{id?, source, target}] }
 * Важно: если передан id у узла/ребра — сохраняем его, чтобы можно было линкуеть ребра.
 */
router.post('/groups/:groupId/process', async (req, res) => {
  const { groupId } = req.params;
  const { chatId, nodes = [], edges = [] } = req.body || {};

  if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });

  try {
    // найти или создать активный процесс
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

    // очистить прежнюю схему
    await prisma.processEdge.deleteMany({ where: { processId: proc.id } });
    await prisma.processNode.deleteMany({ where: { processId: proc.id } });

    // создать узлы (с сохранением переданных id, если есть)
    for (const n of nodes) {
      await prisma.processNode.create({
        data: {
          id: n.id ? String(n.id) : undefined, // позволяем клиентский id
          processId: proc.id,
          title: (n.title || 'Новая задача').slice(0, 100),
          assigneeChatId: n.assigneeChatId ? String(n.assigneeChatId) : null,
          posX: typeof n.posX === 'number' ? n.posX : 0,
          posY: typeof n.posY === 'number' ? n.posY : 0,
          status: 'PLANNED',
          metaJson: n.metaJson ?? null,
        },
      });
    }

    // создать рёбра (source/target — это id узлов)
    for (const e of edges) {
      if (!e.source || !e.target) continue;
      await prisma.processEdge.create({
        data: {
          id: e.id ? String(e.id) : undefined,
          processId: proc.id,
          sourceNodeId: String(e.source),
          targetNodeId: String(e.target),
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
