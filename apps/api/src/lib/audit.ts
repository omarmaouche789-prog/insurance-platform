import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

interface AuditEventInput {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonObject;
  req?: Request;
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? undefined,
      ipAddress: input.req?.ip ?? null,
    },
  });
}
