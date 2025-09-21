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
  const purge = String(req.query?.purge || '').toLowerCase();
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

      // Опциональная полная очистка
      const doPurge = purge === '1' || purge === 'true' || purge === 'yes';
      if (doPurge) {
        await tx.processEdge.deleteMany({ where: { processId: proc.id } });
        await tx.processNode.deleteMany({ where: { processId: proc.id } });
      }

      // 2) собрать существующие ноды
      const existing = await tx.processNode.findMany({ where: { processId: proc.id } });
      const byId = new Map(existing.map(n => [String(n.id), n]));
      const byKey = new Map();       // 'task:ID' | 'pretask:ID' | custom
      const byClientRef = new Map(); // metaJson.clientRef
      const byTaskId = new Map();
      for (const n of existing) {
        const meta = (n?.metaJson && typeof n.metaJson === 'object') ? n.metaJson : {};
        const key = meta?.key ? String(meta.key) : (meta?.preTaskId ? `pretask:${String(meta.preTaskId)}` : (n.taskId ? `task:${String(n.taskId)}` : null));
        if (key) byKey.set(key, n);
        const cref = meta?.clientRef ? String(meta.clientRef) : null;
        if (cref) byClientRef.set(cref, n);
        if (n.taskId) byTaskId.set(String(n.taskId), n);
      }

      // ленивое получение Inbox (только если встретится seed_new_) — работает только для реальных groupId
      let inboxInfo = null;
      const getInbox = async () => {
        if (!inboxInfo) inboxInfo = await resolveInbox(tx, groupId);
        return inboxInfo;
      };

      // предварительная проверка taskId
      const candidateTaskIds = new Set();
      for (const n of nodes) {
        const cid = n?.id ? String(n.id) : '';
        if (cid.startsWith('seed_task_')) candidateTaskIds.add(cid.slice('seed_task_'.length));
        if (n?.taskId) candidateTaskIds.add(String(n.taskId));
      }
      const validTaskIdSet = new Set();
      if (candidateTaskIds.size) {
        const check = await tx.task.findMany({ where: { id: { in: Array.from(candidateTaskIds) } }, select: { id: true } });
        for (const t of check) validTaskIdSet.add(String(t.id));
      }

      // 3) upsert нод
      const idMap = new Map();      // clientRef/key -> dbNodeId
      const nodeTaskByRef = new Map();// ref -> taskId
      const watchersByRef = new Map();

      function computeKeyFromPayload(n, taskId) {
        const meta = (n?.metaJson && typeof n.metaJson === 'object') ? n.metaJson : {};
        if (meta?.key) return String(meta.key);
        if (meta?.preTaskId) return `pretask:${String(meta.preTaskId)}`;
        if (taskId) return `task:${String(taskId)}`;
        if (n?.taskId) return `task:${String(n.taskId)}`;
        const rid = n?.id ? String(n.id) : '';
        if (rid.startsWith('seed_task_')) return `task:${rid.slice('seed_task_'.length)}`;
        return null;
      }

      for (const n of nodes) {
        const clientRef = n?.id ? String(n.id) : null;
        const title = String(n?.title || 'Новая задача').slice(0, 100);
        const createdBy = n?.createdByChatId ? String(n.createdByChatId) : String(chatId);
        let taskId = null;

        // вычислить taskId по входу (seed_task_/taskId) или создать по seed_new_
        if (clientRef && clientRef.startsWith('seed_task_')) {
          const cand = clientRef.slice('seed_task_'.length);
          taskId = validTaskIdSet.has(cand) ? cand : null;
        } else if (clientRef && clientRef.startsWith('seed_new_')) {
          try {
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
          } catch {
            // если не группа (например, task:<id> scope) — не создаём задачу
          }
        } else if (n?.taskId) {
          const cand = String(n.taskId);
          taskId = validTaskIdSet.has(cand) ? cand : null;
        }

        const desiredKey = computeKeyFromPayload(n, taskId);
        const metaIncoming = (n?.metaJson && typeof n.metaJson === 'object') ? { ...n.metaJson } : (n?.metaJson ? { raw: n.metaJson } : {});
        if (clientRef) metaIncoming.clientRef = clientRef;
        if (desiredKey) metaIncoming.key = desiredKey;

        // поиск существующей ноды по ключу/клиентскому id/задаче/прямому id
        let found = null;
        if (desiredKey && byKey.has(desiredKey)) found = byKey.get(desiredKey);
        else if (clientRef && byClientRef.has(clientRef)) found = byClientRef.get(clientRef);
        else if (taskId && byTaskId.has(String(taskId))) found = byTaskId.get(String(taskId));
        else if (clientRef && byId.has(clientRef)) found = byId.get(clientRef); // на случай если фронт прислал db id

        const dataCommon = {
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
        };

        let dbId = null;
        if (found) {
          // merge meta
          const prevMeta = (found?.metaJson && typeof found.metaJson === 'object') ? { ...found.metaJson } : {};
          const mergedMeta = { ...prevMeta, ...metaIncoming };
          const upd = await tx.processNode.update({ where: { id: found.id }, data: { ...dataCommon, taskId: taskId ?? found.taskId ?? null, metaJson: mergedMeta } });
          dbId = upd.id;
        } else {
          const created = await tx.processNode.create({ data: { ...dataCommon, taskId: taskId ?? null, metaJson: metaIncoming } });
          dbId = created.id;
        }

        const refKey = desiredKey || (clientRef ? String(clientRef) : String(dbId));
        idMap.set(refKey, dbId);
        if (clientRef) idMap.set(clientRef, dbId);
        if (taskId) nodeTaskByRef.set(refKey, taskId);
        if (Array.isArray(n?.watchers) && n.watchers.length) {
          watchersByRef.set(refKey, n.watchers.filter(Boolean).map((w) => String(w)));
        }
      }

      // 4) watchers merge (idempotent create)
      const watcherRows = [];
      for (const [ref, lst] of watchersByRef.entries()) {
        const nodeId = idMap.get(ref) || null;
        if (!nodeId) continue;
        for (const chatIdStr of lst) watcherRows.push({ nodeId, chatId: chatIdStr });
      }
      if (watcherRows.length) {
        await tx.processNodeWatcher.createMany({ data: watcherRows, skipDuplicates: true });
      }

      // 5) merge рёбер: добавляем/обновляем, не удаляем, если не purge
      const desiredEdges = [];
      const taskRelPairs = [];
      for (const e of edges) {
        if (!e?.source || !e?.target) continue;
        const rawSrc = String(e.source);
        const rawTgt = String(e.target);

        // попытки сопоставления: key, clientRef, dbId
        const srcDbId = idMap.get(rawSrc) || idMap.get(`task:${rawSrc}`) || idMap.get(`pretask:${rawSrc}`) || byId.get(rawSrc)?.id || null;
        const tgtDbId = idMap.get(rawTgt) || idMap.get(`task:${rawTgt}`) || idMap.get(`pretask:${rawTgt}`) || byId.get(rawTgt)?.id || null;
        if (!srcDbId || !tgtDbId) continue;

        desiredEdges.push({ sourceNodeId: srcDbId, targetNodeId: tgtDbId, enabled: (e?.enabled !== false) });

        const sTask = nodeTaskByRef.get(rawSrc) || null;
        const tTask = nodeTaskByRef.get(rawTgt) || null;
        if (sTask && tTask) taskRelPairs.push({ fromTaskId: sTask, toTaskId: tTask });
      }

      // существующие рёбра
      const existingEdges = await tx.processEdge.findMany({ where: { processId: proc.id } });
      const edgeKey = (a) => `${a.sourceNodeId}__${a.targetNodeId}`;
      const haveEdge = new Set(existingEdges.map((e) => edgeKey(e)));
      const desiredSet = new Set(desiredEdges.map((e) => edgeKey(e)));

      // add/update
      for (const de of desiredEdges) {
        if (haveEdge.has(edgeKey(de))) {
          await tx.processEdge.updateMany({ where: { processId: proc.id, sourceNodeId: de.sourceNodeId, targetNodeId: de.targetNodeId }, data: { enabled: de.enabled } });
        } else {
          await tx.processEdge.create({ data: { processId: proc.id, ...de } });
        }
      }

      // purge edges not present
      if (doPurge) {
        const toDelete = existingEdges.filter((e) => !desiredSet.has(edgeKey(e))).map((e) => e.id);
        if (toDelete.length) await tx.processEdge.deleteMany({ where: { id: { in: toDelete } } });
      }

      // 6) связи задач (минимизируем дубли) + обновление денорм-кэша соседей
      for (const pair of taskRelPairs) {
        const exists = await tx.taskRelation.findFirst({ where: { fromTaskId: pair.fromTaskId, toTaskId: pair.toTaskId }, select: { id: true } });
        if (!exists) {
          await tx.taskRelation.create({ data: { fromTaskId: pair.fromTaskId, toTaskId: pair.toTaskId, groupId: String(groupId), createdBy: String(chatId) } });
        }

        try {
          const fromId = String(pair.fromTaskId);
          const toId = String(pair.toTaskId);
          const fromRow = await tx.task.findUnique({ where: { id: fromId }, select: { processRightKeys: true } });
          const right = Array.isArray(fromRow?.processRightKeys) ? fromRow.processRightKeys : [];
          const keyR = `task:${toId}`;
          if (!right.includes(keyR)) {
            right.push(keyR);
            await tx.task.update({ where: { id: fromId }, data: { processRightKeys: right } });
          }
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

      return { ok: true, processId: proc.id, merge: !doPurge };
    }, { timeout: 20000, maxWait: 5000 });

    res.json(result);
  } catch (e) {
    console.error('[process] POST error', e);
    res.status(500).json({ ok: false, error: 'process_save_failed' });
  }
});

export default router;
