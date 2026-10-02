export const NOTIFICATION_TYPES = [
  "document.uploaded",
  "document.requested",
  "followup.scheduled",
  "account.security",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponseDTO {
  unreadCount: number;
  notifications: NotificationDTO[];
}
