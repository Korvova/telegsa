-- CreateTable GroupWatcher for public group subscriptions (SQLite)
CREATE TABLE "GroupWatcher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupWatcher_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique constraint to avoid duplicates
CREATE UNIQUE INDEX "GroupWatcher_groupId_chatId_key" ON "GroupWatcher"("groupId", "chatId");

-- Index by watcher chatId for quick lookups
CREATE INDEX "GroupWatcher_chatId_idx" ON "GroupWatcher"("chatId");

