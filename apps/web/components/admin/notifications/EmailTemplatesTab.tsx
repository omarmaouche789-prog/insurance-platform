"use client";

import { useState } from "react";
import { Code2, Eye, Info, Mail } from "lucide-react";
import type { EmailTemplatePreviewDTO } from "@insurance/shared";
import { useApiQuery } from "../../../lib/use-api";
import { Badge, type BadgeTone } from "../../ui/Badge";
import { Card, CardHeader } from "../../ui/Card";
import { Alert, EmptyState, ErrorState, Skeleton } from "../../ui/States";
import { FilterTabs } from "../../ui/Tabs";
import { cn } from "../../ui/cn";

const AUDIENCE_TONE: Record<EmailTemplatePreviewDTO["audience"], BadgeTone> = { Applicant: "blue", Agent: "violet", "Any user": "gray" };

// Read-only: email wording is defined in code (apps/api/src/integrations/
// emailTemplates.ts). This shows each email exactly as it renders.
export function EmailTemplatesTab() {
  const { data, error, reload } = useApiQuery<{ templates: EmailTemplatePreviewDTO[] }>("/api/admin/notifications/email/templates", "Couldn't load email templates");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [view, setView] = useState<"preview" | "text">("preview");

  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  const templates = data?.templates ?? [];
  const selected = templates.find((t) => t.key === selectedKey) ?? templates[0];

  return (
    <div className="space-y-4">
      <Alert tone="blue">
        <span className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Email wording is part of the app&apos;s code and changes with a release. Every email is PHI-free by design: it says there&apos;s an update and links back to the portal.
        </span>
      </Alert>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Email templates" description={data ? `${templates.length} templates` : undefined} icon={<Mail className="h-4 w-4" />} />
          {!data ? (
            <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : templates.length === 0 ? (
            <EmptyState title="No email templates" />
          ) : (
            <ul className="max-h-[640px] divide-y divide-gray-100 overflow-y-auto" role="listbox" aria-label="Email templates">
              {templates.map((t) => {
                const active = t.key === selected?.key;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => setSelectedKey(t.key)}
                      className={cn("flex w-full flex-col gap-1 px-5 py-3 text-left transition-colors", active ? "bg-indigo-50" : "hover:bg-gray-50")}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900">{t.name}</span>
                        <Badge tone={AUDIENCE_TONE[t.audience]}>{t.audience}</Badge>
                      </span>
                      <span className="text-xs text-gray-500">{t.description}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="min-w-0">
          {!selected ? (
            <div className="p-5"><Skeleton className="h-96 w-full" /></div>
          ) : (
            <>
              <CardHeader
                title={selected.name}
                description={<>Subject: <span className="font-medium text-gray-900">{selected.subject}</span></>}
                actions={
                  <FilterTabs<"preview" | "text">
                    label="Preview format"
                    value={view}
                    onChange={setView}
                    tabs={[
                      { value: "preview", label: "Preview" },
                      { value: "text", label: "Plain text" },
                    ]}
                  />
                }
              />
              <div className="p-5">
                {view === "preview" ? (
                  // Sandboxed with no permissions: the preview can't run scripts or navigate.
                  <iframe
                    title={`${selected.name} preview`}
                    sandbox=""
                    srcDoc={`<!doctype html><html><body style="margin:0;padding:24px;font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;background:#fff">${selected.html}</body></html>`}
                    className="h-[420px] w-full rounded-lg border border-gray-200 bg-[#fff]"
                  />
                ) : (
                  <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs text-gray-800">{selected.text}</pre>
                )}
                <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
                  {view === "preview" ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <Code2 className="h-3.5 w-3.5" aria-hidden />}
                  Rendered with sample data (Uma, a sample application).
                </p>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
