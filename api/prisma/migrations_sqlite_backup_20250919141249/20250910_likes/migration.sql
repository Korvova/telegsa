-- TaskLike
CREATE TABLE IF NOT EXISTS TaskLike (
  id TEXT PRIMARY KEY,
  taskId TEXT NOT NULL,
  chatId TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT fk_task_like_task FOREIGN KEY (taskId) REFERENCES Task(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_like ON TaskLike(taskId, chatId);
CREATE INDEX IF NOT EXISTS idx_task_like_chat ON TaskLike(chatId);

-- CommentLike
CREATE TABLE IF NOT EXISTS CommentLike (
  id TEXT PRIMARY KEY,
  commentId TEXT NOT NULL,
  chatId TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT fk_comment_like FOREIGN KEY (commentId) REFERENCES Comment(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_comment_like ON CommentLike(commentId, chatId);
CREATE INDEX IF NOT EXISTS idx_comment_like_chat ON CommentLike(chatId);
