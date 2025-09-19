-- CreateEnum
CREATE TYPE "public"."TaskType" AS ENUM ('TASK', 'EVENT');

-- CreateEnum
CREATE TYPE "public"."AcceptCondition" AS ENUM ('NONE', 'PHOTO', 'APPROVAL', 'PHOTO_AND_APPROVAL', 'DOC_AND_APPROVAL');

-- CreateEnum
CREATE TYPE "public"."EventRole" AS ENUM ('ORGANIZER', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "public"."UserRank" AS ENUM ('ANT', 'FISH', 'SCORPION', 'SQUIRREL', 'CAT', 'DOG', 'WOLF', 'BEAR', 'EAGLE', 'HORSE', 'DRAGON', 'SHARK', 'ELEPHANT', 'TREX', 'TIGER', 'LION');

-- CreateEnum
CREATE TYPE "public"."InviteType" AS ENUM ('TASK', 'GROUP', 'EVENT', 'WATCH');

-- CreateEnum
CREATE TYPE "public"."InviteStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."ProcessNodeType" AS ENUM ('TASK', 'EVENT');

-- CreateEnum
CREATE TYPE "public"."ReminderTarget" AS ENUM ('ME', 'RESPONSIBLE', 'ALL');

-- CreateEnum
CREATE TYPE "public"."StartMode" AS ENUM ('AFTER_ANY', 'AFTER_SELECTED', 'AT_DATE', 'AT_DATE_AND_SELECTED', 'AFTER_DAYS_AND_SELECTED');

-- CreateEnum
CREATE TYPE "public"."CancelMode" AS ENUM ('NONE', 'IF_ANY_SELECTED_CANCELED');

-- CreateEnum
CREATE TYPE "public"."PreTaskTriggerMode" AS ENUM ('AFTER_ALL_DONE', 'DATE_PLUS', 'DELAY_AFTER', 'AFTER_ALL_CANCELED');

-- CreateEnum
CREATE TYPE "public"."PreTaskStatus" AS ENUM ('PREVIEW', 'ARMED', 'FIRED', 'CANCELED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."Column" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Column_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "tgMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deadlineAt" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdByChatId" TEXT,
    "columnId" TEXT NOT NULL,
    "assigneeChatId" TEXT,
    "type" "public"."TaskType" NOT NULL DEFAULT 'TASK',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "acceptCondition" "public"."AcceptCondition" NOT NULL DEFAULT 'NONE',
    "sourceChatId" TEXT,
    "sourceMessageId" INTEGER,
    "fromProcess" BOOLEAN NOT NULL DEFAULT false,
    "bountyStars" INTEGER NOT NULL DEFAULT 0,
    "bountyStatus" TEXT NOT NULL DEFAULT 'NONE',
    "bountyByChatId" TEXT,
    "processLeftKeys" JSONB,
    "processRightKeys" JSONB,
    "originPreTaskId" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Group" (
    "id" TEXT NOT NULL,
    "ownerChatId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isTelegramGroup" BOOLEAN NOT NULL DEFAULT false,
    "tgChatId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publicSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GroupWatcher" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "tonAddress" TEXT,
    "tonNetwork" TEXT,
    "tonWalletApp" TEXT,
    "tonVerifiedAt" TIMESTAMP(3),
    "tonVerifyNonce" TEXT,
    "rank" "public"."UserRank" NOT NULL DEFAULT 'ANT',
    "rankScore" INTEGER NOT NULL DEFAULT 0,
    "rankLevel" TEXT,
    "rankUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("chatId")
);

-- CreateTable
CREATE TABLE "public"."GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GroupShortcut" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupShortcut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationSetting" (
    "telegramId" TEXT NOT NULL,
    "receiveTaskAccepted" BOOLEAN NOT NULL DEFAULT true,
    "writeAccessGranted" BOOLEAN NOT NULL DEFAULT false,
    "receiveTaskCompletedMine" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "receiveTaskComment" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("telegramId")
);

