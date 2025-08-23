-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerChatId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Group_ownerChatId_idx" ON "Group"("ownerChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_ownerChatId_title_key" ON "Group"("ownerChatId", "title");

-- CreateIndex
CREATE INDEX "GroupMember_chatId_idx" ON "GroupMember"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_chatId_key" ON "GroupMember"("groupId", "chatId");
