"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RotateCcw, Send, Smartphone } from "lucide-react";
import type { SmsTemplateDTO, SmsTemplateVariable, SmsTestSendResponseDTO } from "@insurance/shared";
import {
  canEditNotificationTemplates,
  renderSmsTemplate,
  SMS_BODY_MAX,
  SMS_TEMPLATE_VARIABLE_HINTS,
  SMS_TEMPLATE_VARIABLES,
  smsSegmentInfo,
  unknownSmsVariables,
} from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { Button } from "../../ui/Button";
import { Checkbox, Field, Input, Textarea } from "../../ui/Field";
import { Modal } from "../../ui/Modal";
import { Alert } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { cn } from "../../ui/cn";

const SAMPLE: Record<SmsTemplateVariable, string> = { userName: "Uma", appId: "APP-4F2A", status: "Approved" };

export function SmsTemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: SmsTemplateDTO | null;
  onClose: () => void;
  onSaved: (t: SmsTemplateDTO) => void;
}) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const canEdit = canEditNotificationTemplates(user?.adminRole ?? null);
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sample, setSample] = useState<Record<SmsTemplateVariable, string>>(SAMPLE);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<"save" | "reset" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSend, setLastSend] = useState<SmsTestSendResponseDTO | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // Where the cursor should land after an inserted variable re-renders the
  // text. Applied in a layout effect — before the browser paints and before
  // any further keystroke — so typing right after an insert can't scramble.
  const pendingCursor = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = textarea.current;
    if (el && pendingCursor.current !== null) {
      el.setSelectionRange(pendingCursor.current, pendingCursor.current);
      pendingCursor.current = null;
    }
  }, [body]);

  useEffect(() => {
    if (!template) return;
    setBody(template.body);
    setIsActive(template.isActive);
    setError(null);
    setLastSend(null);
  }, [template]);

  if (!template) return null;

  const unknown = unknownSmsVariables(body);
  const rendered = renderSmsTemplate(body, sample);
  const info = smsSegmentInfo(rendered);
  const dirty = body !== template.body || isActive !== template.isActive;
  const invalid = unknown.length > 0 || !body.trim() || body.length > SMS_BODY_MAX;

  // Inserts {variable} at the cursor (replacing any selection).
  function insertVariable(v: SmsTemplateVariable) {
    const el = textarea.current;
    const token = `{${v}}`;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    pendingCursor.current = start + token.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    el?.focus();
  }

  async function save() {
    if (!accessToken || !template) return;
    setBusy("save");
    setError(null);
    try {
      const res = await apiFetch<{ template: SmsTemplateDTO }>(`/api/admin/notifications/sms/templates/${template.key}`, {
        method: "PUT",
        body: JSON.stringify({ body, isActive }),
        accessToken,
      });
      toast.success("SMS template saved", res.template.name);
      onSaved(res.template);
    } catch (err) {
      setError(describeApiError(err, "Couldn't save the template"));
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!accessToken || !template) return;
    setBusy("reset");
    setError(null);
    try {
      const res = await apiFetch<{ template: SmsTemplateDTO }>(`/api/admin/notifications/sms/templates/${template.key}/reset`, { method: "POST", accessToken });
      setBody(res.template.body);
      setIsActive(res.template.isActive);
      toast.success("Restored the default wording");
      onSaved(res.template);
    } catch (err) {
      setError(describeApiError(err, "Couldn't reset the template"));
    } finally {
      setBusy(null);
    }
  }

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !template) return;
    setBusy("send");
    setError(null);
    try {
      // Sends what's in the editor now, saved or not.
      const res = await apiFetch<SmsTestSendResponseDTO>("/api/admin/notifications/sms/send", {
        method: "POST",
        body: JSON.stringify({ to: phone, templateKey: template.key, body, variables: sample }),
        accessToken,
      });
      setLastSend(res);
      if (res.status === "sent") toast.success("Test SMS sent", `To ${res.to} · ${res.segments} segment${res.segments === 1 ? "" : "s"}`);
      else toast.info("Test SMS logged", "No SMS provider is configured, so the message was written to the API log instead of sent.");
    } catch (err) {
      setError(describeApiError(err, "Couldn't send the test SMS"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={() => busy === null && onClose()}
      size="xl"
      title={`Edit SMS: ${template.name}`}
      description={template.description}
      footer={
        <>
          {canEdit && (
            <Button
              variant="ghost"
              className="mr-auto"
              icon={<RotateCcw className="h-4 w-4" />}
              loading={busy === "reset"}
              disabled={busy !== null || (!template.isCustomized && template.isActive && body === template.defaultBody)}
              onClick={reset}
            >
              Reset to default
            </Button>
          )}
          <Button onClick={onClose} disabled={busy !== null}>
            {dirty ? "Discard" : "Close"}
          </Button>
          {canEdit && (
            <Button variant="primary" loading={busy === "save"} disabled={busy !== null || !dirty || invalid} onClick={save}>
              Save template
            </Button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field
            label={
              <span className="flex items-center justify-between">
                Message
                <span className={cn("text-xs tabular-nums", body.length > SMS_BODY_MAX ? "text-red-600" : "text-gray-400")}>
                  {body.length}/{SMS_BODY_MAX}
                </span>
              </span>
            }
            htmlFor="sms-body"
            error={unknown.length ? `Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown.map((v) => `{${v}}`).join(", ")}` : null}
            hint="Keep it short and PHI-free: no health details, SSNs or rejection reasons. Include opt-out wording such as “Reply STOP to opt out.”"
          >
            <Textarea
              id="sms-body"
              ref={textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={!canEdit}
              rows={5}
              className="font-mono text-sm"
              data-autofocus
            />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Insert variable</p>
            <div className="flex flex-wrap gap-2">
              {SMS_TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={!canEdit}
                  // Keep focus (and the cursor) in the message box.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertVariable(v)}
                  title={SMS_TEMPLATE_VARIABLE_HINTS[v]}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-mono text-xs text-indigo-700 transition-colors hover:border-indigo-400 disabled:opacity-50"
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>
          </div>
          <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={!canEdit} label="Active (send this SMS when its event happens)" />

          {canEdit && (
            <form onSubmit={sendTest} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">Send a test</p>
              <p className="mt-0.5 text-xs text-gray-500">Sends the message as it is in the editor now, using the sample values on the right.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+15551234567"
                  aria-label="Test phone number"
                  autoComplete="tel"
                  className="sm:flex-1"
                />
                <Button type="submit" icon={<Send className="h-4 w-4" />} loading={busy === "send"} disabled={busy !== null || !phone.trim() || invalid}>
                  Send test SMS
                </Button>
              </div>
              {lastSend && (
                <p className="mt-2 text-xs text-gray-600">
                  {lastSend.status === "sent" ? `Sent to ${lastSend.to} via Twilio` : `Logged for ${lastSend.to} (no SMS provider configured)`}
                  {lastSend.providerMessageId && <> · ID {lastSend.providerMessageId}</>}
                </p>
              )}
            </form>
          )}
        </div>

        <aside className="space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Smartphone className="h-4 w-4 text-gray-400" aria-hidden /> Preview
            </p>
            <div className="rounded-[1.75rem] border border-gray-200 bg-gray-100 p-4">
              <div className="ml-auto w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-navy px-3.5 py-2.5 text-sm leading-snug text-onaccent shadow-sm">
                {rendered || <span className="opacity-70">Empty message</span>}
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-gray-50 py-1.5">
                <dt className="text-gray-500">Characters</dt>
                <dd className="font-semibold tabular-nums text-gray-900">{info.length}</dd>
              </div>
              <div className="rounded-lg bg-gray-50 py-1.5">
                <dt className="text-gray-500">Segments</dt>
                <dd className={cn("font-semibold tabular-nums", info.segments > 2 ? "text-amber-700" : "text-gray-900")}>{info.segments}</dd>
              </div>
              <div className="rounded-lg bg-gray-50 py-1.5">
                <dt className="text-gray-500">Encoding</dt>
                <dd className="font-semibold text-gray-900">{info.encoding}</dd>
              </div>
            </dl>
            {info.encoding === "UCS-2" && (
              <p className="mt-2 text-xs text-amber-700">Emoji or special characters switch the message to UCS-2: only {info.perSegment} characters per segment.</p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Sample values</p>
            {SMS_TEMPLATE_VARIABLES.map((v) => (
              <Field key={v} label={<span className="font-mono text-xs">{`{${v}}`}</span>} htmlFor={`sample-${v}`}>
                <Input
                  id={`sample-${v}`}
                  value={sample[v]}
                  onChange={(e) => setSample((s) => ({ ...s, [v]: e.target.value }))}
                  maxLength={60}
                  className="py-1.5"
                />
              </Field>
            ))}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
