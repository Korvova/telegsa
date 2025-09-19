-- DropIndex
DROP INDEX "Column_chatId_order_key";

-- CreateTable
CREATE TABLE "GroupShortcut" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupShortcut_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GroupShortcut_chatId_idx" ON "GroupShortcut"("chatId");

-- CreateIndex
CREATE INDEX "GroupShortcut_groupId_idx" ON "GroupShortcut"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupShortcut_chatId_code_key" ON "GroupShortcut"("chatId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "GroupShortcut_chatId_groupId_key" ON "GroupShortcut"("chatId", "groupId");
