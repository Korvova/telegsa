-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerChatId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isTelegramGroup" BOOLEAN NOT NULL DEFAULT false,
    "tgChatId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Group" ("createdAt", "id", "ownerChatId", "title", "updatedAt") SELECT "createdAt", "id", "ownerChatId", "title", "updatedAt" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE UNIQUE INDEX "Group_tgChatId_key" ON "Group"("tgChatId");
CREATE INDEX "Group_ownerChatId_idx" ON "Group"("ownerChatId");
CREATE UNIQUE INDEX "Group_ownerChatId_title_key" ON "Group"("ownerChatId", "title");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
