-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "messageId" TEXT;

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "fromAdminId" TEXT NOT NULL,
    "toAgentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_toAgentId_read_sentAt_idx" ON "messages"("toAgentId", "read", "sentAt");

-- CreateIndex
CREATE INDEX "messages_fromAdminId_sentAt_idx" ON "messages"("fromAdminId", "sentAt");

-- CreateIndex
CREATE INDEX "notifications_messageId_idx" ON "notifications"("messageId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_fromAdminId_fkey" FOREIGN KEY ("fromAdminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_toAgentId_fkey" FOREIGN KEY ("toAgentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
