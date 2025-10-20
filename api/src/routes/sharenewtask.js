// api/src/routes/sharenewtask.js
import express from 'express';
import crypto from 'crypto';
import { logTaskHistory } from '../services/taskHistory.js';

export function shareNewTaskRouter({ prisma }) {
  const router = express.Router();
  const GROUP_SEP = '::';
  const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const makeToken = () => b64url(crypto.randomBytes(16));

  const parseGroupIdFromColumnName = (name) => {
    const i = String(name || '').indexOf(GROUP_SEP);
    return i > 0 ? name.slice(0, i) : null;
  };

  // POST /sharenewtask/link  { taskId }
  router.post('/link', async (req, res) => {
    try {
      const { taskId } = req.body || {};
      if (!taskId) return res.status(400).json({ ok: false, error: 'bad_request' });

      const task = await prisma.task.findUnique({
        where: { id: String(taskId) },
        include: { column: true },
      });
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

      const token = makeToken();
      const bot = process.env.BOT_USERNAME || process.env.BOT_USER || '';
      const startParam = `newtask__${task.id}__${token}`;
      const link = bot
        ? `https://t.me/${bot}?startapp=${encodeURIComponent(startParam)}`
        : `https://t.me/?startapp=${encodeURIComponent(startParam)}`;

      return res.json({ ok: true, startParam, link, token });
    } catch (e) {
      console.error('[sharenewtask.link] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // POST /sharenewtask/accept  { chatId, taskId, token }
  // Логика: найти шаблонную задачу -> определить доску/группу -> если у пользователя уже есть копия (по тексту+группа+assignee), вернуть её; иначе создать новую в Inbox.
  router.post('/accept', async (req, res) => {
    try {
      const { chatId, taskId } = req.body || {};
      const who = String(chatId || '');
      const srcId = String(taskId || '');
      console.log('[sharenewtask.accept] called with:', { chatId: who, taskId: srcId });
      if (!who || !srcId) return res.status(400).json({ ok: false, error: 'bad_request' });

      const src = await prisma.task.findUnique({
        where: { id: srcId },
        include: { column: true },
      });
      if (!src) return res.status(404).json({ ok: false, error: 'task_not_found' });

      // выясняем groupId и владельца борды (личная или владельца группы)
      let groupId = src.column ? parseGroupIdFromColumnName(src.column.name) : null;
      let boardChatId = src.chatId;
      if (groupId) {
        const g = await prisma.group.findUnique({ where: { id: groupId } });
        if (!g) return res.status(404).json({ ok: false, error: 'group_not_found' });
        boardChatId = g.ownerChatId;
      }

      // гарантируем Inbox колонки этой борды/группы
      const inboxName = groupId ? `${groupId}${GROUP_SEP}Inbox` : 'Inbox';
      let inbox = await prisma.column.findFirst({
        where: { chatId: String(boardChatId), name: inboxName },
      });
      if (!inbox) {
        // создадим, если вдруг нет
        const count = await prisma.column.count({ where: { chatId: String(boardChatId) } });
        inbox = await prisma.column.create({
          data: { chatId: String(boardChatId), name: inboxName, order: count },
        });
      }

      // Автоматически добавляем пользователя в участники группы ПЕРЕД дедупликацией
      // чтобы он был добавлен даже если задача уже существует
      if (groupId && who) {
        try {
          const existingMember = await prisma.groupMember.findFirst({
            where: { groupId, chatId: who },
          });
          if (!existingMember) {
            await prisma.groupMember.create({
              data: { groupId, chatId: who, role: 'member' },
            });
            console.log('[sharenewtask.accept] ✅ Added user to group:', { groupId, chatId: who });
          } else {
            console.log('[sharenewtask.accept] ℹ️ User already in group:', { groupId, chatId: who });
          }
        } catch (err) {
          console.error('[sharenewtask.accept] ❌ Failed to add user to group:', err);
          // Не блокируем создание задачи, если не удалось добавить в группу
        }
      }

      // Дедупликация: ищем уже существующую копию этой задачи именно у этого пользователя в рамках этой борды/группы (по тексту + assignee + колонкам группы)
      const existing = await prisma.task.findFirst({
        where: {
          assigneeChatId: who,
          text: src.text,
          column: groupId
            ? { chatId: String(boardChatId), name: { startsWith: `${groupId}${GROUP_SEP}` } }
            : { chatId: String(boardChatId), name: { not: { contains: GROUP_SEP } } },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return res.json({ ok: true, taskId: existing.id, created: false });
      }

      // создаём новую в Inbox
      const last = await prisma.task.findFirst({
        where: { columnId: inbox.id },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      const nextOrder = (last?.order ?? -1) + 1;

      const clone = await prisma.task.create({
        data: {
          chatId: String(boardChatId),
          columnId: inbox.id,
          order: nextOrder,
          text: src.text,
          assigneeChatId: who,
          createdByChatId: src.createdByChatId || src.chatId, // Оригинальный создатель задачи
          // Копируем все важные параметры из исходной задачи
          deadlineAt: src.deadlineAt,
          acceptCondition: src.acceptCondition,
          expenses: src.expenses,
          complexity: src.complexity,
          type: src.type,
          startAt: src.startAt,
          endAt: src.endAt,
          // НЕ копируем: bounty, progress, tgMessageId, sourceChatId/sourceMessageId, fromProcess, processLeftKeys/processRightKeys, originPreTaskId
        },
      });

      // Логируем создание задачи через ссылку
      ;(async () => {
        try {
          await logTaskHistory(clone.id, 'task_created', who, null, src.text, { source: 'share_link', sourceTaskId: srcId });
        } catch (e) {
          console.error('[sharenewtask.accept] history logging error:', e);
        }
      })().catch(() => {});

      // Копируем напоминания из исходной задачи
      try {
        const srcReminders = await prisma.taskReminder.findMany({
          where: { taskId: srcId },
        });
        if (srcReminders.length > 0) {
          await prisma.taskReminder.createMany({
            data: srcReminders.map(r => ({
              id: 'cmgm' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
              taskId: clone.id,
              target: r.target,
              fireAt: r.fireAt,
              createdBy: who,
              replyToMessageId: null, // не копируем ссылку на сообщение
              sentAt: null, // напоминание еще не отправлено
              tries: 0,
            })),
          });
          console.log(`[sharenewtask.accept] ✅ Copied ${srcReminders.length} reminders`);
        }
      } catch (err) {
        console.error('[sharenewtask.accept] ⚠️ Failed to copy reminders:', err);
        // Не блокируем создание задачи, если не удалось скопировать напоминания
      }

      return res.json({ ok: true, taskId: clone.id, created: true });
    } catch (e) {
      console.error('[sharenewtask.accept] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // POST /sharenewtask/link-with-pretasks  { taskId }
  // Создание ссылки для копирования задачи со всеми связанными предзадачами
  router.post('/link-with-pretasks', async (req, res) => {
    try {
      const { taskId } = req.body || {};
      if (!taskId) return res.status(400).json({ ok: false, error: 'bad_request' });

      const task = await prisma.task.findUnique({
        where: { id: String(taskId) },
        include: { column: true },
      });
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

      const token = makeToken();
      const bot = process.env.BOT_USERNAME || process.env.BOT_USER || '';
      const startParam = `newtaskfull__${task.id}__${token}`;
      const link = bot
        ? `https://t.me/${bot}?startapp=${encodeURIComponent(startParam)}`
        : `https://t.me/?startapp=${encodeURIComponent(startParam)}`;

      return res.json({ ok: true, startParam, link, token });
    } catch (e) {
      console.error('[sharenewtask.link-with-pretasks] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // POST /sharenewtask/accept-with-pretasks  { chatId, taskId, token }
  // Рекурсивное копирование задачи со всеми предзадачами и их зависимостями
  router.post('/accept-with-pretasks', async (req, res) => {
    try {
      const { chatId, taskId } = req.body || {};
      const who = String(chatId || '');
      const srcId = String(taskId || '');
      console.log('[sharenewtask.accept-with-pretasks] called with:', { chatId: who, taskId: srcId });
      if (!who || !srcId) return res.status(400).json({ ok: false, error: 'bad_request' });

      const src = await prisma.task.findUnique({
        where: { id: srcId },
        include: { column: true },
      });
      if (!src) return res.status(404).json({ ok: false, error: 'task_not_found' });

      // Получаем ответственного исходной задачи для логики переназначения
      const originalAssignee = src.assigneeChatId;

      // выясняем groupId и владельца борды
      let groupId = src.column ? parseGroupIdFromColumnName(src.column.name) : null;
      let boardChatId = src.chatId;
      if (groupId) {
        const g = await prisma.group.findUnique({ where: { id: groupId } });
        if (!g) return res.status(404).json({ ok: false, error: 'group_not_found' });
        boardChatId = g.ownerChatId;
      }

      // гарантируем Inbox колонки этой борды/группы
      const inboxName = groupId ? `${groupId}${GROUP_SEP}Inbox` : 'Inbox';
      let inbox = await prisma.column.findFirst({
        where: { chatId: String(boardChatId), name: inboxName },
      });
      if (!inbox) {
        const count = await prisma.column.count({ where: { chatId: String(boardChatId) } });
        inbox = await prisma.column.create({
          data: { chatId: String(boardChatId), name: inboxName, order: count },
        });
      }

      // Добавляем пользователя в участники группы
      if (groupId && who) {
        try {
          const existingMember = await prisma.groupMember.findFirst({
            where: { groupId, chatId: who },
          });
          if (!existingMember) {
            await prisma.groupMember.create({
              data: { groupId, chatId: who, role: 'member' },
            });
            console.log('[sharenewtask.accept-with-pretasks] ✅ Added user to group:', { groupId, chatId: who });
          }
        } catch (err) {
          console.error('[sharenewtask.accept-with-pretasks] ❌ Failed to add user to group:', err);
        }
      }

      // Маппинг старых ID на новые для воссоздания связей
      const oldToNewTaskMap = new Map(); // srcTaskId -> newTaskId
      const oldToNewPreTaskMap = new Map(); // srcPreTaskId -> newPreTaskId
      const visitedPreTasks = new Set(); // защита от циклов

      // Рекурсивная функция для копирования предзадачи и всех её зависимостей
      const clonePreTaskRecursive = async (preTaskId, depth = 0) => {
        // Защита от бесконечной рекурсии
        if (depth > 1000) {
          console.warn('[sharenewtask] Max depth reached for preTask:', preTaskId);
          return null;
        }

        // Защита от циклов
        if (visitedPreTasks.has(preTaskId)) {
          console.log('[sharenewtask] Cycle detected, skipping preTask:', preTaskId);
          return oldToNewPreTaskMap.get(preTaskId) || null;
        }
        visitedPreTasks.add(preTaskId);

        // Если уже копировали - возвращаем новый ID
        if (oldToNewPreTaskMap.has(preTaskId)) {
          return oldToNewPreTaskMap.get(preTaskId);
        }

        // Загружаем предзадачу со всеми связями
        const srcPreTask = await prisma.preTask.findUnique({
          where: { id: preTaskId },
          include: {
            links: {
              include: {
                task: true,
                depPreTask: true,
              }
            }
          },
        });

        if (!srcPreTask) return null;

        // Определяем нового ответственного по логике:
        // Если ответственный предзадачи совпадает с ответственным главной задачи - меняем на who
        // Иначе оставляем прежнего
        let newAssignee = srcPreTask.plannedAssigneeChatId;
        if (newAssignee && newAssignee === originalAssignee) {
          newAssignee = who;
        }

        // Копируем предзадачу (пока без processKeys - обновим их позже)
        const newPreTask = await prisma.preTask.create({
          data: {
            creatorChatId: who,
            groupId: groupId,
            text: srcPreTask.text,
            payload: srcPreTask.payload,
            plannedAssigneeChatId: newAssignee,
            triggerMode: srcPreTask.triggerMode,
            startAt: srcPreTask.startAt,
            delayMinutes: srcPreTask.delayMinutes,
            autoCancelOnAny: srcPreTask.autoCancelOnAny,
            status: 'PREVIEW',
            timezone: srcPreTask.timezone,
          },
        });

        oldToNewPreTaskMap.set(preTaskId, newPreTask.id);
        console.log(`[sharenewtask] ✅ Cloned PreTask: ${preTaskId} -> ${newPreTask.id}, assignee: ${srcPreTask.plannedAssigneeChatId} -> ${newAssignee}`);

        // Рекурсивно копируем все зависимые предзадачи из PreTaskLink
        for (const link of srcPreTask.links) {
          if (link.depPreTaskId) {
            await clonePreTaskRecursive(link.depPreTaskId, depth + 1);
          }
        }

        // Рекурсивно копируем все предзадачи из processRightKeys
        if (srcPreTask.processRightKeys && Array.isArray(srcPreTask.processRightKeys)) {
          for (const key of srcPreTask.processRightKeys) {
            const keyStr = String(key);
            if (keyStr.startsWith('pretask:')) {
              const depPreTaskId = keyStr.substring('pretask:'.length);
              await clonePreTaskRecursive(depPreTaskId, depth + 1);
            }
          }
        }

        // Рекурсивно копируем все предзадачи из processLeftKeys
        if (srcPreTask.processLeftKeys && Array.isArray(srcPreTask.processLeftKeys)) {
          for (const key of srcPreTask.processLeftKeys) {
            const keyStr = String(key);
            if (keyStr.startsWith('pretask:')) {
              const depPreTaskId = keyStr.substring('pretask:'.length);
              await clonePreTaskRecursive(depPreTaskId, depth + 1);
            }
          }
        }

        return newPreTask.id;
      };

      // Создаем основную задачу
      const last = await prisma.task.findFirst({
        where: { columnId: inbox.id },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      const nextOrder = (last?.order ?? -1) + 1;

      const clone = await prisma.task.create({
        data: {
          chatId: String(boardChatId),
          columnId: inbox.id,
          order: nextOrder,
          text: src.text,
          assigneeChatId: who,
          createdByChatId: src.createdByChatId || src.chatId,
          deadlineAt: src.deadlineAt,
          acceptCondition: src.acceptCondition,
          expenses: src.expenses,
          complexity: src.complexity,
          type: src.type,
          startAt: src.startAt,
          endAt: src.endAt,
        },
      });

      oldToNewTaskMap.set(srcId, clone.id);
      console.log(`[sharenewtask] ✅ Cloned main task: ${srcId} -> ${clone.id}`);

      // Логируем создание задачи с предзадачами через ссылку
      ;(async () => {
        try {
          await logTaskHistory(clone.id, 'task_created', who, null, src.text, { source: 'share_link_with_pretasks', sourceTaskId: srcId });
        } catch (e) {
          console.error('[sharenewtask.accept-with-pretasks] history logging error:', e);
        }
      })().catch(() => {});

      // Копируем напоминания
      try {
        const srcReminders = await prisma.taskReminder.findMany({
          where: { taskId: srcId },
        });
        if (srcReminders.length > 0) {
          await prisma.taskReminder.createMany({
            data: srcReminders.map(r => ({
              id: 'cmgm' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
              taskId: clone.id,
              target: r.target,
              fireAt: r.fireAt,
              createdBy: who,
              replyToMessageId: null,
              sentAt: null,
              tries: 0,
            })),
          });
        }
      } catch (err) {
        console.error('[sharenewtask.accept-with-pretasks] ⚠️ Failed to copy reminders:', err);
      }

      // Находим все предзадачи, связанные с исходной задачей
      const preTaskLinks = await prisma.preTaskLink.findMany({
        where: { taskId: srcId },
        include: {
          preTask: {
            include: {
              links: {
                include: {
                  depPreTask: true,
                }
              }
            }
          }
        },
      });

      console.log(`[sharenewtask] Found ${preTaskLinks.length} preTasks linked to main task`);

      // Рекурсивно копируем все предзадачи
      for (const link of preTaskLinks) {
        if (link.preTaskId) {
          await clonePreTaskRecursive(link.preTaskId);
        }
      }

      // Воссоздаем все связи между скопированными предзадачами
      console.log(`[sharenewtask] Recreating links. Total cloned preTasks: ${oldToNewPreTaskMap.size}`);

      for (const [oldPreTaskId, newPreTaskId] of oldToNewPreTaskMap.entries()) {
        const srcPreTask = await prisma.preTask.findUnique({
          where: { id: oldPreTaskId },
          include: { links: true },
        });

        if (!srcPreTask) continue;

        for (const link of srcPreTask.links) {
          // Создаем связь в новой предзадаче
          const newLink = {
            preTaskId: newPreTaskId,
            taskId: null,
            depPreTaskId: null,
          };

          // Если связь на Task - связываем с новой задачей
          if (link.taskId) {
            const newTaskId = oldToNewTaskMap.get(link.taskId);
            if (newTaskId) {
              newLink.taskId = newTaskId;
            }
          }

          // Если связь на другую PreTask - связываем с новой предзадачей
          if (link.depPreTaskId) {
            const newDepPreTaskId = oldToNewPreTaskMap.get(link.depPreTaskId);
            if (newDepPreTaskId) {
              newLink.depPreTaskId = newDepPreTaskId;
            }
          }

          // Создаем связь только если есть цель
          if (newLink.taskId || newLink.depPreTaskId) {
            await prisma.preTaskLink.create({ data: newLink });
            console.log(`[sharenewtask] ✅ Created link: PreTask ${newPreTaskId} -> ${newLink.taskId ? 'Task ' + newLink.taskId : 'PreTask ' + newLink.depPreTaskId}`);
          }
        }
      }

      // Обновляем processLeftKeys и processRightKeys с новыми ID
      console.log(`[sharenewtask] Updating processKeys...`);
      for (const [oldPreTaskId, newPreTaskId] of oldToNewPreTaskMap.entries()) {
        const srcPreTask = await prisma.preTask.findUnique({
          where: { id: oldPreTaskId },
        });

        if (!srcPreTask) continue;

        const updateData = {};

        // Обновляем processLeftKeys
        if (srcPreTask.processLeftKeys && Array.isArray(srcPreTask.processLeftKeys)) {
          const newLeftKeys = srcPreTask.processLeftKeys.map(key => {
            const keyStr = String(key);
            if (keyStr.startsWith('task:')) {
              const taskId = keyStr.substring('task:'.length);
              const newTaskId = oldToNewTaskMap.get(taskId);
              return newTaskId ? `task:${newTaskId}` : key;
            } else if (keyStr.startsWith('pretask:')) {
              const preTaskId = keyStr.substring('pretask:'.length);
              const newPretaskId = oldToNewPreTaskMap.get(preTaskId);
              return newPretaskId ? `pretask:${newPretaskId}` : key;
            }
            return key;
          });
          updateData.processLeftKeys = newLeftKeys;
        }

        // Обновляем processRightKeys
        if (srcPreTask.processRightKeys && Array.isArray(srcPreTask.processRightKeys)) {
          const newRightKeys = srcPreTask.processRightKeys.map(key => {
            const keyStr = String(key);
            if (keyStr.startsWith('task:')) {
              const taskId = keyStr.substring('task:'.length);
              const newTaskId = oldToNewTaskMap.get(taskId);
              return newTaskId ? `task:${newTaskId}` : key;
            } else if (keyStr.startsWith('pretask:')) {
              const preTaskId = keyStr.substring('pretask:'.length);
              const newPretaskId = oldToNewPreTaskMap.get(preTaskId);
              return newPretaskId ? `pretask:${newPretaskId}` : key;
            }
            return key;
          });
          updateData.processRightKeys = newRightKeys;
        }

        // Применяем обновления, если есть что обновлять
        if (Object.keys(updateData).length > 0) {
          await prisma.preTask.update({
            where: { id: newPreTaskId },
            data: updateData,
          });
          console.log(`[sharenewtask] ✅ Updated processKeys for PreTask ${newPreTaskId}`);
        }
      }

      // Копируем позиции из ProcessNode (координаты на холсте)
      console.log(`[sharenewtask] Copying process positions...`);
      try {
        // Находим процесс исходной задачи
        const srcProcess = await prisma.groupProcess.findFirst({
          where: { groupId: `task:${srcId}`, isActive: true },
          orderBy: { createdAt: 'desc' },
        });

        if (srcProcess) {
          console.log(`[sharenewtask] Found source process: ${srcProcess.id}`);

          // Создаем новый процесс для клонированной задачи
          const newProcess = await prisma.groupProcess.create({
            data: {
              groupId: `task:${clone.id}`,
              isActive: true,
            },
          });
          console.log(`[sharenewtask] Created new process: ${newProcess.id}`);

          // Загружаем все узлы и рёбра исходного процесса
          const srcNodes = await prisma.processNode.findMany({
            where: { processId: srcProcess.id },
          });
          const srcEdges = await prisma.processEdge.findMany({
            where: { processId: srcProcess.id },
          });

          console.log(`[sharenewtask] Found ${srcNodes.length} nodes and ${srcEdges.length} edges`);

          // Маппинг старых nodeId на новые
          const oldToNewNodeMap = new Map();

          // Копируем все узлы с новыми ID задач/предзадач
          for (const node of srcNodes) {
            // Определяем ключ узла (task:id или pretask:id)
            let key = node?.metaJson?.key || null;
            if (!key) {
              const pre = node?.metaJson?.preTaskId ? String(node.metaJson.preTaskId) : null;
              if (pre) key = `pretask:${pre}`;
            }
            if (!key && node?.taskId) key = `task:${String(node.taskId)}`;

            // Обновляем ID в ключе, если он изменился
            let newKey = key;
            let newTaskId = node.taskId;
            let newMetaJson = node.metaJson ? { ...node.metaJson } : {};

            if (key) {
              if (key.startsWith('task:')) {
                const oldTaskId = key.substring('task:'.length);
                const mappedTaskId = oldToNewTaskMap.get(oldTaskId);
                if (mappedTaskId) {
                  newKey = `task:${mappedTaskId}`;
                  newTaskId = mappedTaskId;
                  if (newMetaJson.key) newMetaJson.key = newKey;
                }
              } else if (key.startsWith('pretask:')) {
                const oldPreTaskId = key.substring('pretask:'.length);
                const mappedPreTaskId = oldToNewPreTaskMap.get(oldPreTaskId);
                if (mappedPreTaskId) {
                  newKey = `pretask:${mappedPreTaskId}`;
                  if (newMetaJson.key) newMetaJson.key = newKey;
                  if (newMetaJson.preTaskId) newMetaJson.preTaskId = mappedPreTaskId;
                }
              }
            }

            // Создаем новый узел с сохранением координат
            const newNode = await prisma.processNode.create({
              data: {
                processId: newProcess.id,
                taskId: newTaskId,
                posX: node.posX || 0,
                posY: node.posY || 0,
                metaJson: newMetaJson,
              },
            });

            oldToNewNodeMap.set(node.id, newNode.id);
            console.log(`[sharenewtask] ✅ Copied node: ${node.id} -> ${newNode.id}, key: ${key} -> ${newKey}, pos: (${node.posX}, ${node.posY})`);
          }

          // Копируем все рёбра
          for (const edge of srcEdges) {
            const newSourceId = oldToNewNodeMap.get(edge.sourceNodeId);
            const newTargetId = oldToNewNodeMap.get(edge.targetNodeId);

            if (newSourceId && newTargetId) {
              await prisma.processEdge.create({
                data: {
                  processId: newProcess.id,
                  sourceNodeId: newSourceId,
                  targetNodeId: newTargetId,
                },
              });
              console.log(`[sharenewtask] ✅ Copied edge: ${edge.sourceNodeId} -> ${edge.targetNodeId}`);
            }
          }

          console.log(`[sharenewtask] ✅ Process positions copied successfully`);
        } else {
          console.log(`[sharenewtask] ℹ️ No process found for source task, skipping positions`);
        }
      } catch (err) {
        console.error('[sharenewtask.accept-with-pretasks] ⚠️ Failed to copy process positions:', err);
        // Не блокируем создание задачи, если не удалось скопировать позиции
      }

      console.log(`[sharenewtask] ✅ Complete! Cloned task: ${clone.id}, preTasks: ${oldToNewPreTaskMap.size}`);

      return res.json({
        ok: true,
        taskId: clone.id,
        created: true,
        preTasksCloned: oldToNewPreTaskMap.size,
      });
    } catch (e) {
      console.error('[sharenewtask.accept-with-pretasks] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  return router;
}
