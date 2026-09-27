-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "replacedByTokenId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replacedByTokenId_key" ON "refresh_tokens"("replacedByTokenId");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replacedByTokenId_fkey" FOREIGN KEY ("replacedByTokenId") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

