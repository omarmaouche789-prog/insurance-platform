-- System settings move from one JSON object per section to one row per
-- setting (section + key). Saved maintenance and session values carry over;
-- maintenance.enabled/message are renamed maintenanceMode/maintenanceMessage.
-- The old features flags are not carried over: "twoFactor" changed meaning
-- (it now *requires* 2FA for admins and agents) and "recommendations" /
-- "hipaaCompliance" were removed. smsNotifications keeps its value.

ALTER TABLE "system_settings" RENAME TO "system_settings_old";
ALTER TABLE "system_settings_old" RENAME CONSTRAINT "system_settings_pkey" TO "system_settings_old_pkey";
ALTER TABLE "system_settings_old" RENAME CONSTRAINT "system_settings_updatedById_fkey" TO "system_settings_old_updatedById_fkey";

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_section_key_key" ON "system_settings"("section", "key");

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Carry over existing values
INSERT INTO "system_settings" ("id", "section", "key", "value", "createdAt", "updatedAt", "updatedById")
SELECT
    gen_random_uuid()::text,
    o."key",
    CASE
        WHEN o."key" = 'maintenance' AND e."key" = 'enabled' THEN 'maintenanceMode'
        WHEN o."key" = 'maintenance' AND e."key" = 'message' THEN 'maintenanceMessage'
        ELSE e."key"
    END,
    e."value",
    o."updatedAt",
    o."updatedAt",
    o."updatedById"
FROM "system_settings_old" o
CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(o."value") = 'object' THEN o."value" ELSE '{}'::jsonb END) e
WHERE (o."key" = 'session' AND e."key" IN ('timeoutMinutes', 'maxLoginAttempts'))
   OR (o."key" = 'maintenance' AND e."key" IN ('enabled', 'message'))
   OR (o."key" = 'features' AND e."key" = 'smsNotifications');

DROP TABLE "system_settings_old";
