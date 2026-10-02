import type { Notification } from "@prisma/client";
import type { NotificationDTO, NotificationListResponseDTO, NotificationType } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

// Like email, an in-app notification is a side effect: failing to create one
// must never fail the action that triggered it.
export async function notify(userId: string, input: NotifyInput): Promise<boolean> {
  try {
    await prisma.notification.create({
      data: { userId, type: input.type, title: input.title, body: input.body ?? null, link: input.link ?? null },
    });
    return true;
  } catch (err) {
    console.error(`Notification "${input.type}" failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export function toNotificationDTO(n: Notification): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listNotifications(
  userId: string,
  opts: { unreadOnly: boolean; limit: number; after?: Date },
): Promise<NotificationListResponseDTO> {
  const [unreadCount, rows] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({
      where: {
        userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
        ...(opts.after ? { createdAt: { gt: opts.after } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: opts.limit,
    }),
  ]);
  return { unreadCount, notifications: rows.map(toNotificationDTO) };
}

export async function markRead(userId: string, id: string): Promise<void> {
  // Scoped to the owner: someone else's notification id is a 404.
  const result = await prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
  if (result.count === 0) throw new HttpError(404, "Notification not found");
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return result.count;
}
