-- CreateTable
CREATE TABLE "EventReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "fireAt" DATETIME NOT NULL,
    "replyToMessageId" INTEGER,
    "sentAt" DATETIME,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EventReminder_fireAt_idx" ON "EventReminder"("fireAt");

-- CreateIndex
CREATE INDEX "EventReminder_eventId_chatId_idx" ON "EventReminder"("eventId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "EventReminder_eventId_chatId_offsetMinutes_key" ON "EventReminder"("eventId", "chatId", "offsetMinutes");
