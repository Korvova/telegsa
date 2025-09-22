-- Add group-level permission flags and member overrides
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "permViewOwnOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "permChangeStatusAny" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "permCanCreateTasks" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "permEditJson" JSONB;

ALTER TABLE "GroupMember" ADD COLUMN IF NOT EXISTS "permOverrides" JSONB;
