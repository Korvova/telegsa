-- CreateTable
CREATE TABLE "ProcessNodeWatcher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    CONSTRAINT "ProcessNodeWatcher_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "ProcessNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProcessEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_ProcessEdge" ("id", "processId", "sourceNodeId", "targetNodeId") SELECT "id", "processId", "sourceNodeId", "targetNodeId" FROM "ProcessEdge";
DROP TABLE "ProcessEdge";
ALTER TABLE "new_ProcessEdge" RENAME TO "ProcessEdge";
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ProcessNode" ("assigneeChatId", "createdAt", "id", "metaJson", "posX", "posY", "processId", "status", "title") SELECT "assigneeChatId", "createdAt", "id", "metaJson", "posX", "posY", "processId", "status", "title" FROM "ProcessNode";
DROP TABLE "ProcessNode";
ALTER TABLE "new_ProcessNode" RENAME TO "ProcessNode";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProcessNodeWatcher_chatId_idx" ON "ProcessNodeWatcher"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessNodeWatcher_nodeId_chatId_key" ON "ProcessNodeWatcher"("nodeId", "chatId");
