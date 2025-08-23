import 'dotenv/config';

async function main() {
  const base = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

  // Глобальные команды (видны всем, всегда)
  // Тут только сервисные, сам список групп мы будем ставить ПЕРЕ-ЧАТНО
  const r1 = await fetch(`${base}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start',   description: 'Запуск / обновить меню' },
        { command: 'refresh', description: 'Обновить список групп в “/”' },
      ],
      scope: { type: 'default' },
    }),
  });
  console.log('setMyCommands (global):', await r1.json());

  // Вебхук
  const r2 = await fetch(`${base}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://rms-bot.com/telegsar/webhook',
      secret_token: process.env.WEBHOOK_SECRET,
      allowed_updates: ['message'], // только сообщения — без callback_query
    }),
  });
  console.log('setWebhook result:', await r2.json());
}

main().catch(console.error);
