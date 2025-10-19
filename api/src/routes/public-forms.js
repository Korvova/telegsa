// api/src/routes/public-forms.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const GROUP_SEP = '::';

// Telegram API helper
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

/**
 * GET /public/forms/:id - Получить публичную форму
 */
router.get('/public/forms/:id', async (req, res) => {
  try {
    const formId = req.params.id;

    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: {
        id: true,
        title: true,
        description: true,
        fields: true,
        successType: true,
        successContent: true,
        redirectUrl: true,
        isActive: true,
        backgroundColor: true
      }
    });

    if (!form) {
      return res.status(404).json({ ok: false, error: 'form_not_found' });
    }

    if (!form.isActive) {
      return res.status(410).json({ ok: false, error: 'form_inactive' });
    }

    return res.json({ ok: true, form });
  } catch (error) {
    console.error('[PUBLIC_FORMS][GET] Error:', error);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/**
 * POST /public/forms/:id/submit - Отправить форму
 */
router.post('/public/forms/:id/submit', async (req, res) => {
  try {
    const formId = req.params.id;
    const { data } = req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ ok: false, error: 'invalid_data' });
    }

    // Получаем форму с настройками
    const form = await prisma.form.findUnique({
      where: { id: formId }
    });

    if (!form) {
      return res.status(404).json({ ok: false, error: 'form_not_found' });
    }

    if (!form.isActive) {
      return res.status(410).json({ ok: false, error: 'form_inactive' });
    }

    // Проверяем, что группа все еще существует
    let targetGroup = null;
    if (form.groupId) {
      targetGroup = await prisma.group.findUnique({
        where: { id: form.groupId }
      });
      if (!targetGroup) {
        return res.status(410).json({ ok: false, error: 'group_deleted' });
      }
    }

    // Валидация обязательных полей
    const fields = form.fields;
    if (Array.isArray(fields)) {
      for (const field of fields) {
        if (field.required && field.visible) {
          const value = data[field.id];
          if (!value || String(value).trim() === '') {
            return res.status(400).json({
              ok: false,
              error: 'missing_required_field',
              field: field.label
            });
          }
        }
      }
    }

    // Формируем текст задачи из данных формы
    let taskText = `📩 Заявка из формы "${form.title}"\n\n`;
    if (Array.isArray(fields)) {
      for (const field of fields) {
        if (field.visible && data[field.id]) {
          taskText += `${field.label}: ${data[field.id]}\n`;
        }
      }
    }

    // Получаем владельца формы
    const owner = await prisma.user.findUnique({
      where: { chatId: form.ownerChatId }
    });

    if (!owner) {
      return res.status(500).json({ ok: false, error: 'owner_not_found' });
    }

    // Определяем ответственного
    let finalAssigneeChatId = form.assigneeChatId;

    // Если ответственный был удален из группы, назначаем владельца группы
    if (finalAssigneeChatId && form.groupId) {
      const isMember = await prisma.groupMember.findFirst({
        where: {
          groupId: form.groupId,
          chatId: finalAssigneeChatId
        }
      });

      if (!isMember) {
        // Ответственный больше не в группе, назначаем владельца
        finalAssigneeChatId = targetGroup.ownerChatId;
        console.log(`[PUBLIC_FORMS][SUBMIT] Assignee not in group, using owner ${finalAssigneeChatId}`);
      }
    }

    // Создаем задачу
    const columnName = form.groupId ? `${form.groupId}${GROUP_SEP}${form.status}` : form.status;

    // Находим или создаем колонку
    let column = await prisma.column.findUnique({
      where: {
        chatId_name: {
          chatId: form.ownerChatId,
          name: columnName
        }
      }
    });

    if (!column) {
      // Создаем колонку если не существует
      const maxOrder = await prisma.column.findFirst({
        where: { chatId: form.ownerChatId },
        orderBy: { order: 'desc' },
        select: { order: true }
      });
      column = await prisma.column.create({
        data: {
          chatId: form.ownerChatId,
          name: columnName,
          order: (maxOrder?.order || 0) + 1
        }
      });
    }

    // Получаем максимальный order в колонке
    const maxTaskOrder = await prisma.task.findFirst({
      where: { columnId: column.id },
      orderBy: { order: 'desc' },
      select: { order: true }
    });

    // Создаем задачу
    const task = await prisma.task.create({
      data: {
        chatId: form.ownerChatId,
        columnId: column.id,
        text: taskText,
        order: (maxTaskOrder?.order || 0) + 1,
        createdByChatId: form.ownerChatId,
        assigneeChatId: finalAssigneeChatId,
        fromProcess: false
      }
    });

    // Добавляем ярлык если указан
    if (form.labelId) {
      try {
        // Проверяем что ярлык существует в группе
        const label = await prisma.groupLabel.findUnique({
          where: { id: form.labelId }
        });
        if (label && (!form.groupId || label.groupId === form.groupId)) {
          await prisma.taskLabel.create({
            data: {
              taskId: task.id,
              labelId: form.labelId,
              assignedBy: form.ownerChatId
            }
          });
        }
      } catch (err) {
        console.warn('[PUBLIC_FORMS][SUBMIT] Failed to add label:', err);
      }
    }

    // Добавляем наблюдателя если указан
    if (form.observerChatId) {
      try {
        await prisma.taskWatcher.create({
          data: {
            taskId: task.id,
            chatId: form.observerChatId
          }
        });
      } catch (err) {
        console.warn('[PUBLIC_FORMS][SUBMIT] Failed to add watcher:', err);
      }
    }

    // Сохраняем отправку формы
    const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip;
    const userAgent = req.headers['user-agent'];

    // Генерируем токен для наблюдения если включено
    let submitterToken = null;
    if (form.allowSubmitterWatch) {
      // Генерируем уникальный токен (22 символа base36, как в watchers.js)
      submitterToken = Math.random().toString(36).substring(2, 15) +
                       Math.random().toString(36).substring(2, 15);
    }

    await prisma.formSubmission.create({
      data: {
        formId: form.id,
        data,
        taskId: task.id,
        ip,
        userAgent,
        submitterToken
      }
    });

    console.log(`[PUBLIC_FORMS][SUBMIT] Form ${formId} submitted, task ${task.id} created`);

    // Отправляем уведомление владельцу формы
    try {
      await tg('sendMessage', {
        chat_id: form.ownerChatId,
        text: taskText,
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[{
            text: 'Открыть задачу',
            url: `https://t.me/${process.env.BOT_USERNAME}?startapp=task_${task.id}`
          }]]
        }
      });
      console.log(`[PUBLIC_FORMS][SUBMIT] Notification sent to owner ${form.ownerChatId}`);
    } catch (err) {
      console.warn('[PUBLIC_FORMS][SUBMIT] Failed to send notification:', err);
    }

    // Если есть ответственный, отправляем уведомление ему
    if (finalAssigneeChatId && finalAssigneeChatId !== form.ownerChatId) {
      try {
        await tg('sendMessage', {
          chat_id: finalAssigneeChatId,
          text: `🔔 Вам назначена задача:\n\n${taskText}`,
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [[{
              text: 'Открыть задачу',
              url: `https://t.me/${process.env.BOT_USERNAME}?startapp=task_${task.id}`
            }]]
          }
        });
        console.log(`[PUBLIC_FORMS][SUBMIT] Notification sent to assignee ${finalAssigneeChatId}`);
      } catch (err) {
        console.warn('[PUBLIC_FORMS][SUBMIT] Failed to send notification to assignee:', err);
      }
    }

    // Если есть наблюдатель, отправляем уведомление ему
    if (form.observerChatId && form.observerChatId !== form.ownerChatId && form.observerChatId !== finalAssigneeChatId) {
      try {
        await tg('sendMessage', {
          chat_id: form.observerChatId,
          text: `👁 Новая задача для наблюдения:\n\n${taskText}`,
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [[{
              text: 'Открыть задачу',
              url: `https://t.me/${process.env.BOT_USERNAME}?startapp=task_${task.id}`
            }]]
          }
        });
        console.log(`[PUBLIC_FORMS][SUBMIT] Notification sent to observer ${form.observerChatId}`);
      } catch (err) {
        console.warn('[PUBLIC_FORMS][SUBMIT] Failed to send notification to observer:', err);
      }
    }

    // Возвращаем ответ в зависимости от типа успеха
    return res.json({
      ok: true,
      taskId: task.id,
      successType: form.successType,
      successContent: form.successContent,
      redirectUrl: form.redirectUrl,
      allowSubmitterWatch: form.allowSubmitterWatch,
      submitterToken: submitterToken
    });
  } catch (error) {
    console.error('[PUBLIC_FORMS][SUBMIT] Error:', error);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/**
 * POST /public/forms/watch/:token
 * Активация наблюдения за задачей по токену отправителя
 * Требует chatId в query params (из Telegram WebApp)
 */
router.post('/public/forms/watch/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { chatId } = req.query;

    if (!chatId) {
      return res.status(400).json({ ok: false, error: 'chatId_required' });
    }

    // Находим submission по токену
    const submission = await prisma.formSubmission.findUnique({
      where: { submitterToken: token },
      include: {
        form: true
      }
    });

    if (!submission) {
      return res.status(404).json({ ok: false, error: 'invalid_token' });
    }

    if (!submission.taskId) {
      return res.status(400).json({ ok: false, error: 'no_task' });
    }

    // Проверяем что форма разрешает наблюдение
    if (!submission.form.allowSubmitterWatch) {
      return res.status(403).json({ ok: false, error: 'watching_not_allowed' });
    }

    // Добавляем пользователя как наблюдателя (upsert для идемпотентности)
    await prisma.taskWatcher.upsert({
      where: {
        taskId_chatId: {
          taskId: submission.taskId,
          chatId: String(chatId)
        }
      },
      update: {},
      create: {
        taskId: submission.taskId,
        chatId: String(chatId)
      }
    });

    console.log(`[PUBLIC_FORMS][WATCH] User ${chatId} started watching task ${submission.taskId} via token`);

    return res.json({
      ok: true,
      taskId: submission.taskId
    });
  } catch (error) {
    console.error('[PUBLIC_FORMS][WATCH] Error:', error);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

export { router as publicFormsRouter };
