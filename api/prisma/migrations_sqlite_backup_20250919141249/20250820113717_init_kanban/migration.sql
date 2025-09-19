-- CreateTable
CREATE TABLE "Column" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "tgMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "columnId" TEXT NOT NULL,
    CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "Column" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Column_chatId_idx" ON "Column"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "Column_chatId_name_key" ON "Column"("chatId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Column_chatId_order_key" ON "Column"("chatId", "order");

-- CreateIndex
CREATE INDEX "Task_chatId_idx" ON "Task"("chatId");

-- CreateIndex
CREATE INDEX "Task_columnId_order_idx" ON "Task"("columnId", "order");
