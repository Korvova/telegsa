-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NotificationSetting" (
    "telegramId" TEXT NOT NULL PRIMARY KEY,
    "receiveTaskAccepted" BOOLEAN NOT NULL DEFAULT true,
    "writeAccessGranted" BOOLEAN NOT NULL DEFAULT false,
    "receiveTaskCompletedMine" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NotificationSetting" ("receiveTaskAccepted", "telegramId", "updatedAt", "writeAccessGranted") SELECT "receiveTaskAccepted", "telegramId", "updatedAt", "writeAccessGranted" FROM "NotificationSetting";
DROP TABLE "NotificationSetting";
ALTER TABLE "new_NotificationSetting" RENAME TO "NotificationSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
