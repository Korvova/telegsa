// routes/tasks.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const GROUP_SEP = '::';






// --- Telegram helper (локально для этого файла) ---
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

// --- when responsible appears -> notify assignee (if settings allow) ---
async function maybeNotifyTaskAccepted({ prisma, taskBefore, taskAfter, actorUser }) {
  try {
    const was = taskBefore?.responsibleId || null;
    const now = taskAfter?.responsibleId || null;
    if (was === now || !now) return; // не изменилось или так и не появился

    // получаем нового ответственного
    const assignee = await prisma.user.findUnique({
      where: { id: now },
      select: { telegramId: true, fullName: true },
    });
    if (!assignee?.telegramId) return;

    // проверяем настройки уведомлений
    const st = await prisma.notificationSetting.findUnique({
      where: { telegramId: String(assignee.telegramId) },
      select: { receiveTaskAccepted: true, writeAccessGranted: true },
    });
    if (st && (!st.receiveTaskAccepted || !st.writeAccessGranted)) return;

    // формируем текст
    const actorName = actorUser?.fullName ?? 'Кто-то';
    const title = taskAfter.title ?? 'Без названия';

    const text = `👤 <b>${actorName}</b> принял(а) задачу: <b>${title}</b>`;

    await tg('sendMessage', {
      chat_id: assignee.telegramId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error('notify task accepted error', e);
  }
}










router.delete('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);

    // тянем задачу и колонку (чтобы узнать groupId и поправить order)
    const task = await prisma.task.findUnique({
      where: { id },
      include: { column: true },
    });
    if (!task) return res.status(404).json({ ok: false, error: 'not_found' });

    // <groupId>::...
    let groupId = null;
    const nm = task.column?.name || '';
    const i = nm.indexOf(GROUP_SEP);
    if (i > 0) groupId = nm.slice(0, i);

    await prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id } });
      await tx.task.updateMany({
        where: { columnId: task.columnId, order: { gt: task.order } },
        data: { order: { decrement: 1 } },
      });
    });

    return res.json({ ok: true, groupId });
  } catch (e) {
    console.error('DELETE /tasks/:id error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});





// обновить задачу (в т.ч. назначить ответственного)
router.patch('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const patch = {};

    // принимаем поля, которые реально разрешено менять
    if ('title' in req.body) patch.title = String(req.body.title ?? '');
    if ('description' in req.body) patch.description = String(req.body.description ?? '');
    if ('responsibleId' in req.body) {
      // допускаем null для снятия ответственного
      patch.responsibleId = req.body.responsibleId === null ? null : String(req.body.responsibleId);
    }
    if ('columnId' in req.body) patch.columnId = String(req.body.columnId);
    if ('order' in req.body) patch.order = Number(req.body.order);

    const before = await prisma.task.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ ok: false, error: 'not_found' });

    const updated = await prisma.task.update({ where: { id }, data: patch });

    // кто сделал действие — если у тебя есть auth, подставь реального юзера
    const actorUser = req.user ?? null;

    await maybeNotifyTaskAccepted({
      prisma,
      taskBefore: before,
      taskAfter: updated,
      actorUser,
    });

    res.json({ ok: true, task: updated });
  } catch (e) {
    console.error('PATCH /tasks/:id error:', e);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});






export { router as tasksRouter };
