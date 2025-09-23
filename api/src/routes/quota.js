// api/src/routes/quota.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// Helpers
async function getOrCreateQuota(chatId) {
  let row = await prisma.userQuota.findUnique({ where: { chatId } });
  if (!row) row = await prisma.userQuota.create({ data: { chatId, totalCapacity: 100 } });
  return row;
}

async function computeUsage(chatId) {
  const cid = String(chatId);
  const tasks = await prisma.task.count({ where: {
    type: 'TASK',
    fromProcess: { not: true },
    OR: [
      { createdByChatId: cid },
      { AND: [{ createdByChatId: null }, { chatId: cid }] },
    ],
  }});
  const events = await prisma.task.count({ where: {
    type: 'EVENT',
    OR: [
      { createdByChatId: cid },
      { AND: [{ createdByChatId: null }, { chatId: cid }] },
    ],
  }});
  const pretasks = await prisma.preTask.count({ where: { creatorChatId: cid } });
  const total = tasks + events + pretasks;
  return { tasks, events, pretasks, total };
}

  // GET /quota?chatId=...
  router.get('/quota', async (req, res) => {
  try {
    const chatId = String(req.query.chatId || '').trim();
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId_required' });
    const quota = await getOrCreateQuota(chatId);
    const usage = await computeUsage(chatId);
    const available = Math.max(0, quota.totalCapacity - usage.total);
    try { console.log('[quota:get]', { chatId, totalCapacity: quota.totalCapacity, usage, available }); } catch {}
    res.json({ ok: true, totalCapacity: quota.totalCapacity, usage, available });
  } catch (e) {
    console.error('[quota:get] error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
  });

// POST /quota/purchase { chatId, pack }
router.post('/quota/purchase', async (req, res) => {
  try {
    const { chatId, pack } = req.body || {};
    const me = String(chatId || '').trim();
    const p = Number(pack || 0);
    if (!me || ![100, 1000, 5000].includes(p)) return res.status(400).json({ ok: false, error: 'bad_request' });

    // Stars integration TODO: create invoice; for now apply immediately in dev mode
    const dev = String(process.env.STARS_DEV || '0') === '1';
    if (dev) {
      const stars = p === 100 ? 100 : p === 1000 ? 500 : 1000;
      try { console.log('[quota:purchase:DEV]', { chatId: me, pack: p, stars }); } catch {}
      const out = await prisma.$transaction(async (tx) => {
        const before = await getOrCreateQuota(me);
        const after = await tx.userQuota.update({ where: { chatId: me }, data: { totalCapacity: before.totalCapacity + p } });
        await tx.userQuotaPurchase.create({ data: { chatId: me, pack: p, stars } });
        return after;
      });
      const usage = await computeUsage(me);
      const available = Math.max(0, out.totalCapacity - usage.total);
      return res.json({ ok: true, totalCapacity: out.totalCapacity, usage, available, devApplied: true });
    }

    // Production: create invoice link (Telegram Stars)
    try {
      const token = String(process.env.BOT_TOKEN || '');
      if (!token) return res.status(500).json({ ok: false, error: 'no_bot_token' });
      const stars = p === 100 ? 100 : p === 1000 ? 500 : 1000;
      const payload = `quota:${me}:${p}:${Date.now()}`;
      const body = {
        title: `Пополнение лимита (+${p})`,
        description: `Пакет +${p} задач` ,
        payload,
        currency: 'XTR',
        prices: [{ label: 'Stars', amount: stars }],
        provider_token: ''
      };
      const url = `https://api.telegram.org/bot${token}/createInvoiceLink`;
      try { console.log('[quota:invoice:req]', { chatId: me, pack: p, stars, payload }); } catch {}
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }).then(r=>r.json()).catch((e)=>({ ok:false, error:e?.message||'fetch_failed' }));
      try { console.log('[quota:invoice:resp]', r); } catch {}
      if (r && r.ok && r.result) {
        return res.json({ ok: true, invoiceLink: r.result, payload });
      }
      return res.status(502).json({ ok: false, error: 'tg_invoice_failed', details: r });
    } catch (e) {
      console.error('[quota:invoice:error]', e);
      return res.status(500).json({ ok: false, error: 'invoice_error', details: String(e?.message||e) });
    }
  } catch (e) {
    console.error('[quota:purchase] error', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

export { router as quotaRouter };
