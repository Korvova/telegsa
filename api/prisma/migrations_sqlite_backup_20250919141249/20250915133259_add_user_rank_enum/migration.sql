-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "chatId" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "tonAddress" TEXT,
    "tonNetwork" TEXT,
    "tonWalletApp" TEXT,
    "tonVerifiedAt" DATETIME,
    "tonVerifyNonce" TEXT,
    "rank" TEXT NOT NULL DEFAULT 'ANT',
    "rankScore" INTEGER NOT NULL DEFAULT 0,
    "rankLevel" TEXT,
    "rankUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("chatId", "createdAt", "firstName", "lastName", "rankLevel", "rankScore", "rankUpdatedAt", "tonAddress", "tonNetwork", "tonVerifiedAt", "tonVerifyNonce", "tonWalletApp", "updatedAt", "username") SELECT "chatId", "createdAt", "firstName", "lastName", "rankLevel", "rankScore", "rankUpdatedAt", "tonAddress", "tonNetwork", "tonVerifiedAt", "tonVerifyNonce", "tonWalletApp", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
