-- AlterEnum
ALTER TYPE "CommissionStatus" ADD VALUE 'VOID';

-- DropIndex
DROP INDEX "applications_status_idx";

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateIndex
CREATE INDEX "applications_status_submittedAt_idx" ON "applications"("status", "submittedAt");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

