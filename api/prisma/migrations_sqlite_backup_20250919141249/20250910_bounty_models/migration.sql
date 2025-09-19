-- Add bounty fields to Task
ALTER TABLE Task ADD COLUMN bountyStars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Task ADD COLUMN bountyStatus TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE Task ADD COLUMN bountyByChatId TEXT;

-- Create StarLedger table
CREATE TABLE IF NOT EXISTS StarLedger (
  id TEXT PRIMARY KEY,
  taskId TEXT NOT NULL,
  fromChatId TEXT NOT NULL,
  toChatId TEXT,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT fk_star_task FOREIGN KEY (taskId) REFERENCES Task(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_star_task ON StarLedger(taskId);
CREATE INDEX IF NOT EXISTS idx_star_from ON StarLedger(fromChatId);
CREATE INDEX IF NOT EXISTS idx_star_to ON StarLedger(toChatId);

-- Create UserPayoutMethod table
CREATE TABLE IF NOT EXISTS UserPayoutMethod (
  chatId TEXT PRIMARY KEY,
  method TEXT NOT NULL DEFAULT 'SBP',
  phone TEXT NOT NULL,
  bankCode TEXT,
  updatedAt DATETIME
);
