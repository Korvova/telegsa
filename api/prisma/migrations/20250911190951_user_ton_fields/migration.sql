-- AlterTable
ALTER TABLE "User" ADD COLUMN "tonAddress" TEXT;
ALTER TABLE "User" ADD COLUMN "tonNetwork" TEXT;
ALTER TABLE "User" ADD COLUMN "tonVerifiedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "tonVerifyNonce" TEXT;
ALTER TABLE "User" ADD COLUMN "tonWalletApp" TEXT;
