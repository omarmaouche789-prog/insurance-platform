import type { NotificationCategory } from "@insurance/shared";
import { NOTIFICATION_CATEGORY_LABELS } from "@insurance/shared";
import { Badge, type BadgeTone } from "../ui/Badge";

const TONES: Record<NotificationCategory, BadgeTone> = {
  ASSIGNMENT: "blue",
  STATUS_UPDATE: "violet",
  CARRIER_RESPONSE: "green",
  DOCUMENT_REQUEST: "amber",
  MESSAGE: "indigo",
  OTHER: "gray",
};

export function NotificationBadge({ category }: { category: NotificationCategory }) {
  return <Badge tone={TONES[category]}>{NOTIFICATION_CATEGORY_LABELS[category]}</Badge>;
}
