-- CreateTable
CREATE TABLE "NotificationSetting" (
    "telegramId" TEXT NOT NULL PRIMARY KEY,
    "receiveTaskAccepted" BOOLEAN NOT NULL DEFAULT true,
    "writeAccessGranted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
