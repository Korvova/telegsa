-- AlterTable
ALTER TABLE "public"."PreTask" ADD COLUMN     "recurringConfig" JSONB,
ADD COLUMN     "recurringParentId" TEXT;

-- CreateIndex
CREATE INDEX "PreTask_recurringParentId_idx" ON "public"."PreTask"("recurringParentId");
