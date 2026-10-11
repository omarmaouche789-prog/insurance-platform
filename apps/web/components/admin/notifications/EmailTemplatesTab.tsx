"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import type { EmailTemplateDTO, EmailTemplateListResponseDTO, EmailTemplatePreviewDTO } from "@insurance/shared";
import { canEditNotificationTemplates } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { useApiQuery } from "../../../lib/use-api";
import { Badge, type BadgeTone } from "../../ui/Badge";
import { Card } from "../../ui/Card";
import { ConfirmDialog, Modal } from "../../ui/Modal";
import { ErrorState, Skeleton } from "../../ui/States";
import { EmailTemplateEditor } from "./email/EmailTemplateEditor";
import { EmailTemplateList } from "./email/EmailTemplateList";

export function EmailTemplatesTab() {
  const { user } = useAuth();
  const canEdit = canEditNotificationTemplates(user?.adminRole ?? null);
  const { data, error, reload, setData } = useApiQuery<EmailTemplateListResponseDTO>("/api/admin/email-templates", "Couldn't load email templates");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const dirty = useRef(false);
  const editorTop = useRef<HTMLDivElement>(null);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  const templates = data?.templates ?? [];
  const selected = templates.find((t) => t.id === selectedId) ?? templates[0] ?? null;

  function open(id: string) {
    setSelectedId(id);
    setPendingId(null);
    // On narrow screens the editor is below the list.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => editorTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function requestOpen(id: string) {
    if (id === selected?.id) return;
    if (dirty.current) setPendingId(id);
    else open(id);
  }

  function onSaved(t: EmailTemplateDTO) {
    setData((prev) => ({ templates: (prev?.templates ?? []).map((x) => (x.id === t.id ? t : x)) }));
  }

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <div className="space-y-6">
        {!data ? (
          <Card>
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </Card>
        ) : (
          <EmailTemplateList templates={templates} selectedId={selected?.id ?? null} onSelect={requestOpen} />
        )}
        <SystemEmails />
      </div>

      <div ref={editorTop} className="min-w-0 scroll-mt-20">
        {!selected ? (
          <Card>
            <div className="p-5">
              <Skeleton className="h-[560px] w-full" />
            </div>
          </Card>
        ) : (
          <EmailTemplateEditor
            key={`${selected.id}:${selected.updatedAt}`}
            template={selected}
            canEdit={canEdit}
            onSaved={onSaved}
            onDirtyChange={onDirtyChange}
          />
        )}
      </div>

      <ConfirmDialog
        open={pendingId !== null}
        onClose={() => setPendingId(null)}
        onConfirm={() => pendingId && open(pendingId)}
        title="Discard unsaved changes?"
        description="You've edited this template but haven't saved it. Switching templates will discard your changes."
        confirmLabel="Discard changes"
      />
    </div>
  );
}

const AUDIENCE_TONE: Record<EmailTemplatePreviewDTO["audience"], BadgeTone> = { Applicant: "blue", Agent: "violet", "Any user": "gray" };

// Security notices, password resets and account emails keep fixed wording
// (they carry one-time links or legal notices). Listed here read-only so
// admins can still see everything the platform sends.
function SystemEmails() {
  const { data } = useApiQuery<{ templates: EmailTemplatePreviewDTO[] }>("/api/admin/notifications/email/templates", "Couldn't load system emails");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const shown = data?.templates.find((t) => t.key === openKey) ?? null;

  if (!data || data.templates.length === 0) return null;
  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-gray-50"
      >
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900">System emails</span>
          <span className="mt-0.5 block text-sm text-gray-500">{data.templates.length} emails with fixed wording</span>
        </span>
        <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
      </button>
      {expanded && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {data.templates.map((t) => (
            <li key={t.key}>
              <button type="button" onClick={() => setOpenKey(t.key)} className="flex w-full items-center justify-between gap-2 px-5 py-2.5 text-left hover:bg-gray-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-gray-800">{t.name}</span>
                  <span className="block truncate text-xs text-gray-500">{t.description}</span>
                </span>
                <Badge tone={AUDIENCE_TONE[t.audience]}>{t.audience}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={shown !== null} onClose={() => setOpenKey(null)} size="lg" title={shown?.name ?? ""} description={shown ? <>Subject: {shown.subject}</> : undefined}>
        {shown && (
          <>
            <iframe
              title={`${shown.name} preview`}
              sandbox=""
              srcDoc={`<!doctype html><html><body style="margin:0;padding:24px;font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;background:#fff">${shown.html}</body></html>`}
              className="h-[360px] w-full rounded-lg border border-gray-200 bg-[#fff]"
            />
            <p className="mt-2 text-xs text-gray-500">Fixed wording: these emails carry one-time links or account notices, so they aren&apos;t editable.</p>
          </>
        )}
      </Modal>
    </Card>
  );
}
