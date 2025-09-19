-- AlterTable
ALTER TABLE "Task" ADD COLUMN "assigneeChatId" TEXT;

-- CreateTable
CREATE TABLE "InviteTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "groupId" TEXT NOT NULL,
    "taskId" TEXT,
    "invitedByChatId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    CONSTRAINT "InviteTicket_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InviteTicket_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InviteTicket_token_key" ON "InviteTicket"("token");

-- CreateIndex
CREATE INDEX "InviteTicket_groupId_idx" ON "InviteTicket"("groupId");

-- CreateIndex
CREATE INDEX "InviteTicket_taskId_idx" ON "InviteTicket"("taskId");
