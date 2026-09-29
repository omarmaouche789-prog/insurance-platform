-- CreateEnum
CREATE TYPE "MetalTier" AS ENUM ('CATASTROPHIC', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('HMO', 'PPO', 'EPO', 'POS');

-- CreateTable
CREATE TABLE "carriers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planYear" INTEGER NOT NULL,
    "metalTier" "MetalTier" NOT NULL,
    "planType" "PlanType" NOT NULL,
    "monthlyPremiumCents" INTEGER NOT NULL,
    "deductibleCents" INTEGER NOT NULL,
    "outOfPocketMaxCents" INTEGER NOT NULL,
    "primaryCareCopayCents" INTEGER NOT NULL,
    "specialistCopayCents" INTEGER NOT NULL,
    "genericDrugCopayCents" INTEGER NOT NULL,
    "hsaEligible" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_service_areas" (
    "planId" TEXT NOT NULL,
    "zipCode" CHAR(5) NOT NULL,

    CONSTRAINT "plan_service_areas_pkey" PRIMARY KEY ("planId","zipCode")
);

-- CreateIndex
CREATE UNIQUE INDEX "carriers_code_key" ON "carriers"("code");

-- CreateIndex
CREATE INDEX "plans_metalTier_idx" ON "plans"("metalTier");

-- CreateIndex
CREATE UNIQUE INDEX "plans_carrierId_name_planYear_key" ON "plans"("carrierId", "name", "planYear");

-- CreateIndex
CREATE INDEX "plan_service_areas_zipCode_idx" ON "plan_service_areas"("zipCode");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_service_areas" ADD CONSTRAINT "plan_service_areas_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

