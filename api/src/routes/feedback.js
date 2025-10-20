// api/src/routes/feedback.js
import { Router } from 'express';
import axios from 'axios';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { text, from } = req.body;
    if (!text || !from) {
      return res.status(400).json({ ok: false, error: 'Missing data' });
    }

    // Читаем переменные во время запроса
    const FB_TOKEN = process.env.FEEDBACK_BOT_TOKEN || process.env.BOT_TOKEN;
    const FB_IDS = process.env.FEEDBACK_CHAT_ID
      ? process.env.FEEDBACK_CHAT_ID.split(',').map(id => id.trim())
      : [];

    if (!FB_TOKEN || FB_IDS.length === 0) {
      console.error('[feedback] FEEDBACK_BOT_TOKEN or FEEDBACK_CHAT_ID not configured');
      return res.status(500).json({ ok: false, error: 'feedback_not_configured' });
    }

    const username = from.username ? `@${from.username}` : '';
    const firstName = from.first_name || '';
    const userId = from.id || 'unknown';
    const userInfo = [firstName, username].filter(Boolean).join(' ') || userId;

    const msg = `💬 Обратная связь от ${userInfo}\n\n${text}`;

    // Отправляем в Telegram
    await Promise.all(
      FB_IDS.map(chatId =>
        axios.post(`https://api.telegram.org/bot${FB_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: msg,
          parse_mode: 'Markdown',
        })
      )
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('[feedback] send error:', e.response?.data || e.message);
    res.status(500).json({ ok: false, error: 'telegram_error' });
  }
});

export { router as feedbackRouter };
