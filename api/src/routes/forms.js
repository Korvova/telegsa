// api/src/routes/forms.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

/**
 * GET /forms - Получить список форм пользователя
 */
router.get('/forms', async (req, res) => {
  try {
    const chatId = String(req.headers['x-telegram-chat-id'] || req.query.chatId || '');
    if (!chatId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const forms = await prisma.form.findMany({
      where: { ownerChatId: chatId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { submissions: true }
        }
      }
    });

    return res.json({ ok: true, forms });
  } catch (error) {
    console.error('[FORMS][LIST] Error:', error);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/**
 * GET /forms/:id - Получить форму по ID
 */
router.get('/forms/:id', async (req, res) => {
  try {
    const chatId = String(req.headers['x-telegram-chat-id'] || req.query.chatId || '');
    if (!chatId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const formId = req.params.id;
    const form = await prisma.form.findUnique({
      where: { id: formId },
      include: {
        _count: {
          select: { submissions: true }
        }
      }
    });

    if (!form) {
      return res.status(404).json({ ok: false, error: 'form_not_found' });
    }

    if (form.ownerChatId !== chatId) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    return res.json({ ok: true, form });
  } catch (error) {
    console.error('[FORMS][GET] Error:', error);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/**
 * POST /forms - Создать новую форму
 */
router.post('/forms', async (req, res) => {
  try {
    const chatId = String(req.headers['x-telegram-chat-id'] || req.body.chatId || '');
    if (!chatId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const {
      title,
      description,
      fields,
      successType,
      successContent,
      redirectUrl,
      groupId,
      assigneeChatId,
      labelId,
      status,
      observerChatId,
      allowSubmitterWatch,
      backgroundColor
    } = req.body;

    if (!title || !description || !fields) {
      return res.status(400).json({ ok: false, error: 'missing_required_fields' });
    }

    // Проверяем, что группа существует и принадлежит пользователю
    if (groupId) {
      const group = await prisma.group.findUnique({
        where: { id: groupId }
      });
      if (!group || group.ownerChatId !== chatId) {
        return res.status(400).json({ ok: false, error: 'invalid_group' });
      }
    }

    const form = await prisma.form.create({
      data: {
        ownerChatId: chatId,
        title,
        description,
        fields,
        successType: successType || 'PAGE',
        successContent,
        redirectUrl,
        groupId,
        assigneeChatId,
        labelId,
        status: status || 'Inbox',
        observerChatId,
        allowSubmitterWatch: allowSubmitterWatch || false,
        backgroundColor: backgroundColor || '#1b2030',
        isActive: true
      }
    });

    console.log(`[FORMS][CREATE] Created form ${form.id} for user ${chatId}`);
    return res.json({ ok: true, form });
  } catch (error) {
    console.error('[FORMS][CREATE] Error:', error);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/**
 * PUT /forms/:id - Обновить форму
 */
router.put('/forms/:id', async (req, res) => {
  try {
    const chatId = String(req.headers['x-telegram-chat-id'] || req.body.chatId || '');
    if (!chatId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const formId = req.params.id;
    const existingForm = await prisma.form.findUnique({
      where: { id: formId }
    });

    if (!existingForm) {
      return res.status(404).json({ ok: false, error: 'form_not_found' });
    }

    if (existingForm.ownerChatId !== chatId) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const {
      title,
      description,
      fields,
      successType,
      successContent,
      redirectUrl,
      groupId,
      assigneeChatId,
      labelId,
      status,
      observerChatId,
      isActive,
      allowSubmitterWatch,
      backgroundColor
    } = req.body;

    // Проверяем группу если она указана
    if (groupId) {
      const group = await prisma.group.findUnique({
        where: { id: groupId }
      });
      if (!group || group.ownerChatId !== chatId) {
        return res.status(400).json({ ok: false, error: 'invalid_group' });
      }
    }

    const form = await prisma.form.update({
      where: { id: formId },
      data: {
        title,
        description,
        fields,
        successType,
        successContent: successContent || null,
        redirectUrl: redirectUrl || null,
        groupId: groupId || null,
        assigneeChatId: assigneeChatId || null,
        labelId: labelId || null,
        status,
        observerChatId: observerChatId || null,
        isActive,
        allowSubmitterWatch: allowSubmitterWatch || false,
        backgroundColor: backgroundColor || '#1b2030'
      }
    });

    console.log(`[FORMS][UPDATE] Updated form ${formId}`);
    return res.json({ ok: true, form });
  } catch (error) {
    console.error('[FORMS][UPDATE] Error:', error);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/**
 * DELETE /forms/:id - Удалить форму
 */
router.delete('/forms/:id', async (req, res) => {
  try {
    const chatId = String(req.headers['x-telegram-chat-id'] || req.query.chatId || '');
    if (!chatId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const formId = req.params.id;
    const existingForm = await prisma.form.findUnique({
      where: { id: formId }
    });

    if (!existingForm) {
      return res.status(404).json({ ok: false, error: 'form_not_found' });
    }

    if (existingForm.ownerChatId !== chatId) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    await prisma.form.delete({
      where: { id: formId }
    });

    console.log(`[FORMS][DELETE] Deleted form ${formId}`);
    return res.json({ ok: true });
  } catch (error) {
    console.error('[FORMS][DELETE] Error:', error);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

export { router as formsRouter };
