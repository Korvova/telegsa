-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "aiTokensBalance" INTEGER NOT NULL DEFAULT 10000;

-- CreateTable
CREATE TABLE "public"."AITokenUsage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "groupId" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o',
    "promptType" TEXT NOT NULL DEFAULT 'process',
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AITokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AITokenPurchase" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "tokensAmount" INTEGER NOT NULL,
    "usdtAmount" TEXT NOT NULL,
    "tonTxHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AITokenPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AITokenUsage_chatId_idx" ON "public"."AITokenUsage"("chatId");

-- CreateIndex
CREATE INDEX "AITokenUsage_createdAt_idx" ON "public"."AITokenUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AITokenPurchase_chatId_idx" ON "public"."AITokenPurchase"("chatId");

-- CreateIndex
CREATE INDEX "AITokenPurchase_status_idx" ON "public"."AITokenPurchase"("status");

-- CreateIndex
CREATE INDEX "AITokenPurchase_createdAt_idx" ON "public"."AITokenPurchase"("createdAt");
