-- Create TaskWatcher table (SQLite)
CREATE TABLE IF NOT EXISTS "TaskWatcher" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "taskId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskWatcher_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique (taskId, chatId)
CREATE UNIQUE INDEX IF NOT EXISTS "TaskWatcher_taskId_chatId_key" ON "TaskWatcher"("taskId", "chatId");

-- Index by chatId
CREATE INDEX IF NOT EXISTS "TaskWatcher_chatId_idx" ON "TaskWatcher"("chatId");

-- Note on InviteType enum: SQLite stores enums as TEXT; adding WATCH value does not require schema change.
