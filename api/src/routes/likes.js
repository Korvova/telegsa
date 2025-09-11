// api/src/routes/likes.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

async function tg(method, payload) {
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return r.json();
}

function joinName(u) {
  if (!u) return '';
  const fn = (u.firstName || '').trim();
  const ln = (u.lastName || '').trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ');
  if (u.username) return `@${u.username}`;
  return String(u.chatId || '');
}

// --- Task likes ---
router.get('/tasks/:id/likes', async (req, res) => {
  try {
    const id = String(req.params.id);
    const me = req.query.chatId ? String(req.query.chatId) : null;
    const count = await prisma.taskLike.count({ where: { taskId: id } });
    let liked = false;
    if (me) {
      const hit = await prisma.taskLike.findUnique({ where: { taskId_chatId: { taskId: id, chatId: me } } });
      liked = !!hit;
    }
    res.json({ ok: true, count, me: liked });
  } catch (e) { res.status(500).json({ ok: false }); }
});

router.post('/tasks/:id/likes', async (req, res) => {
  try {
    const id = String(req.params.id);
    const me = String(req.body?.chatId || '');
    if (!me) return res.status(400).json({ ok: false });
    await prisma.taskLike.upsert({ where: { taskId_chatId: { taskId: id, chatId: me } }, update: {}, create: { taskId: id, chatId: me } });
    const count = await prisma.taskLike.count({ where: { taskId: id } });
    res.json({ ok: true, count, me: true });
  } catch (e) { res.status(500).json({ ok: false }); }
});

router.delete('/tasks/:id/likes', async (req, res) => {
  try {
    const id = String(req.params.id);
    const me = String(req.query?.chatId || '');
    if (!me) return res.status(400).json({ ok: false });
    await prisma.taskLike.deleteMany({ where: { taskId: id, chatId: me } });
    const count = await prisma.taskLike.count({ where: { taskId: id } });
    res.json({ ok: true, count, me: false });
  } catch (e) { res.status(500).json({ ok: false }); }
});

// --- Comment likes ---
router.get('/tasks/:taskId/comments/:commentId/likes', async (req, res) => {
  try {
    const commentId = String(req.params.commentId);
    const me = req.query.chatId ? String(req.query.chatId) : null;
    const count = await prisma.commentLike.count({ where: { commentId } });
    let liked = false;
    if (me) {
      const hit = await prisma.commentLike.findUnique({ where: { commentId_chatId: { commentId, chatId: me } } });
      liked = !!hit;
    }
    res.json({ ok: true, count, me: liked });
  } catch (e) { res.status(500).json({ ok: false }); }
});

router.post('/tasks/:taskId/comments/:commentId/likes', async (req, res) => {
  try {
    const commentId = String(req.params.commentId);
    const me = String(req.body?.chatId || '');
    if (!me) return res.status(400).json({ ok: false });
    await prisma.commentLike.upsert({ where: { commentId_chatId: { commentId, chatId: me } }, update: {}, create: { commentId, chatId: me } });
    const count = await prisma.commentLike.count({ where: { commentId } });

    // Notify comment author (if allowed)
    const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { authorChatId: true, text: true } });
    if (comment && String(comment.authorChatId) !== me) {
      try {
        const liker = await prisma.user.findUnique({ where: { chatId: me } });
        const likerName = joinName(liker) || me;
        const textMsg = `👤 ${likerName}\n👍🏻 нравится ваш комментарий:\n${comment.text}`;
        await tg('sendMessage', { chat_id: String(comment.authorChatId), text: textMsg });
      } catch {}
    }

    res.json({ ok: true, count, me: true });
  } catch (e) { res.status(500).json({ ok: false }); }
});

router.delete('/tasks/:taskId/comments/:commentId/likes', async (req, res) => {
  try {
    const commentId = String(req.params.commentId);
    const me = String(req.query?.chatId || '');
    if (!me) return res.status(400).json({ ok: false });
    await prisma.commentLike.deleteMany({ where: { commentId, chatId: me } });
    const count = await prisma.commentLike.count({ where: { commentId } });
    res.json({ ok: true, count, me: false });
  } catch (e) { res.status(500).json({ ok: false }); }
});

export { router as likesRouter };

