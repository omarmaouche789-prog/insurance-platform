"use client";

import { useId, useMemo, useState } from "react";
import { Clock, Loader2, Save, ToggleRight, Undo2 } from "lucide-react";
import type { FeatureKey, SettingsSectionMeta, SystemSettingsDTO, SystemSettingsResponseDTO } from "@insurance/shared";
import { FEATURE_INFO, SETTINGS_LIMITS, SYSTEM_SETTINGS_DEFAULTS } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card, CardBody, CardHeader } from "../../ui/Card";
import { Field, Input } from "../../ui/Field";
import { ConfirmDialog } from "../../ui/Modal";
import { Alert } from "../../ui/States";
import { Switch } from "../../ui/Switch";
import { LastChanged } from "./LastChanged";
import { useSettingsSave } from "./useSettingsSave";

const ORDER: FeatureKey[] = ["twoFactor", "smsNotifications", "emailNotifications", "analytics", "blog"];

// What each switch actually does today, shown under its description.
const DETAILS: Record<FeatureKey, { on: string; off: string }> = {
  twoFactor: {
    on: "Admins and agents without 2FA are sent to set it up before they can use their portal. Applicants can still opt in.",
    off: "2FA is optional for everyone.",
  },
  smsNotifications: {
    on: "Saved for when text alerts are connected. No automatic texts are sent yet.",
    off: "No automatic texts are sent yet; test sends from Notifications still work.",
  },
  emailNotifications: {
    on: "Application updates are emailed to applicants and agents.",
    off: "Application-update emails are not sent. Security emails (password reset, 2FA notices, invites) always are.",
  },
  analytics: { on: "The analytics dashboard is in the admin menu.", off: "The analytics dashboard and its reports are hidden." },
  blog: { on: "The public blog and the blog editor are available.", off: "The public blog and the blog editor are hidden." },
};

function confirmCopy(feature: FeatureKey, next: boolean, selfHas2fa: boolean): { title: string; description: string; label: string; danger: boolean } {
  if (feature === "twoFactor") {
    return next
      ? {
          title: "Require two-factor authentication?",
          description: `Every admin and agent without 2FA will have to set it up before using their portal.${selfHas2fa ? "" : " That includes you: you'll be taken to set it up right away."}`,
          label: "Require 2FA",
          danger: false,
        }
      : {
          title: "Stop requiring two-factor authentication?",
          description: "2FA becomes optional for admins and agents. Anyone who already uses it keeps it.",
          label: "Make 2FA optional",
          danger: true,
        };
  }
  return next
    ? { title: "Turn on email notifications?", description: "Applicants and agents will get application-update emails again.", label: "Turn on emails", danger: false }
    : {
        title: "Turn off email notifications?",
        description: "Applicants and agents stop getting emails about their applications (submitted, approved, documents requested…). Security emails still send.",
        label: "Turn off emails",
        danger: true,
      };
}

export function FeatureToggleList({
  values,
  session,
  meta,
  sessionMeta,
  canEdit,
  onSaved,
}: {
  values: SystemSettingsDTO["features"];
  session: SystemSettingsDTO["session"];
  meta: SettingsSectionMeta;
  sessionMeta: SettingsSectionMeta;
  canEdit: boolean;
  onSaved: (res: SystemSettingsResponseDTO) => void;
}) {
  const { user } = useAuth();
  const { save, busy } = useSettingsSave(onSaved);
  const [pending, setPending] = useState<{ feature: FeatureKey; next: boolean } | null>(null);

  async function toggle(feature: FeatureKey, next: boolean) {
    const ok = await save(feature, `/features/${feature}/toggle`, "POST", { enabled: next }, `${FEATURE_INFO[feature].label} turned ${next ? "on" : "off"}`);
    if (ok) setPending(null);
  }

  function request(feature: FeatureKey, next: boolean) {
    if (FEATURE_INFO[feature].critical) setPending({ feature, next });
    else void toggle(feature, next);
  }

  const copy = pending ? confirmCopy(pending.feature, pending.next, Boolean(user?.twoFactorEnabled)) : null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader icon={<ToggleRight className="h-5 w-5" />} title="Feature toggles" description="Changes save immediately and apply to everyone within a minute." />
        <ul className="divide-y divide-gray-100">
          {ORDER.map((f) => (
            <ToggleRow
              key={f}
              feature={f}
              checked={values[f]}
              saving={busy === f}
              disabled={!canEdit || busy !== null}
              onChange={(next) => request(f, next)}
            />
          ))}
        </ul>
        <div className="border-t border-gray-100 px-5 py-3">
          <LastChanged meta={meta} />
        </div>
      </Card>

      <SessionSettingsCard key={sessionMeta.updatedAt ?? "default"} values={session} meta={sessionMeta} canEdit={canEdit} onSaved={onSaved} />

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && void toggle(pending.feature, pending.next)}
        loading={pending !== null && busy === pending.feature}
        tone={copy?.danger ? "danger" : "primary"}
        title={copy?.title ?? ""}
        description={copy?.description}
        confirmLabel={copy?.label}
      />
    </div>
  );
}

