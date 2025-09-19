-- Add public flags to Group (SQLite requires table redefine)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerChatId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isTelegramGroup" BOOLEAN NOT NULL DEFAULT false,
    "tgChatId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publicSince" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Group" ("id", "ownerChatId", "title", "isTelegramGroup", "tgChatId", "createdAt", "updatedAt")
SELECT "id", "ownerChatId", "title", "isTelegramGroup", "tgChatId", "createdAt", "updatedAt" FROM "Group";

DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";

CREATE UNIQUE INDEX "Group_tgChatId_key" ON "Group"("tgChatId");
CREATE INDEX "Group_ownerChatId_idx" ON "Group"("ownerChatId");
CREATE UNIQUE INDEX "Group_ownerChatId_title_key" ON "Group"("ownerChatId", "title");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

