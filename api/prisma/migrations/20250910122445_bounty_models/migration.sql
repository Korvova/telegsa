/*
  Warnings:

  - Made the column `id` on table `StarLedger` required. This step will fail if there are existing NULL values in that column.
  - Made the column `chatId` on table `UserPayoutMethod` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updatedAt` on table `UserPayoutMethod` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StarLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "fromChatId" TEXT NOT NULL,
    "toChatId" TEXT,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StarLedger_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StarLedger" ("amount", "createdAt", "fromChatId", "id", "kind", "taskId", "toChatId") SELECT "amount", "createdAt", "fromChatId", "id", "kind", "taskId", "toChatId" FROM "StarLedger";
DROP TABLE "StarLedger";
ALTER TABLE "new_StarLedger" RENAME TO "StarLedger";
CREATE INDEX "StarLedger_taskId_idx" ON "StarLedger"("taskId");
CREATE INDEX "StarLedger_fromChatId_idx" ON "StarLedger"("fromChatId");
CREATE INDEX "StarLedger_toChatId_idx" ON "StarLedger"("toChatId");
CREATE TABLE "new_UserPayoutMethod" (
    "chatId" TEXT NOT NULL PRIMARY KEY,
    "method" TEXT NOT NULL DEFAULT 'SBP',
    "phone" TEXT NOT NULL,
    "bankCode" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UserPayoutMethod" ("bankCode", "chatId", "method", "phone", "updatedAt") SELECT "bankCode", "chatId", "method", "phone", "updatedAt" FROM "UserPayoutMethod";
DROP TABLE "UserPayoutMethod";
ALTER TABLE "new_UserPayoutMethod" RENAME TO "UserPayoutMethod";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
