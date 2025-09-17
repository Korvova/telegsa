-- AlterTable
ALTER TABLE "Task" ADD COLUMN "createdByChatId" TEXT;

-- CreateIndex
CREATE INDEX "Task_createdByChatId_idx" ON "Task"("createdByChatId");
