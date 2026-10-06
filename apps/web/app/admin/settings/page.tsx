"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Clock, Construction, Lock, Save, ToggleRight, Undo2 } from "lucide-react";
import type { SystemSettingsDTO, SystemSettingsResponseDTO } from "@insurance/shared";
import { canEditSystemSettings, SETTINGS_LIMITS, SYSTEM_SETTINGS_DEFAULTS } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { formatDateTime } from "../../../lib/format";
import { useApiQuery } from "../../../lib/use-api";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { CharCount, Field, Input, Textarea } from "../../../components/ui/Field";
import { ConfirmDialog } from "../../../components/ui/Modal";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { Alert, ErrorState, LoadingState } from "../../../components/ui/States";
import { Switch } from "../../../components/ui/Switch";
import { useToast } from "../../../components/ui/Toast";

type FeatureKey = keyof SystemSettingsDTO["features"];

const FEATURES: { key: FeatureKey; label: string; description: string; pending?: string }[] = [
  {
    key: "twoFactor",
    label: "Two-factor authentication",
    description:
      "Lets users, agents and admins turn on authenticator-app 2FA. Turning this off only stops new enrollments — accounts that already use 2FA keep being asked for a code.",
  },
  {
    key: "recommendations",
    label: "Plan recommendations",
    description: "Personalized plan suggestions for signed-in users.",
    pending: "The recommendation engine isn't built yet — this switch is saved and will take effect when it ships.",
  },
  {
    key: "smsNotifications",
    label: "SMS notifications",
    description: "Text-message alerts to applicants and agents using the SMS templates.",
    pending: "No automatic text messages are sent yet — only test sends from Notifications. Saved for when they are.",
  },
  {
    key: "hipaaCompliance",
    label: "HIPAA compliance mode",
    description: "Stricter handling of protected health information.",
    pending: "What this mode enforces hasn't been decided yet, so it has no effect today.",
  },
];

// Values in the number inputs are kept as strings so a half-typed value
// ("" or "1") doesn't snap back while the admin is still typing.
interface Draft {
  features: SystemSettingsDTO["features"];
  maintenance: SystemSettingsDTO["maintenance"];
  session: { timeoutMinutes: string; maxLoginAttempts: string };
}

function toDraft(s: SystemSettingsDTO): Draft {
  return {
    features: { ...s.features },
    maintenance: { ...s.maintenance },
    session: { timeoutMinutes: String(s.session.timeoutMinutes), maxLoginAttempts: String(s.session.maxLoginAttempts) },
  };
}

function rangeError(raw: string, label: string, { min, max }: { min: number; max: number }): string | null {
  if (raw.trim() === "") return `Enter ${label.toLowerCase()}`;
  const n = Number(raw);
  if (!Number.isInteger(n)) return `${label} must be a whole number`;
  if (n < min || n > max) return `${label} must be between ${min} and ${max}`;
  return null;
}

function formatMinutes(n: number): string {
  if (n < 60) return `${n} minute${n === 1 ? "" : "s"}`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} min` : ""}`;
}

