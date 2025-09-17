-- CreateTable
CREATE TABLE "TaskRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromTaskId" TEXT NOT NULL,
    "toTaskId" TEXT NOT NULL,
    "groupId" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskRelation_fromTaskId_fkey" FOREIGN KEY ("fromTaskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskRelation_toTaskId_fkey" FOREIGN KEY ("toTaskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProcessNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "posX" REAL NOT NULL DEFAULT 0,
    "posY" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "type" TEXT NOT NULL DEFAULT 'TASK',
    "assigneeChatId" TEXT,
    "createdByChatId" TEXT,
    "startMode" TEXT NOT NULL DEFAULT 'AFTER_ANY',
    "startDate" DATETIME,
    "startAfterDays" INTEGER,
    "cancelMode" TEXT NOT NULL DEFAULT 'NONE',
    "taskId" TEXT,
    "metaJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessNode_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProcessNode" ("assigneeChatId", "cancelMode", "createdAt", "createdByChatId", "id", "metaJson", "posX", "posY", "processId", "startAfterDays", "startDate", "startMode", "status", "taskId", "title", "type") SELECT "assigneeChatId", "cancelMode", "createdAt", "createdByChatId", "id", "metaJson", "posX", "posY", "processId", "startAfterDays", "startDate", "startMode", "status", "taskId", "title", "type" FROM "ProcessNode";
DROP TABLE "ProcessNode";
ALTER TABLE "new_ProcessNode" RENAME TO "ProcessNode";
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "tgMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "columnId" TEXT NOT NULL,
    "assigneeChatId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TASK',
    "startAt" DATETIME,
    "endAt" DATETIME,
    "sourceChatId" TEXT,
    "sourceMessageId" INTEGER,
    "fromProcess" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "Column" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assigneeChatId", "chatId", "columnId", "createdAt", "endAt", "id", "order", "sourceChatId", "sourceMessageId", "startAt", "text", "tgMessageId", "type", "updatedAt") SELECT "assigneeChatId", "chatId", "columnId", "createdAt", "endAt", "id", "order", "sourceChatId", "sourceMessageId", "startAt", "text", "tgMessageId", "type", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_chatId_idx" ON "Task"("chatId");
CREATE INDEX "Task_columnId_order_idx" ON "Task"("columnId", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TaskRelation_fromTaskId_idx" ON "TaskRelation"("fromTaskId");

-- CreateIndex
CREATE INDEX "TaskRelation_toTaskId_idx" ON "TaskRelation"("toTaskId");
