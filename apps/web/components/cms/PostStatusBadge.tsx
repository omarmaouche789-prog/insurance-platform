import type { BlogPostDisplayStatus } from "@insurance/shared";
import { Badge } from "../ui/Badge";

export function PostStatusBadge({ status }: { status: BlogPostDisplayStatus }) {
  const map = {
    DRAFT: { tone: "gray", label: "Draft" },
    SCHEDULED: { tone: "blue", label: "Scheduled" },
    PUBLISHED: { tone: "green", label: "Published" },
    ARCHIVED: { tone: "amber", label: "Archived" },
  } as const;
  return (
    <Badge tone={map[status].tone} dot>
      {map[status].label}
    </Badge>
  );
}
