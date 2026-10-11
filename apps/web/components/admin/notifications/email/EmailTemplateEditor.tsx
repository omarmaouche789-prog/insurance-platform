"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Braces, Eye, Lock, RotateCcw, Save, Undo2 } from "lucide-react";
import type { EmailTemplateDTO, EmailTemplateVariable } from "@insurance/shared";
import { EMAIL_SUBJECT_MAX, EMAIL_TEMPLATE_VARIABLE_INFO, unknownEmailVariables } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import { formatDateTime } from "../../../../lib/format";
import { RichTextEditor } from "../../../cms/RichTextEditor";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card, CardBody, CardHeader } from "../../../ui/Card";
import { CharCount, Checkbox, Field, Input } from "../../../ui/Field";
import { ConfirmDialog } from "../../../ui/Modal";
import { Alert } from "../../../ui/States";
import { useToast } from "../../../ui/Toast";
import { TemplateStatusBadge } from "./EmailTemplateList";
import { TemplatePreview } from "./TemplatePreview";

// Text content of the editor's HTML, for "is it empty?" and variable checks.
function bodyText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function EmailTemplateEditor({
  template,
  canEdit,
  onSaved,
  onDirtyChange,
}: {
  template: EmailTemplateDTO;
  canEdit: boolean;
  onSaved: (t: EmailTemplateDTO) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [busy, setBusy] = useState<"save" | "revert" | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [highlight, setHighlight] = useState(true);
  // The editor is remounted (by key) after a discard so it reloads the saved HTML.
  const [editorVersion, setEditorVersion] = useState(0);

  const subjectRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastFocus = useRef<"subject" | "body">("body");
  const onEditorReady = useCallback((e: Editor) => {
    editorRef.current = e;
  }, []);

  const dirty = subject !== template.subject || body !== template.body;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  // Closing the tab with unsaved wording is easy to do by accident.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const errors = useMemo(() => {
    const text = bodyText(body);
    const unknown = [...new Set([...unknownEmailVariables(subject, template.variables), ...unknownEmailVariables(text, template.variables)])];
    return {
      subject: !subject.trim() ? "Subject can't be empty" : subject.length > EMAIL_SUBJECT_MAX ? `Keep the subject under ${EMAIL_SUBJECT_MAX} characters` : null,
      body: !text ? "Body can't be empty" : null,
      variables: unknown.length
        ? `Not available in this template: ${unknown.map((v) => `{${v}}`).join(", ")}. Use the variables listed below.`
        : null,
    };
  }, [subject, body, template.variables]);
  const invalid = Boolean(errors.subject || errors.body || errors.variables);

  function insertVariable(name: EmailTemplateVariable) {
    const token = `{${name}}`;
    if (lastFocus.current === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      setSubject(subject.slice(0, start) + token + subject.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    } else {
      editorRef.current?.chain().focus().insertContent(token).run();
    }
  }

  async function save() {
    if (invalid || !accessToken) return;
    setBusy("save");
    setServerError(null);
    try {
      const res = await apiFetch<{ template: EmailTemplateDTO }>(`/api/admin/email-templates/${template.id}`, {
        method: "PUT",
        accessToken,
        body: JSON.stringify({ subject, body }),
      });
      toast.success("Template saved successfully");
      onSaved(res.template);
    } catch (err) {
      setServerError(describeApiError(err, "Couldn't save the template"));
    } finally {
      setBusy(null);
    }
  }

  async function revert() {
    if (!accessToken) return;
    setBusy("revert");
    setServerError(null);
    try {
      const res = await apiFetch<{ template: EmailTemplateDTO }>(`/api/admin/email-templates/${template.id}/revert`, { method: "POST", accessToken });
      setConfirmRevert(false);
      toast.success("Template reverted to default");
      onSaved(res.template);
    } catch (err) {
      setConfirmRevert(false);
      setServerError(describeApiError(err, "Couldn't revert the template"));
    } finally {
      setBusy(null);
    }
  }

  function discard() {
    setSubject(template.subject);
    setBody(template.body);
    setServerError(null);
    setEditorVersion((v) => v + 1);
  }

  const readOnly = !canEdit || busy !== null;

  return (
    <Card className="min-w-0">
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {template.name}
            <TemplateStatusBadge isDefault={template.isDefault} />
            {dirty && <Badge tone="indigo">Unsaved changes</Badge>}
          </span>
        }
        description={template.description}
      />

      <CardBody className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-5">
          {!canEdit && (
            <Alert tone="blue">
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
                You can view templates. Only Super and Operations admins can edit them.
              </span>
            </Alert>
          )}

          <Field label="Template name" htmlFor="tpl-name" hint="Fixed: the platform sends this email automatically.">
            <Input id="tpl-name" value={template.name} readOnly disabled />
          </Field>

          <Field
            label={
              <span className="flex items-center justify-between">
                <span>Email subject</span>
                <CharCount value={subject} max={EMAIL_SUBJECT_MAX} />
              </span>
            }
            htmlFor="tpl-subject"
            error={errors.subject}
          >
            <Input
              ref={subjectRef}
              id="tpl-subject"
              value={subject}
              disabled={readOnly}
              invalid={Boolean(errors.subject)}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => (lastFocus.current = "subject")}
            />
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">Email body</p>
            <RichTextEditor
              key={`${template.id}:${editorVersion}`}
              value={template.body}
              onChange={setBody}
              placeholder="Write the email…"
              allowImages={false}
              readOnly={readOnly}
              label="Email body"
              minHeightClass="min-h-[200px]"
              onReady={onEditorReady}
              onFocus={() => (lastFocus.current = "body")}
            />
            {errors.body && (
              <p className="mt-1.5 text-xs text-red-600" role="alert">
                {errors.body}
              </p>
            )}
            <p className="mt-1.5 text-xs text-gray-500">
              The <span className="font-medium text-gray-700">{template.callToAction}</span> button and a privacy note are added below the body automatically.
            </p>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Braces className="h-4 w-4 text-gray-400" aria-hidden />
              Available variables
            </p>
            <div className="flex flex-wrap gap-2">
              {template.variables.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={readOnly}
                  // Keep the cursor where it is in the subject or body.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertVariable(v)}
                  title={`${EMAIL_TEMPLATE_VARIABLE_INFO[v].hint} — e.g. ${EMAIL_TEMPLATE_VARIABLE_INFO[v].sample}`}
                  className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-mono text-xs text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {canEdit ? "Click a variable to insert it at the cursor. " : ""}Emails never include health details, SSNs or rejection reasons: those stay in the portal.
            </p>
          </div>

          {errors.variables && <Alert tone="red">{errors.variables}</Alert>}
          {serverError && <Alert tone="red">{serverError}</Alert>}
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Eye className="h-4 w-4 text-gray-400" aria-hidden />
              Live preview
            </p>
            <Checkbox label="Highlight variables" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
          </div>
          <TemplatePreview subject={subject} body={body} variables={template.variables} callToAction={template.callToAction} highlightVariables={highlight} />
          <p className="mt-2 text-xs text-gray-500">Shown with sample data. Highlighted text is filled in for each recipient.</p>
        </div>
      </CardBody>

      <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">
          {template.updatedBy ? (
            <>
              Last saved by <span className="font-medium text-gray-700">{template.updatedBy}</span> on {formatDateTime(template.updatedAt)}
            </>
          ) : (
            <>Built-in wording · never edited</>
          )}
        </p>
        {canEdit && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button
              variant="orange"
              icon={<RotateCcw className="h-4 w-4" aria-hidden />}
              disabled={template.isDefault || busy !== null}
              onClick={() => setConfirmRevert(true)}
              title={template.isDefault ? "Already using the default wording" : undefined}
            >
              Revert to default
            </Button>
            {dirty && (
              <Button icon={<Undo2 className="h-4 w-4" aria-hidden />} disabled={busy !== null} onClick={discard}>
                Discard
              </Button>
            )}
            <Button variant="navy" icon={<Save className="h-4 w-4" aria-hidden />} loading={busy === "save"} disabled={!dirty || invalid || busy !== null} onClick={save}>
              Save template
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmRevert}
        onClose={() => setConfirmRevert(false)}
        onConfirm={() => void revert()}
        loading={busy === "revert"}
        tone="primary"
        title="Revert to the default template?"
        description={`The subject and body of "${template.name}" go back to the built-in wording. Your customized version${dirty ? ", including unsaved changes," : ""} will be lost.`}
        confirmLabel="Revert to default"
      />
    </Card>
  );
}
