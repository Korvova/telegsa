-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "complexity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."UserQuota" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."UserQuotaPurchase" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);
