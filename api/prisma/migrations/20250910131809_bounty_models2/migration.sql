/*
  Warnings:

  - Made the column `id` on table `CommentLike` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `TaskLike` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CommentLike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commentId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CommentLike" ("chatId", "commentId", "createdAt", "id") SELECT "chatId", "commentId", "createdAt", "id" FROM "CommentLike";
DROP TABLE "CommentLike";
ALTER TABLE "new_CommentLike" RENAME TO "CommentLike";
CREATE INDEX "CommentLike_chatId_idx" ON "CommentLike"("chatId");
CREATE UNIQUE INDEX "CommentLike_commentId_chatId_key" ON "CommentLike"("commentId", "chatId");
CREATE TABLE "new_TaskLike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskLike_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskLike" ("chatId", "createdAt", "id", "taskId") SELECT "chatId", "createdAt", "id", "taskId" FROM "TaskLike";
DROP TABLE "TaskLike";
ALTER TABLE "new_TaskLike" RENAME TO "TaskLike";
CREATE INDEX "TaskLike_chatId_idx" ON "TaskLike"("chatId");
CREATE UNIQUE INDEX "TaskLike_taskId_chatId_key" ON "TaskLike"("taskId", "chatId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