-- CreateTable
CREATE TABLE "public"."Comment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorChatId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invite" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdBy" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InviteTicket" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" "public"."InviteType" NOT NULL,
    "status" "public"."InviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "groupId" TEXT NOT NULL,
    "taskId" TEXT,
    "invitedByChatId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "eventId" TEXT,

    CONSTRAINT "InviteTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventParticipant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" "public"."EventRole" NOT NULL DEFAULT 'PARTICIPANT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventReminder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "replyToMessageId" INTEGER,
    "sentAt" TIMESTAMP(3),
    "tries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskReminder" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "target" "public"."ReminderTarget" NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "replyToMessageId" INTEGER,
    "sentAt" TIMESTAMP(3),
    "tries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GroupProcess" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT,
    "runMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "scheduleRRule" TEXT,
    "timezone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProcessNode" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "type" "public"."ProcessNodeType" NOT NULL DEFAULT 'TASK',
    "assigneeChatId" TEXT,
    "createdByChatId" TEXT,
    "startMode" "public"."StartMode" NOT NULL DEFAULT 'AFTER_ANY',
    "startDate" TIMESTAMP(3),
    "startAfterDays" INTEGER,
    "cancelMode" "public"."CancelMode" NOT NULL DEFAULT 'NONE',
    "taskId" TEXT,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProcessEdge" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProcessEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskMedia" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tgFileId" TEXT NOT NULL,
    "tgUniqueId" TEXT,
    "mimeType" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProcessNodeWatcher" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,

    CONSTRAINT "ProcessNodeWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProcessRun" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "note" TEXT,

    CONSTRAINT "ProcessRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RunTask" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "taskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "checklistMessageId" TEXT,
    "checklistItemId" TEXT,
    "telegramChatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "RunTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GroupLabel" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskLabel" (
    "taskId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLabel_pkey" PRIMARY KEY ("taskId","labelId")
);

