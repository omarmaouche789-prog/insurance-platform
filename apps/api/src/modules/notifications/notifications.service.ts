import type { Notification } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type {
  AgentNotificationListResponseDTO,
  NotificationCategory,
  NotificationDTO,
  NotificationListResponseDTO,
  NotificationType,
} from "@insurance/shared";
import { AGENT_NOTIFICATIONS_PAGE_SIZE, NOTIFICATION_CATEGORY_TYPES, notificationCategory } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  applicationId?: string;
  // The admin message it announces (reading the message marks this read).
  messageId?: string;
}

// Like email, an in-app notification is a side effect: failing to create one
// must never fail the action that triggered it.
export async function notify(userId: string, input: NotifyInput): Promise<boolean> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        applicationId: input.applicationId ?? null,
        messageId: input.messageId ?? null,
      },
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
    category: notificationCategory(n.type),
    title: n.title,
    body: n.body,
    link: n.link,
    applicationId: n.applicationId,
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

// ─── Agent Notification Center ───────────────────────────────────────────────
// Every query is scoped to the agent's own rows: someone else's id simply
// isn't found.

function categoryFilter(category: NotificationCategory | undefined): Prisma.NotificationWhereInput {
  if (!category) return {};
  if (category === "OTHER") return { type: { notIn: Object.values(NOTIFICATION_CATEGORY_TYPES).flat() } };
  return { type: { in: NOTIFICATION_CATEGORY_TYPES[category] } };
}

export async function listAgentNotifications(
  userId: string,
  opts: { category?: NotificationCategory; read?: boolean; page: number },
): Promise<AgentNotificationListResponseDTO> {
  const pageSize = AGENT_NOTIFICATIONS_PAGE_SIZE;
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...categoryFilter(opts.category),
    ...(opts.read === undefined ? {} : { readAt: opts.read ? { not: null } : null }),
  };
  const [total, unreadCount, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    notifications: rows.map(toNotificationDTO),
    unreadCount,
    pagination: { page: opts.page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

// Already-read ones keep their original read time.
export async function markManyRead(userId: string, ids: string[]): Promise<number> {
  const result = await prisma.notification.updateMany({ where: { id: { in: ids }, userId, readAt: null }, data: { readAt: new Date() } });
  return result.count;
}

export async function deleteNotification(userId: string, id: string): Promise<void> {
  const result = await prisma.notification.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw new HttpError(404, "Notification not found");
}
