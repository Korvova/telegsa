-- CreateTable
CREATE TABLE "PreTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorChatId" TEXT NOT NULL,
    "groupId" TEXT,
    "text" TEXT NOT NULL,
    "payload" JSONB,
    "plannedAssigneeChatId" TEXT,
    "triggerMode" TEXT NOT NULL,
    "startAt" DATETIME,
    "delayMinutes" INTEGER,
    "autoCancelOnAny" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "targetTaskId" TEXT,
    "timezone" TEXT,
    "fireAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PreTaskLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "preTaskId" TEXT NOT NULL,
    "taskId" TEXT,
    "depPreTaskId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PreTaskLink_preTaskId_fkey" FOREIGN KEY ("preTaskId") REFERENCES "PreTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PreTaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PreTaskLink_depPreTaskId_fkey" FOREIGN KEY ("depPreTaskId") REFERENCES "PreTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PreTask_creatorChatId_idx" ON "PreTask"("creatorChatId");

-- CreateIndex
CREATE INDEX "PreTask_groupId_idx" ON "PreTask"("groupId");

-- CreateIndex
CREATE INDEX "PreTask_status_idx" ON "PreTask"("status");

-- CreateIndex
CREATE INDEX "PreTaskLink_preTaskId_idx" ON "PreTaskLink"("preTaskId");

-- CreateIndex
CREATE INDEX "PreTaskLink_taskId_idx" ON "PreTaskLink"("taskId");

-- CreateIndex
CREATE INDEX "PreTaskLink_depPreTaskId_idx" ON "PreTaskLink"("depPreTaskId");
