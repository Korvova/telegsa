// routes/tasks.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const GROUP_SEP = '::';

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

export { router as tasksRouter };
