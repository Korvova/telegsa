// api/src/routes/process.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

/**
 * Найти Inbox для группы и вернуть { boardChatId, inbox, nextOrder }.
 * Inbox — колонка с именем `${groupId}::Inbox` у владельца группы.
 */
async function resolveInbox(prisma, groupId) {
  const g = await prisma.group.findUnique({ where: { id: String(groupId) } });
  if (!g) throw new Error('group_not_found');

  const boardChatId = g.ownerChatId;
  const GROUP_SEP = '::';
  const inboxName = `${groupId}${GROUP_SEP}Inbox`;

  const inbox = await prisma.column.findFirst({
    where: { chatId: boardChatId, name: inboxName },
  });
  if (!inbox) throw new Error('inbox_not_found');

  const last = await prisma.task.findFirst({
    where: { columnId: inbox.id },
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  const nextOrder = (last?.order ?? -1) + 1;
  return { boardChatId, inbox, nextOrder };
}

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

/* POST /groups/:groupId/process
 *
 * Тело: { chatId, nodes, edges }
 * - seed_task_<ID>  → ссылка на существующую задачу
 * - seed_new_*      → создать новую задачу в Inbox группы
 * После сохранения рёбер — создаём TaskRelation между связанными задачами.
 */
router.post('/groups/:groupId/process', async (req, res) => {
  const { groupId } = req.params;
  const { chatId, nodes = [], edges = [] } = req.body || {};
  if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1) найти/создать активный процесс
      let proc = await tx.groupProcess.findFirst({
        where: { groupId: String(groupId), isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!proc) {
        proc = await tx.groupProcess.create({
          data: {
            groupId: String(groupId),
            createdBy: String(chatId),
            runMode: 'MANUAL',
            isActive: true,
          },
        });
      }

      // 2) снести старую схему процесса (одним махом)
      await tx.processEdge.deleteMany({ where: { processId: proc.id } });
      await tx.processNode.deleteMany({ where: { processId: proc.id } });

      // 3) подготовка
      const idMap = new Map();      // clientRef -> dbNodeId
      const taskByClient = new Map();// clientRef -> taskId
      const watchersByClient = new Map(); // clientRef -> watchers[]

      // ленивое получение Inbox (только если встретится seed_new_)
      let inboxInfo = null;
      const getInbox = async () => {
        if (!inboxInfo) inboxInfo = await resolveInbox(tx, groupId);
        return inboxInfo;
      };

      // 4) подготовить список нод к createMany (после возможного создания задач)
      const nodeRows = [];

      // Подготовим список всех taskId из входящих нод, чтобы валидационно обнулить несуществующие и не ловить P2003
      const candidateTaskIds = new Set();
      for (const n of nodes) {
        const clientRef = n?.id ? String(n.id) : null;
        if (clientRef && clientRef.startsWith('seed_task_')) {
          candidateTaskIds.add(clientRef.slice('seed_task_'.length));
        } else if (n?.taskId) {
          candidateTaskIds.add(String(n.taskId));
        }
      }
      const validTaskIdSet = new Set();
      if (candidateTaskIds.size > 0) {
        const check = await tx.task.findMany({
          where: { id: { in: Array.from(candidateTaskIds) } },
          select: { id: true },
        });
        for (const t of check) validTaskIdSet.add(String(t.id));
      }
      for (const n of nodes) {
        const clientRef = n?.id ? String(n.id) : null;
        const title = String(n?.title || 'Новая задача').slice(0, 100);
        const createdBy = n?.createdByChatId ? String(n.createdByChatId) : String(chatId);
        let taskId = null;

        if (clientRef && clientRef.startsWith('seed_task_')) {
          const cand = clientRef.slice('seed_task_'.length);
          taskId = validTaskIdSet.has(cand) ? cand : null;
        } else if (clientRef && clientRef.startsWith('seed_new_')) {
          const info = await getInbox();
          const assignee = n?.assigneeChatId ? String(n.assigneeChatId) : String(chatId);
          const t = await tx.task.create({
            data: {
              chatId: info.boardChatId,
              columnId: info.inbox.id,
              order: info.nextOrder,
              text: title,
              assigneeChatId: assignee,
              type: (n?.type === 'EVENT' ? 'EVENT' : 'TASK'),
              fromProcess: true,
            },
          });
          taskId = t.id;
          inboxInfo.nextOrder++;
        } else if (n?.taskId) {
          const cand = String(n.taskId);
          taskId = validTaskIdSet.has(cand) ? cand : null;
        }

        if (clientRef && taskId) taskByClient.set(clientRef, taskId);
        if (clientRef && Array.isArray(n?.watchers) && n.watchers.length) {
          watchersByClient.set(clientRef, n.watchers.filter(Boolean).map((w) => String(w)));
        }

        const meta = (n?.metaJson && typeof n.metaJson === 'object') ? n.metaJson : (n?.metaJson ? { raw: n.metaJson } : {});
        if (clientRef) meta.clientRef = clientRef;

        nodeRows.push({
          processId: proc.id,
          title,
          posX: Number.isFinite(n?.posX) ? Number(n.posX) : 0,
          posY: Number.isFinite(n?.posY) ? Number(n.posY) : 0,
          assigneeChatId: n?.assigneeChatId ?? null,
          createdByChatId: createdBy,
          type: (n?.type === 'EVENT' ? 'EVENT' : 'TASK'),
          status: String(n?.status || 'PLANNED'),
          startMode: (n?.startMode ?? 'AFTER_ANY'),
          startDate: n?.startDate ? new Date(n.startDate) : null,
          startAfterDays: (Number.isFinite(n?.startAfterDays) ? Number(n.startAfterDays) : null),
          cancelMode: (n?.cancelMode ?? 'NONE'),
          taskId,
          metaJson: meta,
        });
      }

      if (nodeRows.length) {
        await tx.processNode.createMany({ data: nodeRows });
      }

      // прочитать созданные ноды и собрать мап clientRef -> id и id -> taskId
      const createdNodes = await tx.processNode.findMany({ where: { processId: proc.id } });
      for (const cn of createdNodes) {
        const clientRef = (cn.metaJson && cn.metaJson.clientRef) ? String(cn.metaJson.clientRef) : null;
        if (clientRef) idMap.set(clientRef, cn.id);
      }

      // watchers bulk
      const watcherRows = [];
      for (const [clientRef, lst] of watchersByClient.entries()) {
        const nodeId = idMap.get(clientRef);
        if (!nodeId) continue;
        for (const chatIdStr of lst) watcherRows.push({ nodeId, chatId: chatIdStr });
      }
      if (watcherRows.length) {
        await tx.processNodeWatcher.createMany({ data: watcherRows, skipDuplicates: true });
      }

      // 5) создать рёбра (bulk)
      const edgeRows = [];
      const taskRelPairs = [];
      for (const e of edges) {
        if (!e?.source || !e?.target) continue;
        const rawSrc = String(e.source);
        const rawTgt = String(e.target);
        const srcDbId = idMap.get(rawSrc) ?? rawSrc;
        const tgtDbId = idMap.get(rawTgt) ?? rawTgt;
        edgeRows.push({ processId: proc.id, sourceNodeId: srcDbId, targetNodeId: tgtDbId, enabled: (e?.enabled !== false) });

        const srcTaskId = taskByClient.get(rawSrc) || null;
        const tgtTaskId = taskByClient.get(rawTgt) || null;
        if (srcTaskId && tgtTaskId) taskRelPairs.push({ fromTaskId: srcTaskId, toTaskId: tgtTaskId });
      }
      if (edgeRows.length) {
        await tx.processEdge.createMany({ data: edgeRows });
      }

      // 6) связи задач (минимизируем дубли) + обновление денорм-кэша соседей
      for (const pair of taskRelPairs) {
        const exists = await tx.taskRelation.findFirst({ where: { fromTaskId: pair.fromTaskId, toTaskId: pair.toTaskId }, select: { id: true } });
        if (!exists) {
          await tx.taskRelation.create({ data: { fromTaskId: pair.fromTaskId, toTaskId: pair.toTaskId, groupId: String(groupId), createdBy: String(chatId) } });
        }

        // Update denormalized neighbor lists for fast graph build
        try {
          const fromId = String(pair.fromTaskId);
          const toId = String(pair.toTaskId);
          // from.processRightKeys += `task:${toId}`
          const fromRow = await tx.task.findUnique({ where: { id: fromId }, select: { processRightKeys: true } });
          const right = Array.isArray(fromRow?.processRightKeys) ? fromRow.processRightKeys : [];
          const keyR = `task:${toId}`;
          if (!right.includes(keyR)) {
            right.push(keyR);
            await tx.task.update({ where: { id: fromId }, data: { processRightKeys: right } });
          }
          // to.processLeftKeys += `task:${fromId}`
          const toRow = await tx.task.findUnique({ where: { id: toId }, select: { processLeftKeys: true } });
          const left = Array.isArray(toRow?.processLeftKeys) ? toRow.processLeftKeys : [];
          const keyL = `task:${fromId}`;
          if (!left.includes(keyL)) {
            left.push(keyL);
            await tx.task.update({ where: { id: toId }, data: { processLeftKeys: left } });
          }
        } catch (e) {
          console.warn('[process/save] denorm TaskRelation cache update failed', e?.message || e);
        }
      }

      return { ok: true, processId: proc.id };
    }, { timeout: 20000, maxWait: 5000 });

    res.json(result);
  } catch (e) {
    console.error('[process] POST error', e);
    res.status(500).json({ ok: false, error: 'process_save_failed' });
  }
});

export default router;
