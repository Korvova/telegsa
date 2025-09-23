-- Create user quota tables
CREATE TABLE IF NOT EXISTS "UserQuota" (
  "chatId" TEXT PRIMARY KEY,
  "totalCapacity" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "UserQuotaPurchase" (
  "id" TEXT PRIMARY KEY,
  "chatId" TEXT NOT NULL,
  "pack" INTEGER NOT NULL,
  "stars" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "UserQuotaPurchase_chatId_idx" ON "UserQuotaPurchase" ("chatId");

