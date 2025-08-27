// api/src/routes/notifications.js
import express from 'express';

export function notificationsRouter({ prisma }) {
  const router = express.Router();

  // 🔎 Пинг
  router.get('/ping', (_req, res) => res.json({ ok: true, scope: 'notifications' }));

  // ⚙️ Текущие настройки
  // GET /notifications/:telegramId
  router.get('/:telegramId', async (req, res) => {
    try {
      const telegramId = String(req.params.telegramId || '');
      if (!telegramId) return res.status(400).json({ ok: false, error: 'telegramId_required' });

      const st = await prisma.notificationSetting.findUnique({ where: { telegramId } });

      // Возвращаем с дефолтами, даже если записи нет
      const settings = {
        telegramId,
        receiveTaskAccepted: st?.receiveTaskAccepted ?? true,
        receiveTaskCompletedMine: st?.receiveTaskCompletedMine ?? true,
        receiveTaskComment: st?.receiveTaskComment ?? true, // ⬅️ флаг комментариев
        writeAccessGranted: st?.writeAccessGranted ?? false,
      };

      res.json({ ok: true, settings });
    } catch (e) {
      console.error('[notifications.get] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // 🔔 Мастер-тумблер (после requestWriteAccess)
  // POST /notifications/toggle { telegramId, enabled }
  router.post('/toggle', async (req, res) => {
    try {
      const { telegramId, enabled } = req.body || {};
      if (!telegramId) return res.status(400).json({ ok: false, error: 'telegramId_required' });

      const data = {
        telegramId: String(telegramId),
        receiveTaskAccepted: !!enabled,
        // receiveTaskCompletedMine оставляем как есть — управляется отдельным чекбоксом
        writeAccessGranted: !!enabled,
      };

      await prisma.notificationSetting.upsert({
        where: { telegramId: data.telegramId },
        create: {
          telegramId: data.telegramId,
          receiveTaskAccepted: data.receiveTaskAccepted,
          writeAccessGranted: data.writeAccessGranted,
          receiveTaskCompletedMine: true,   // при создании включаем по умолчанию
          receiveTaskComment: true,         // ⬅️ при создании тоже включаем по умолчанию
        },
        update: {
          receiveTaskAccepted: data.receiveTaskAccepted,
          writeAccessGranted: data.writeAccessGranted,
        },
      });

      res.json({ ok: true });
    } catch (e) {
      console.error('[notifications.toggle] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // 📩 Тест: отправить себе сообщение
  // POST /notifications/test { telegramId: string, text?: string }
  router.post('/test', async (req, res) => {
    try {
      const { telegramId, text } = req.body || {};
      if (!telegramId) return res.status(400).json({ ok: false, error: 'telegramId_required' });

      const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: String(telegramId),
          text: text || '🔔 Тестовое уведомление: всё работает!',
          disable_web_page_preview: true,
        }),
      });
      const data = await r.json();
      if (!data?.ok) {
        console.error('[notifications.test] Telegram error:', data);
        return res.status(502).json({ ok: false, error: 'telegram_error', details: data?.description || '' });
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error('[notifications.test] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // 🧩 Точный апдейт чекбоксов
  // POST /notifications/me { telegramId, receiveTaskAccepted?, receiveTaskCompletedMine?, receiveTaskComment?, writeAccessGranted? }
  router.post('/me', async (req, res) => {
    try {
      const {
        telegramId,
        receiveTaskAccepted,
        receiveTaskCompletedMine,
        receiveTaskComment,
        writeAccessGranted,
      } = req.body || {};

      if (!telegramId) return res.status(400).json({ ok: false, error: 'telegramId_required' });

      const payload = {
        telegramId: String(telegramId),
        ...(typeof receiveTaskAccepted === 'boolean' ? { receiveTaskAccepted } : {}),
        ...(typeof receiveTaskCompletedMine === 'boolean' ? { receiveTaskCompletedMine } : {}),
        ...(typeof receiveTaskComment === 'boolean' ? { receiveTaskComment } : {}), // ⬅️ новый флаг
        ...(typeof writeAccessGranted === 'boolean' ? { writeAccessGranted } : {}),
      };

      const saved = await prisma.notificationSetting.upsert({
        where: { telegramId: payload.telegramId },
        create: payload,
        update: payload,
      });

      res.json({ ok: true, settings: saved });
    } catch (e) {
      console.error('[notifications.me] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  return router;
}
