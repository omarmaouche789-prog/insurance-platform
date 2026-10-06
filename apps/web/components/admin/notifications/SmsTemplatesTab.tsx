"use client";

import { useState } from "react";
import { MessageSquare, Pencil } from "lucide-react";
import type { SmsTemplateDTO } from "@insurance/shared";
import { canEditNotificationTemplates, renderSmsTemplate, smsSegmentInfo } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { formatRelative } from "../../../lib/format";
import { useApiQuery } from "../../../lib/use-api";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card, CardHeader } from "../../ui/Card";
import { EmptyState, ErrorState, TableSkeleton } from "../../ui/States";
import { SmsTemplateEditor } from "./SmsTemplateEditor";

const SAMPLE = { userName: "Uma", appId: "APP-4F2A", status: "Approved" };

// Highlights {variables} in a template body.
function TemplateBody({ body }: { body: string }) {
  return (
    <>
      {body.split(/(\{\w*\})/g).map((part, i) =>
        /^\{\w*\}$/.test(part) ? (
          <span key={i} className="rounded bg-indigo-50 px-1 font-mono text-[0.85em] text-indigo-700">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function SmsTemplatesTab() {
  const { user } = useAuth();
  const canEdit = canEditNotificationTemplates(user?.adminRole ?? null);
  const { data, error, reload, setData } = useApiQuery<{ templates: SmsTemplateDTO[] }>("/api/admin/notifications/sms/templates", "Couldn't load SMS templates");
  const [editing, setEditing] = useState<SmsTemplateDTO | null>(null);

  return (
    <Card>
      <CardHeader
        icon={<MessageSquare className="h-4 w-4" />}
        title="SMS templates"
        description="Short text messages for key account and application events. Variables: {userName}, {appId}, {status}."
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <TableSkeleton rows={6} cols={3} />
      ) : data.templates.length === 0 ? (
        <EmptyState title="No SMS templates" />
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.templates.map((t) => {
            const segments = smsSegmentInfo(renderSmsTemplate(t.body, SAMPLE)).segments;
            return (
              <li key={t.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-900">{t.name}</p>
                    {t.isActive ? <Badge tone="green" dot>Active</Badge> : <Badge tone="gray" dot>Off</Badge>}
                    {t.isCustomized ? <Badge tone="indigo">Customized</Badge> : <Badge>Default</Badge>}
                    <span className="text-xs text-gray-400">
                      {segments} segment{segments === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t.description}
                    {t.updatedAt && (
                      <>
                        {" · "}Edited {formatRelative(t.updatedAt)}
                        {t.updatedBy && <> by {t.updatedBy}</>}
                      </>
                    )}
                  </p>
                  <p className="mt-2 line-clamp-2 break-words text-sm text-gray-700">
                    <TemplateBody body={t.body} />
                  </p>
                </div>
                <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(t)} className="self-start">
                  {canEdit ? "Edit" : "View"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <SmsTemplateEditor
        template={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setData((prev) => ({ templates: (prev?.templates ?? []).map((t) => (t.key === saved.key ? saved : t)) }));
          setEditing(saved);
        }}
      />
    </Card>
  );
}
