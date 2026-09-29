-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'EARNED', 'PAID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApplicationStatus" ADD VALUE 'APPROVED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'PROOF_OF_INCOME';
ALTER TYPE "DocumentType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "submissionAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "zipCode" CHAR(5);

-- CreateTable
CREATE TABLE "document_requests" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "requestedTypes" "DocumentType"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rates" (
    "carrierId" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("carrierId")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "premiumCents" INTEGER NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_requests_applicationId_idx" ON "document_requests"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_applicationId_key" ON "commissions"("applicationId");

-- CreateIndex
CREATE INDEX "commissions_agentId_status_idx" ON "commissions"("agentId", "status");

-- CreateIndex
CREATE INDEX "applications_agentId_status_idx" ON "applications"("agentId", "status");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

