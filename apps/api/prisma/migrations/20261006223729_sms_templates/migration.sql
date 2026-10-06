-- CreateTable
CREATE TABLE "sms_templates" (
    "key" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "sms_templates" ADD CONSTRAINT "sms_templates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
