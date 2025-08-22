import 'dotenv/config';
import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

// --- helpers ---
async function tg(method, payload) {
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!data.ok) console.error('Telegram API error:', data);
  return data;
}

async function ensureDefaultColumns(chatId) {
  // если в чате уже есть хоть одна колонка — ничего не создаём
  const count = await prisma.column.count({ where: { chatId } });
  if (count > 0) return;

  // создаём дефолт строго один раз и в фиксированном порядке
  const create = async (name, order) => {
    try {
      await prisma.column.create({ data: { chatId, name, order } });
    } catch (e) {
      // если вдруг параллельно создалась — игнорим уникальный конфликт
      if (e?.code !== 'P2002') throw e;
    }
  };

  await create('Inbox', 0);
  await create('Doing', 1);
  await create('Done', 2);
}



async function getInboxColumn(chatId) {
  return prisma.column.findFirst({
    where: { chatId, name: 'Inbox' },
  });
}

async function createTaskFromMessage({ chatId, tgMessageId, text }) {
  const chat = String(chatId);
  await ensureDefaultColumns(chat);
  const inbox = await getInboxColumn(chat);
  if (!inbox) throw new Error('Inbox column not found');

  // order = max(order) + 1 в этой колонке
  const last = await prisma.task.findFirst({
    where: { columnId: inbox.id },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? -1) + 1;

  const task = await prisma.task.create({
    data: {
      chatId: chat,
      text: text?.trim() || '(пусто)',
      order: nextOrder,
      tgMessageId: String(tgMessageId ?? ''),
      columnId: inbox.id,
    },
  });
  return task;
}

// --- health ---
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'telegsar-api' });
});

// --- отдать доску: колонки + задачи ---
app.get('/tasks', async (req, res) => {
  try {
    const chatId = String(req.query.chatId || '');
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId is required' });

    await ensureDefaultColumns(chatId);

    const columns = await prisma.column.findMany({
      where: { chatId },
      orderBy: { order: 'asc' },
      include: { tasks: { orderBy: { order: 'asc' } } },
    });

    res.json({ ok: true, columns });
  } catch (e) {
    console.error('GET /tasks error:', e);
    res.status(500).json({ ok: false });
  }
});

// --- webhook ---
app.post('/webhook', async (req, res) => {
  try {
    const secret = req.header('X-Telegram-Bot-Api-Secret-Token');
    if (!secret || secret !== process.env.WEBHOOK_SECRET) {
      return res.sendStatus(403);
    }

    const update = req.body;
    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const text = msg?.text;

    if (chatId && text) {
      // 1) удаляем входящее (в приватном чате)
      if (msg?.chat?.type === 'private') {
        try {
          await tg('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
        } catch (e) {
          console.warn('deleteMessage failed:', e?.description || e);
        }
      }

      // 2) создаём задачу в Inbox
      const task = await createTaskFromMessage({
        chatId,
        tgMessageId: msg.message_id,
        text,
      });

      // 3) отвечаем сообщением с кнопкой открыть WebApp
      const replyText = `Задача создана: ${task.text}`;
      await tg('sendMessage', {
        chat_id: chatId,
        text: replyText,
        disable_notification: true,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Открыть задачу',
                web_app: { url: `${process.env.PUBLIC_WEBAPP_URL}?from=${chatId}&task=${task.id}` }
              }
            ]
          ]
        }
      });
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error:', e);
    res.sendStatus(200);
  }
});




// перемещение карточки (для DnD)
// body: { toColumnId: string, toIndex: number }
app.patch('/tasks/:id/move', async (req, res) => {
  try {
    const taskId = String(req.params.id);
    const { toColumnId, toIndex } = req.body || {};
    if (typeof toColumnId !== 'string' || typeof toIndex !== 'number') {
      return res.status(400).json({ ok: false, error: 'toColumnId (string) и toIndex (number) обязательны' });
    }

    // найдём задачу и проверим существование колонок
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return res.status(404).json({ ok: false, error: 'task not found' });

    const fromColumnId = task.columnId;
    if (fromColumnId === toColumnId && toIndex === task.order) {
      return res.json({ ok: true, task }); // без изменений
    }

    // гарантируем целевые колонки принадлежат тому же chatId
    const [fromCol, toCol] = await Promise.all([
      prisma.column.findUnique({ where: { id: fromColumnId } }),
      prisma.column.findUnique({ where: { id: toColumnId } }),
    ]);
    if (!toCol || !fromCol || toCol.chatId !== task.chatId) {
      return res.status(400).json({ ok: false, error: 'invalid toColumnId' });
    }

    // транзакция перестановки
    const result = await prisma.$transaction(async (tx) => {
      if (fromColumnId === toColumnId) {
        // перемещение внутри одной колонки
        if (toIndex < task.order) {
          await tx.task.updateMany({
            where: { columnId: fromColumnId, order: { gte: toIndex, lt: task.order } },
            data: { order: { increment: 1 } },
          });
        } else {
          await tx.task.updateMany({
            where: { columnId: fromColumnId, order: { lte: toIndex, gt: task.order } },
            data: { order: { decrement: 1 } },
          });
        }
        const updated = await tx.task.update({
          where: { id: taskId },
          data: { order: toIndex },
        });
        return updated;
      } else {
        // перемещение между колонками
        // сдвигаем старую колонку вниз
        await tx.task.updateMany({
          where: { columnId: fromColumnId, order: { gt: task.order } },
          data: { order: { decrement: 1 } },
        });
        // вставляем место в целевой колонке
        await tx.task.updateMany({
          where: { columnId: toColumnId, order: { gte: toIndex } },
          data: { order: { increment: 1 } },
        });
        const updated = await tx.task.update({
          where: { id: taskId },
          data: { columnId: toColumnId, order: toIndex },
        });
        return updated;
      }
    });

    res.json({ ok: true, task: result });
  } catch (e) {
    console.error('PATCH /tasks/:id/move error:', e);
    res.status(500).json({ ok: false });
  }
});