function ToggleRow({
  feature,
  checked,
  saving,
  disabled,
  onChange,
}: {
  feature: FeatureKey;
  checked: boolean;
  saving: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  const info = FEATURE_INFO[feature];
  return (
    <li className="flex items-start justify-between gap-6 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span id={id} className="text-sm font-medium text-gray-900">
            {info.label}
          </span>
          {checked ? <Badge tone="green" dot>On</Badge> : <Badge tone="gray">Off</Badge>}
          {feature === "smsNotifications" && <Badge tone="gray">Not connected yet</Badge>}
        </div>
        <p className="mt-1 text-sm text-gray-600">{info.description}</p>
        <p className="mt-1 text-xs text-gray-500">{checked ? DETAILS[feature].on : DETAILS[feature].off}</p>
      </div>
      <span className="mt-0.5 flex items-center gap-2">
        {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label="Saving" />}
        <Switch checked={checked} onChange={onChange} disabled={disabled} labelledBy={id} />
      </span>
    </li>
  );
}

function rangeError(raw: string, label: string, { min, max }: { min: number; max: number }): string | null {
  if (raw.trim() === "") return `Enter ${label.toLowerCase()}`;
  const n = Number(raw);
  if (!Number.isInteger(n)) return `${label} must be a whole number`;
  if (n < min || n > max) return `${label} must be between ${min} and ${max}`;
  return null;
}

function SessionSettingsCard({
  values,
  meta,
  canEdit,
  onSaved,
}: {
  values: SystemSettingsDTO["session"];
  meta: SettingsSectionMeta;
  canEdit: boolean;
  onSaved: (res: SystemSettingsResponseDTO) => void;
}) {
  const [timeout, setTimeoutValue] = useState(String(values.timeoutMinutes));
  const [attempts, setAttempts] = useState(String(values.maxLoginAttempts));
  const { save, busy, error } = useSettingsSave(onSaved);
  const errors = useMemo(
    () => ({
      timeout: rangeError(timeout, "Session timeout", SETTINGS_LIMITS.timeoutMinutes),
      attempts: rangeError(attempts, "Max login attempts", SETTINGS_LIMITS.maxLoginAttempts),
    }),
    [timeout, attempts],
  );
  const dirty = timeout !== String(values.timeoutMinutes) || attempts !== String(values.maxLoginAttempts);
  const disabled = !canEdit || busy !== null;

  return (
    <Card>
      <CardHeader icon={<Clock className="h-5 w-5" />} title="Sign-in & sessions" description="How long idle sessions last and when accounts lock after failed sign-ins." />
      <CardBody className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Session timeout (minutes)"
          htmlFor="timeout"
          error={errors.timeout}
          hint={`Inactive this long → sign in again. Allowed ${SETTINGS_LIMITS.timeoutMinutes.min}–${SETTINGS_LIMITS.timeoutMinutes.max}, default ${SYSTEM_SETTINGS_DEFAULTS.session.timeoutMinutes}.`}
        >
          <Input id="timeout" type="number" inputMode="numeric" value={timeout} onChange={(e) => setTimeoutValue(e.target.value)} disabled={disabled} invalid={Boolean(errors.timeout)} />
        </Field>
        <Field
          label="Max login attempts"
          htmlFor="attempts"
          error={errors.attempts}
          hint={`Wrong passwords or 2FA codes allowed in 15 minutes before the account locks. Allowed ${SETTINGS_LIMITS.maxLoginAttempts.min}–${SETTINGS_LIMITS.maxLoginAttempts.max}, default ${SYSTEM_SETTINGS_DEFAULTS.session.maxLoginAttempts}.`}
        >
          <Input id="attempts" type="number" inputMode="numeric" value={attempts} onChange={(e) => setAttempts(e.target.value)} disabled={disabled} invalid={Boolean(errors.attempts)} />
        </Field>
        {error && (
          <div className="sm:col-span-2">
            <Alert tone="red">{error}</Alert>
          </div>
        )}
      </CardBody>
      <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <LastChanged meta={meta} />
        {canEdit && (
          <div className="flex gap-2">
            {dirty && (
              <Button icon={<Undo2 className="h-4 w-4" aria-hidden />} disabled={busy !== null} onClick={() => { setTimeoutValue(String(values.timeoutMinutes)); setAttempts(String(values.maxLoginAttempts)); }}>
                Discard
              </Button>
            )}
            <Button
              variant="navy"
              icon={<Save className="h-4 w-4" aria-hidden />}
              loading={busy === "session"}
              disabled={!dirty || Boolean(errors.timeout || errors.attempts) || busy !== null}
              onClick={() => void save("session", "/session", "PUT", { timeoutMinutes: Number(timeout), maxLoginAttempts: Number(attempts) }, "Session settings saved")}
            >
              Save
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
