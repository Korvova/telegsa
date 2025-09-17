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
    // 1) найти/создать активный процесс
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

    // 2) снести старую схему процесса
    await prisma.processEdge.deleteMany({ where: { processId: proc.id } });
    await prisma.processNode.deleteMany({ where: { processId: proc.id } });

    // 3) подготовка мапов
    const idMap = new Map();          // clientId -> dbNodeId
    const nodeTaskId = new Map();     // dbNodeId  -> taskId (если есть)

    // ленивое получение Inbox (только если встретится seed_new_)
    let inboxInfo = null;
    const getInbox = async () => {
      if (!inboxInfo) inboxInfo = await resolveInbox(prisma, groupId);
      return inboxInfo;
    };

    // 4) создать узлы (и при необходимости задачи)
    for (const n of nodes) {
      const clientId = n?.id ? String(n.id) : null;
      const title = String(n?.title || 'Новая задача').slice(0, 100);
      const createdBy = n?.createdByChatId ? String(n.createdByChatId) : String(chatId);

      let taskId = null;

      // seed_task_<ID> → существующая задача
      if (clientId && clientId.startsWith('seed_task_')) {
        taskId = clientId.slice('seed_task_'.length);
      }
      // seed_new_* → создать новую задачу в Inbox
      else if (clientId && clientId.startsWith('seed_new_')) {
        const info = await getInbox(); // { boardChatId, inbox, nextOrder }
        const assignee = n?.assigneeChatId ? String(n.assigneeChatId) : String(chatId);

        const t = await prisma.task.create({
          data: {
            chatId: info.boardChatId,
            columnId: info.inbox.id,
            order: info.nextOrder,
            text: title,
            assigneeChatId: assignee,
            type: (n?.type === 'EVENT' ? 'EVENT' : 'TASK'),
            fromProcess: true, // 🔀
          },
        });
        taskId = t.id;
        // следующий order на будущее создание
        inboxInfo.nextOrder++;
      }
      // если фронт прислал явный taskId — привяжем
      else if (n?.taskId) {
        taskId = String(n.taskId);
      }

      // создаём сам узел процесса
      const created = await prisma.processNode.create({
        data: {
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

          taskId,                    // ← связь с реальной задачей (если есть/создали)
          metaJson: n?.metaJson ?? null,
        },
      });

      if (clientId) idMap.set(clientId, created.id);
      if (taskId) nodeTaskId.set(created.id, taskId);

      // watchers (если пришли)
      if (Array.isArray(n?.watchers) && n.watchers.length) {
        await prisma.processNodeWatcher.createMany({
          data: n.watchers
            .filter(Boolean)
            .map((w) => ({ nodeId: created.id, chatId: String(w) })),
          skipDuplicates: true,
        });
      }
    }

    // 5) создать рёбра и связи задач (TaskRelation)
    for (const e of edges) {
      if (!e?.source || !e?.target) continue;

      const rawSrc = String(e.source);
      const rawTgt = String(e.target);
      const srcDbId = idMap.get(rawSrc) ?? rawSrc;
      const tgtDbId = idMap.get(rawTgt) ?? rawTgt;

      await prisma.processEdge.create({
        data: {
          processId: proc.id,
          sourceNodeId: srcDbId,
          targetNodeId: tgtDbId,
          enabled: (e?.enabled !== false),
        },
      });

      // если оба узла привязаны к задачам — добавим связь задач (без дублей)
      const srcTaskId = nodeTaskId.get(srcDbId);
      const tgtTaskId = nodeTaskId.get(tgtDbId);
      if (srcTaskId && tgtTaskId) {
        const exists = await prisma.taskRelation.findFirst({
          where: { fromTaskId: srcTaskId, toTaskId: tgtTaskId },
          select: { id: true },
        });
        if (!exists) {
          await prisma.taskRelation.create({
            data: {
              fromTaskId: srcTaskId,
              toTaskId: tgtTaskId,
              groupId: String(groupId),
              createdBy: String(chatId),
            },
          });
        }
      }
    }

    res.json({ ok: true, processId: proc.id });
  } catch (e) {
    console.error('[process] POST error', e);
    res.status(500).json({ ok: false, error: 'process_save_failed' });
  }
});

export default router;
