-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "rankPurchased" "public"."UserRank",
ADD COLUMN     "rankPurchasedAt" TIMESTAMP(3),
ADD COLUMN     "rankTrialEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."RankPurchase" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "rank" "public"."UserRank" NOT NULL,
    "rubAmount" TEXT NOT NULL,
    "tonAmount" TEXT NOT NULL,
    "tonTxHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RankPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RankPurchase_chatId_idx" ON "public"."RankPurchase"("chatId");

-- CreateIndex
CREATE INDEX "RankPurchase_status_idx" ON "public"."RankPurchase"("status");

-- CreateIndex
CREATE INDEX "RankPurchase_createdAt_idx" ON "public"."RankPurchase"("createdAt");