export default function AdminSettingsPage() {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const canEdit = canEditSystemSettings(user?.adminRole ?? null);
  const query = useApiQuery<SystemSettingsResponseDTO>("/api/admin/settings", "Couldn't load system settings");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);

  useEffect(() => {
    if (query.data) setDraft(toDraft(query.data.settings));
  }, [query.data]);

  const saved = query.data?.settings ?? null;

  const errors = useMemo(() => {
    if (!draft) return {};
    return {
      timeoutMinutes: rangeError(draft.session.timeoutMinutes, "Session timeout", SETTINGS_LIMITS.timeoutMinutes),
      maxLoginAttempts: rangeError(draft.session.maxLoginAttempts, "Max login attempts", SETTINGS_LIMITS.maxLoginAttempts),
      message:
        draft.maintenance.enabled && draft.maintenance.message.trim() === ""
          ? "Write the message users will see during maintenance"
          : draft.maintenance.message.length > SETTINGS_LIMITS.maintenanceMessageMax
            ? `Keep the message under ${SETTINGS_LIMITS.maintenanceMessageMax} characters`
            : null,
    };
  }, [draft]);
  const hasErrors = Object.values(errors).some(Boolean);

  const next: SystemSettingsDTO | null = useMemo(() => {
    if (!draft) return null;
    return {
      features: draft.features,
      maintenance: { enabled: draft.maintenance.enabled, message: draft.maintenance.message.trim() },
      session: { timeoutMinutes: Number(draft.session.timeoutMinutes), maxLoginAttempts: Number(draft.session.maxLoginAttempts) },
    };
  }, [draft]);

  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    return JSON.stringify(toDraft(saved)) !== JSON.stringify(draft);
  }, [draft, saved]);

  // Leaving with unsaved switches flipped is easy to miss on a settings page.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const turningMaintenanceOn = Boolean(saved && next && !saved.maintenance.enabled && next.maintenance.enabled);

  function requestSave() {
    if (hasErrors || !next) return;
    if (turningMaintenanceOn) setConfirmMaintenance(true);
    else void save();
  }

  async function save() {
    if (!next || !accessToken) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch<SystemSettingsResponseDTO>("/api/admin/settings", {
        method: "POST",
        accessToken,
        body: JSON.stringify(next),
      });
      query.setData(res);
      setConfirmMaintenance(false);
      toast.success(
        "Settings saved",
        res.settings.maintenance.enabled ? "Maintenance mode is on. Only admins can use the platform." : undefined,
      );
    } catch (err) {
      setSaveError(describeApiError(err, "Couldn't save settings"));
      setConfirmMaintenance(false);
    } finally {
      setSaving(false);
    }
  }

  function setFeature(key: FeatureKey, value: boolean) {
    setDraft((d) => (d ? { ...d, features: { ...d.features, [key]: value } } : d));
  }

  if (query.loading && !query.data) {
    return (
      <PageContainer>
        <PageHeader title="System settings" />
        <LoadingState label="Loading settings…" />
      </PageContainer>
    );
  }
  if (query.error || !draft || !saved) {
    return (
      <PageContainer>
        <PageHeader title="System settings" />
        <Card>
          <ErrorState message={query.error ?? "Couldn't load system settings"} onRetry={query.reload} />
        </Card>
      </PageContainer>
    );
  }

  const readOnly = !canEdit || saving;

  return (
    <PageContainer>
      <PageHeader
        title="System settings"
        description="Platform-wide switches for security, sign-in and availability. Changes apply to everyone within a few seconds."
        actions={
          query.data?.updatedAt && (
            <p className="text-xs text-gray-500">
              Last changed {formatDateTime(query.data.updatedAt)}
              {query.data.updatedBy && <> by {query.data.updatedBy}</>}
            </p>
          )
        }
      />

      <div className="space-y-5 pb-24">
        {!canEdit && (
          <Alert tone="blue">
            <span className="inline-flex items-center gap-2">
              <Lock className="h-4 w-4 shrink-0" aria-hidden />
              You can view these settings. Only Super admins can change them.
            </span>
          </Alert>
        )}
        {saved.maintenance.enabled && (
          <Alert tone="amber">
            <strong className="font-semibold">Maintenance mode is on.</strong> Applicants and agents can&apos;t use the platform until it&apos;s
            turned off.
          </Alert>
        )}

        <Card>
          <CardHeader
            icon={<ToggleRight className="h-5 w-5" aria-hidden />}
            title="Feature toggles"
            description="Turn platform features on or off."
          />
          <ul className="divide-y divide-gray-100">
            {FEATURES.map((f) => (
              <ToggleRow
                key={f.key}
                label={f.label}
                description={f.description}
                note={f.pending}
                badge={f.pending ? <Badge tone="gray">Not active yet</Badge> : undefined}
                checked={draft.features[f.key]}
                changed={draft.features[f.key] !== saved.features[f.key]}
                disabled={readOnly}
                onChange={(v) => setFeature(f.key, v)}
              />
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            icon={<Construction className="h-5 w-5" aria-hidden />}
            title="Maintenance mode"
            description="Take the platform offline for everyone except admins."
          />
          <ul className="divide-y divide-gray-100">
            <ToggleRow
              label="Enable maintenance mode"
              description="Applicants, agents and visitors see the message below instead of the app and can't make changes. Admins keep full access, and the sign-in page stays open so admins can get in."
              badge={draft.maintenance.enabled ? <Badge tone="amber" dot>Offline</Badge> : <Badge tone="green" dot>Online</Badge>}
              checked={draft.maintenance.enabled}
              changed={draft.maintenance.enabled !== saved.maintenance.enabled}
              disabled={readOnly}
              onChange={(v) => setDraft((d) => (d ? { ...d, maintenance: { ...d.maintenance, enabled: v } } : d))}
            />
          </ul>
          <CardBody className="space-y-4 border-t border-gray-100">
            <Field
              label={
                <span className="flex items-center justify-between">
                  <span>Maintenance message</span>
                  <CharCount value={draft.maintenance.message} max={SETTINGS_LIMITS.maintenanceMessageMax} />
                </span>
              }
              htmlFor="maintenance-message"
              error={errors.message}
              hint="Shown to everyone who isn't an admin while maintenance mode is on."
            >
              <Textarea
                id="maintenance-message"
                rows={3}
                value={draft.maintenance.message}
                disabled={readOnly}
                onChange={(e) => setDraft((d) => (d ? { ...d, maintenance: { ...d.maintenance, message: e.target.value } } : d))}
              />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Preview</p>
              {canEdit && draft.maintenance.message !== SYSTEM_SETTINGS_DEFAULTS.maintenance.message && (
                <button
                  type="button"
                  className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50"
                  disabled={readOnly}
                  onClick={() =>
                    setDraft((d) => (d ? { ...d, maintenance: { ...d.maintenance, message: SYSTEM_SETTINGS_DEFAULTS.maintenance.message } } : d))
                  }
                >
                  Use default message
                </button>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-8 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                <Construction className="h-5 w-5" aria-hidden />
              </div>
              <p className="text-sm font-semibold text-gray-900">We&apos;ll be right back</p>
              <p className="mx-auto mt-1 max-w-md whitespace-pre-line text-sm text-gray-600">
                {draft.maintenance.message.trim() || <span className="italic text-gray-400">No message yet</span>}
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Clock className="h-5 w-5" aria-hidden />} title="Sessions & sign-in" description="How long sessions last and when accounts lock." />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <NumberField
              id="timeout"
              label="Session timeout"
              unit="minutes"
              value={draft.session.timeoutMinutes}
              limits={SETTINGS_LIMITS.timeoutMinutes}
              error={errors.timeoutMinutes}
              disabled={readOnly}
              changed={draft.session.timeoutMinutes !== String(saved.session.timeoutMinutes)}
              hint={
                !errors.timeoutMinutes
                  ? `Anyone inactive for ${formatMinutes(Number(draft.session.timeoutMinutes))} has to sign in again. Default ${SYSTEM_SETTINGS_DEFAULTS.session.timeoutMinutes}.`
                  : undefined
              }
              onChange={(v) => setDraft((d) => (d ? { ...d, session: { ...d.session, timeoutMinutes: v } } : d))}
            />
            <NumberField
              id="attempts"
              label="Max login attempts"
              unit="attempts"
              value={draft.session.maxLoginAttempts}
              limits={SETTINGS_LIMITS.maxLoginAttempts}
              error={errors.maxLoginAttempts}
              disabled={readOnly}
              changed={draft.session.maxLoginAttempts !== String(saved.session.maxLoginAttempts)}
              hint={
                !errors.maxLoginAttempts
                  ? `After ${draft.session.maxLoginAttempts} wrong passwords or 2FA codes in 15 minutes, the account locks for the rest of that window. Default ${SYSTEM_SETTINGS_DEFAULTS.session.maxLoginAttempts}.`
                  : undefined
              }
              onChange={(v) => setDraft((d) => (d ? { ...d, session: { ...d.session, maxLoginAttempts: v } } : d))}
            />
          </CardBody>
        </Card>

        {saveError && <Alert tone="red">{saveError}</Alert>}
      </div>

      {canEdit && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 shadow-overlay backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">Unsaved changes.</span>{" "}
              {hasErrors ? "Fix the highlighted fields to save." : "Changes take effect for everyone once saved."}
            </p>
            <div className="flex gap-2">
              <Button
                icon={<Undo2 className="h-4 w-4" aria-hidden />}
                disabled={saving}
                onClick={() => {
                  setDraft(toDraft(saved));
                  setSaveError(null);
                }}
              >
                Discard
              </Button>
              <Button variant="primary" icon={<Save className="h-4 w-4" aria-hidden />} loading={saving} disabled={hasErrors} onClick={requestSave}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmMaintenance}
        onClose={() => setConfirmMaintenance(false)}
        onConfirm={() => void save()}
        loading={saving}
        title="Turn on maintenance mode?"
        description="Everyone except admins will be locked out of the platform right away — including applicants partway through an application and agents working their queue."
        confirmLabel="Turn on maintenance"
      />
    </PageContainer>
  );
}

function ToggleRow({
  label,
  description,
  note,
  badge,
  checked,
  changed,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  note?: string;
  badge?: ReactNode;
  checked: boolean;
  changed: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <li className="flex items-start justify-between gap-6 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span id={id} className="text-sm font-medium text-gray-900">
            {label}
          </span>
          {badge}
          {changed && <Badge tone="indigo">Unsaved</Badge>}
        </div>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
        {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} labelledBy={id} className="mt-0.5" />
    </li>
  );
}

function NumberField({
  id,
  label,
  unit,
  value,
  limits,
  error,
  hint,
  changed,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  limits: { min: number; max: number };
  error?: string | null;
  hint?: string;
  changed: boolean;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Field
      label={
        <span className="flex items-center gap-2">
          {label}
          {changed && <Badge tone="indigo">Unsaved</Badge>}
        </span>
      }
      htmlFor={id}
      error={error}
      hint={hint}
    >
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={limits.min}
          max={limits.max}
          step={1}
          value={value}
          invalid={Boolean(error)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="pr-20"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">{unit}</span>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Allowed: {limits.min}–{limits.max}
      </p>
    </Field>
  );
}
