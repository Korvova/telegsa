// api/src/routes/sharenewtask.js
import express from 'express';
import crypto from 'crypto';

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

  return router;
}
