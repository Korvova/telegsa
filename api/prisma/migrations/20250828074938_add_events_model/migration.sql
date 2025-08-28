-- CreateTable
CREATE TABLE "EventParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InviteTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "groupId" TEXT NOT NULL,
    "taskId" TEXT,
    "invitedByChatId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "eventId" TEXT,
    CONSTRAINT "InviteTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InviteTicket_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InviteTicket_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InviteTicket" ("createdAt", "expiresAt", "groupId", "id", "invitedByChatId", "status", "taskId", "token", "type") SELECT "createdAt", "expiresAt", "groupId", "id", "invitedByChatId", "status", "taskId", "token", "type" FROM "InviteTicket";
DROP TABLE "InviteTicket";
ALTER TABLE "new_InviteTicket" RENAME TO "InviteTicket";
CREATE UNIQUE INDEX "InviteTicket_token_key" ON "InviteTicket"("token");
CREATE INDEX "InviteTicket_groupId_idx" ON "InviteTicket"("groupId");
CREATE INDEX "InviteTicket_taskId_idx" ON "InviteTicket"("taskId");
CREATE INDEX "InviteTicket_eventId_idx" ON "InviteTicket"("eventId");
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
    CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "Column" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assigneeChatId", "chatId", "columnId", "createdAt", "id", "order", "sourceChatId", "sourceMessageId", "text", "tgMessageId", "updatedAt") SELECT "assigneeChatId", "chatId", "columnId", "createdAt", "id", "order", "sourceChatId", "sourceMessageId", "text", "tgMessageId", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_chatId_idx" ON "Task"("chatId");
CREATE INDEX "Task_columnId_order_idx" ON "Task"("columnId", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EventParticipant_chatId_idx" ON "EventParticipant"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_chatId_key" ON "EventParticipant"("eventId", "chatId");
