// api/routes/notifications.js
import express from 'express';

export function notificationsRouter({ prisma }) {
  const router = express.Router();

  // 🔎 Быстрый пинг для проверки, что роутер смонтирован
  router.get('/ping', (_req, res) => res.json({ ok: true, scope: 'notifications' }));

  // ⚙️ Получить текущие настройки (для фронта)
  // GET /notifications/:telegramId
  router.get('/:telegramId', async (req, res) => {
    try {
      const telegramId = String(req.params.telegramId || '');
      if (!telegramId) return res.status(400).json({ ok: false, error: 'telegramId_required' });

      const st = await prisma.notificationSetting.findUnique({
        where: { telegramId },
      });

      // значение по умолчанию
      const settings = st ?? {
        telegramId,
        receiveTaskAccepted: true,
        writeAccessGranted: false,
      };

      res.json({ ok: true, settings });
    } catch (e) {
      console.error('[notifications.get] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });

  // 🔔 Мастер-переключатель (вкл/выкл) — вызывается после requestWriteAccess
  // POST /notifications/toggle { telegramId, enabled }
  router.post('/toggle', async (req, res) => {
    try {
      const { telegramId, enabled } = req.body || {};
      if (!telegramId) return res.status(400).json({ ok: false, error: 'telegramId_required' });

      const data = {
        telegramId: String(telegramId),
        receiveTaskAccepted: !!enabled,
        writeAccessGranted: !!enabled,
      };

      await prisma.notificationSetting.upsert({
        where: { telegramId: data.telegramId },
        create: data,
        update: data,
      });

      res.json({ ok: true });
    } catch (e) {
      console.error('[notifications.toggle] error', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  });





  // 📩 Тест: отправить себе сообщение в личку (проверка write access)
  // POST /notifications/test { telegramId: string, text?: string }
  router.post('/test', async (req, res) => {
    try {
      const { telegramId, text } = req.body || {};
      if (!telegramId) return res.status(400).json({ ok: false, error: 'telegramId_required' });

      // локальный helper, чтобы не тянуть из server.js
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










  // 🧩 (на будущее) Точный апдейт чекбоксов
  // POST /notifications/me { telegramId, receiveTaskAccepted?, writeAccessGranted? }
  router.post('/me', async (req, res) => {
    try {
      const { telegramId, receiveTaskAccepted, writeAccessGranted } = req.body || {};
      if (!telegramId) return res.status(400).json({ ok: false, error: 'telegramId_required' });

      const payload = {
        telegramId: String(telegramId),
        ...(typeof receiveTaskAccepted === 'boolean' ? { receiveTaskAccepted } : {}),
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
