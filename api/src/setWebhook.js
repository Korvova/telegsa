import 'dotenv/config';

async function main() {
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/setWebhook`;

  const payload = {
    url: 'https://rms-bot.com/telegsar/webhook',
    secret_token: process.env.WEBHOOK_SECRET,
    allowed_updates: ['message'] // пока только сообщения
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  console.log('setWebhook result:', data);
}

main().catch(console.error);
