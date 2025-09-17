-- CreateTable
CREATE TABLE "TaskReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "fireAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    "replyToMessageId" INTEGER,
    "sentAt" DATETIME,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskReminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskReminder_taskId_idx" ON "TaskReminder"("taskId");

-- CreateIndex
CREATE INDEX "TaskReminder_fireAt_idx" ON "TaskReminder"("fireAt");
