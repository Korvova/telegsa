-- Add enum and column for accept condition
PRAGMA foreign_keys=OFF;

-- Create enum-like check by using TEXT with constraint (SQLite)
-- For existing rows, default to 'NONE'
ALTER TABLE Task ADD COLUMN acceptCondition TEXT NOT NULL DEFAULT 'NONE';

-- Note: In SQLite, Prisma emulates enums. Ensure application treats values as 'NONE' | 'PHOTO'.
PRAGMA foreign_keys=ON;