// получить одну задачу
app.get('/tasks/:id', async (req, res) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: String(req.params.id) } });
    if (!task) return res.status(404).json({ ok: false, error: 'task not found' });
    res.json({ ok: true, task });
  } catch (e) {
    console.error('GET /tasks/:id error:', e);
    res.status(500).json({ ok: false });
  }
});

// обновить текст задачи
app.patch('/tasks/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { text } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'text is required' });
    }
    const updated = await prisma.task.update({
      where: { id },
      data: { text: text.trim() },
    });
    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('PATCH /tasks/:id error:', e);
    res.status(500).json({ ok: false });
  }
});

// завершить задачу -> перенос в Done в конец
// завершить задачу -> перенос в Done (в самый конец)
app.post('/tasks/:id/complete', async (req, res) => {
  try {
    const id = String(req.params.id);
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ ok: false, error: 'task not found' });

    // гарантируем наличие колонок у этого чата
    await ensureDefaultColumns(task.chatId);

    const done = await prisma.column.findFirst({
      where: { chatId: task.chatId, name: 'Done' },
    });
    if (!done) return res.status(500).json({ ok: false, error: 'Done column not found' });

    // если задача уже в Done
    if (task.columnId === done.id) {
      // сделать её последней
      const count = await prisma.task.count({ where: { columnId: done.id } });
      const lastIndex = count - 1;
      if (task.order === lastIndex) {
        return res.json({ ok: true, task }); // уже в конце
      }

      const updated = await prisma.$transaction(async (tx) => {
        // сдвинуть всех между task.order+1 .. lastIndex вверх на 1
        await tx.task.updateMany({
          where: { columnId: done.id, order: { gt: task.order } },
          data: { order: { decrement: 1 } },
        });
        // саму задачу — на последний индекс
        return tx.task.update({
          where: { id },
          data: { order: lastIndex },
        });
      });

      return res.json({ ok: true, task: updated });
    }

    // перенос из другой колонки в конец Done
    const toIndex = await prisma.task.count({ where: { columnId: done.id } }); // конец = count
    const fromColumnId = task.columnId;

    const updated = await prisma.$transaction(async (tx) => {
      // уплотняем старую колонку
      await tx.task.updateMany({
        where: { columnId: fromColumnId, order: { gt: task.order } },
        data: { order: { decrement: 1 } },
      });

      // вставляем в Done в самый конец (других сдвигов не нужно)
      return tx.task.update({
        where: { id },
        data: { columnId: done.id, order: toIndex },
      });
    });

    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('POST /tasks/:id/complete error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});




// создать задачу из WebApp
// body: { chatId: string | number, text: string }
app.post('/tasks', async (req, res) => {
  try {
    const { chatId, text } = req.body || {};
    if (!chatId || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'chatId и text обязательны' });
    }
    const chat = String(chatId).trim();
    await ensureDefaultColumns(chat);
    const inbox = await getInboxColumn(chat);
    if (!inbox) return res.status(500).json({ ok: false, error: 'Inbox not found' });

    const last = await prisma.task.findFirst({
      where: { columnId: inbox.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const task = await prisma.task.create({
      data: {
        chatId: chat,
        text: text.trim(),
        order: nextOrder,
        columnId: inbox.id,
      },
    });

    // Сообщение в чат бота с кнопкой открыть карточку
    try {
      await tg('sendMessage', {
        chat_id: chat,
        text: `Новая задача: ${task.text}`,
        disable_notification: true,
        reply_markup: {
          inline_keyboard: [[
            { text: 'Открыть задачу',
              web_app: { url: `${process.env.PUBLIC_WEBAPP_URL}?from=${chat}&task=${task.id}` } }
          ]]
        }
      });
    } catch (e) {
      console.warn('sendMessage failed:', e?.description || e);
    }

    res.status(201).json({ ok: true, task });
  } catch (e) {
    console.error('POST /tasks error:', e);
    res.status(500).json({ ok: false });
  }
});








// создать колонку (конец списка)
app.post('/columns', async (req, res) => {
  try {
    const { chatId, name } = req.body || {};
    const chat = String(chatId || '').trim();
    const title = String(name || '').trim();
    if (!chat || !title) return res.status(400).json({ ok: false, error: 'chatId и name обязательны' });

    await ensureDefaultColumns(chat);

    const last = await prisma.column.findFirst({
      where: { chatId: chat },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const column = await prisma.column.create({
      data: { chatId: chat, name: title, order: nextOrder },
    });

    res.status(201).json({ ok: true, column });
  } catch (e) {
    // уникальное имя в рамках чата
    if (e?.code === 'P2002') {
      return res.status(409).json({ ok: false, error: 'Колонка с таким именем уже есть' });
    }
    console.error('POST /columns error:', e);
    res.status(500).json({ ok: false });
  }
});

// переименовать колонку
app.patch('/columns/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { name } = req.body || {};
    const title = String(name || '').trim();
    if (!title) return res.status(400).json({ ok: false, error: 'name обязателен' });

    const column = await prisma.column.update({
      where: { id },
      data: { name: title },
    });

    res.json({ ok: true, column });
  } catch (e) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ ok: false, error: 'Колонка с таким именем уже есть' });
    }
    console.error('PATCH /columns/:id error:', e);
    res.status(500).json({ ok: false });
  }
});




const PORT = process.env.PORT || 3300;
app.listen(PORT, () => {
  console.log(`telegsar-api listening on :${PORT}`);
});