-- CreateTable
CREATE TABLE "public"."PreTask" (
    "id" TEXT NOT NULL,
    "creatorChatId" TEXT NOT NULL,
    "groupId" TEXT,
    "text" TEXT NOT NULL,
    "payload" JSONB,
    "plannedAssigneeChatId" TEXT,
    "triggerMode" "public"."PreTaskTriggerMode" NOT NULL,
    "startAt" TIMESTAMP(3),
    "delayMinutes" INTEGER,
    "autoCancelOnAny" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."PreTaskStatus" NOT NULL DEFAULT 'PREVIEW',
    "targetTaskId" TEXT,
    "timezone" TEXT,
    "fireAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processLeftKeys" JSONB,
    "processRightKeys" JSONB,

    CONSTRAINT "PreTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PreTaskLink" (
    "id" TEXT NOT NULL,
    "preTaskId" TEXT NOT NULL,
    "taskId" TEXT,
    "depPreTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreTaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskRelation" (
    "id" TEXT NOT NULL,
    "fromTaskId" TEXT NOT NULL,
    "toTaskId" TEXT NOT NULL,
    "groupId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskLike" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskWatcher" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StarLedger" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromChatId" TEXT NOT NULL,
    "toChatId" TEXT,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserPayoutMethod" (
    "chatId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'SBP',
    "phone" TEXT NOT NULL,
    "bankCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPayoutMethod_pkey" PRIMARY KEY ("chatId")
);

-- CreateIndex
CREATE INDEX "Column_chatId_idx" ON "public"."Column"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "Column_chatId_name_key" ON "public"."Column"("chatId", "name");

-- CreateIndex
CREATE INDEX "Task_chatId_idx" ON "public"."Task"("chatId");

-- CreateIndex
CREATE INDEX "Task_columnId_order_idx" ON "public"."Task"("columnId", "order");

-- CreateIndex
CREATE INDEX "Task_createdByChatId_idx" ON "public"."Task"("createdByChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_tgChatId_key" ON "public"."Group"("tgChatId");

-- CreateIndex
CREATE INDEX "Group_ownerChatId_idx" ON "public"."Group"("ownerChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_ownerChatId_title_key" ON "public"."Group"("ownerChatId", "title");

-- CreateIndex
CREATE INDEX "GroupWatcher_chatId_idx" ON "public"."GroupWatcher"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupWatcher_groupId_chatId_key" ON "public"."GroupWatcher"("groupId", "chatId");

-- CreateIndex
CREATE INDEX "GroupMember_chatId_idx" ON "public"."GroupMember"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_chatId_key" ON "public"."GroupMember"("groupId", "chatId");

-- CreateIndex
CREATE INDEX "GroupShortcut_chatId_idx" ON "public"."GroupShortcut"("chatId");

-- CreateIndex
CREATE INDEX "GroupShortcut_groupId_idx" ON "public"."GroupShortcut"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupShortcut_chatId_code_key" ON "public"."GroupShortcut"("chatId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "GroupShortcut_chatId_groupId_key" ON "public"."GroupShortcut"("chatId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "public"."Invite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "InviteTicket_token_key" ON "public"."InviteTicket"("token");

-- CreateIndex
CREATE INDEX "InviteTicket_groupId_idx" ON "public"."InviteTicket"("groupId");

-- CreateIndex
CREATE INDEX "InviteTicket_taskId_idx" ON "public"."InviteTicket"("taskId");

-- CreateIndex
CREATE INDEX "InviteTicket_eventId_idx" ON "public"."InviteTicket"("eventId");

-- CreateIndex
CREATE INDEX "EventParticipant_chatId_idx" ON "public"."EventParticipant"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_chatId_key" ON "public"."EventParticipant"("eventId", "chatId");

-- CreateIndex
CREATE INDEX "EventReminder_fireAt_idx" ON "public"."EventReminder"("fireAt");

-- CreateIndex
CREATE INDEX "EventReminder_eventId_chatId_idx" ON "public"."EventReminder"("eventId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "EventReminder_eventId_chatId_offsetMinutes_key" ON "public"."EventReminder"("eventId", "chatId", "offsetMinutes");

-- CreateIndex
CREATE INDEX "TaskReminder_taskId_idx" ON "public"."TaskReminder"("taskId");

-- CreateIndex
CREATE INDEX "TaskReminder_fireAt_idx" ON "public"."TaskReminder"("fireAt");

-- CreateIndex
CREATE INDEX "TaskMedia_taskId_idx" ON "public"."TaskMedia"("taskId");

-- CreateIndex
CREATE INDEX "ProcessNodeWatcher_chatId_idx" ON "public"."ProcessNodeWatcher"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessNodeWatcher_nodeId_chatId_key" ON "public"."ProcessNodeWatcher"("nodeId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupLabel_groupId_title_key" ON "public"."GroupLabel"("groupId", "title");

-- CreateIndex
CREATE INDEX "PreTask_creatorChatId_idx" ON "public"."PreTask"("creatorChatId");

-- CreateIndex
CREATE INDEX "PreTask_groupId_idx" ON "public"."PreTask"("groupId");

-- CreateIndex
CREATE INDEX "PreTask_status_idx" ON "public"."PreTask"("status");

-- CreateIndex
CREATE INDEX "PreTaskLink_preTaskId_idx" ON "public"."PreTaskLink"("preTaskId");

-- CreateIndex
CREATE INDEX "PreTaskLink_taskId_idx" ON "public"."PreTaskLink"("taskId");

-- CreateIndex
CREATE INDEX "PreTaskLink_depPreTaskId_idx" ON "public"."PreTaskLink"("depPreTaskId");

-- CreateIndex
CREATE INDEX "TaskRelation_fromTaskId_idx" ON "public"."TaskRelation"("fromTaskId");

-- CreateIndex
CREATE INDEX "TaskRelation_toTaskId_idx" ON "public"."TaskRelation"("toTaskId");

-- CreateIndex
CREATE INDEX "TaskLike_chatId_idx" ON "public"."TaskLike"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskLike_taskId_chatId_key" ON "public"."TaskLike"("taskId", "chatId");

-- CreateIndex
CREATE INDEX "TaskWatcher_chatId_idx" ON "public"."TaskWatcher"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskWatcher_taskId_chatId_key" ON "public"."TaskWatcher"("taskId", "chatId");

-- CreateIndex
CREATE INDEX "CommentLike_chatId_idx" ON "public"."CommentLike"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentLike_commentId_chatId_key" ON "public"."CommentLike"("commentId", "chatId");

-- CreateIndex
CREATE INDEX "StarLedger_taskId_idx" ON "public"."StarLedger"("taskId");

-- CreateIndex
CREATE INDEX "StarLedger_fromChatId_idx" ON "public"."StarLedger"("fromChatId");

-- CreateIndex
CREATE INDEX "StarLedger_toChatId_idx" ON "public"."StarLedger"("toChatId");

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "public"."Column"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupWatcher" ADD CONSTRAINT "GroupWatcher_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupShortcut" ADD CONSTRAINT "GroupShortcut_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InviteTicket" ADD CONSTRAINT "InviteTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InviteTicket" ADD CONSTRAINT "InviteTicket_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InviteTicket" ADD CONSTRAINT "InviteTicket_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventReminder" ADD CONSTRAINT "EventReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskReminder" ADD CONSTRAINT "TaskReminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProcessNode" ADD CONSTRAINT "ProcessNode_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskMedia" ADD CONSTRAINT "TaskMedia_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProcessNodeWatcher" ADD CONSTRAINT "ProcessNodeWatcher_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "public"."ProcessNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupLabel" ADD CONSTRAINT "GroupLabel_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskLabel" ADD CONSTRAINT "TaskLabel_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskLabel" ADD CONSTRAINT "TaskLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "public"."GroupLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PreTaskLink" ADD CONSTRAINT "PreTaskLink_preTaskId_fkey" FOREIGN KEY ("preTaskId") REFERENCES "public"."PreTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PreTaskLink" ADD CONSTRAINT "PreTaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PreTaskLink" ADD CONSTRAINT "PreTaskLink_depPreTaskId_fkey" FOREIGN KEY ("depPreTaskId") REFERENCES "public"."PreTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskRelation" ADD CONSTRAINT "TaskRelation_fromTaskId_fkey" FOREIGN KEY ("fromTaskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskRelation" ADD CONSTRAINT "TaskRelation_toTaskId_fkey" FOREIGN KEY ("toTaskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskLike" ADD CONSTRAINT "TaskLike_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskWatcher" ADD CONSTRAINT "TaskWatcher_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "public"."Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StarLedger" ADD CONSTRAINT "StarLedger_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
