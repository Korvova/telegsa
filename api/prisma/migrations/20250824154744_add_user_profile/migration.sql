-- CreateTable
CREATE TABLE "User" (
    "chatId" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
