"use client";

import { useId, useState } from "react";
import { Construction, Eye, Loader2, Save, Undo2 } from "lucide-react";
import type { SettingsSectionMeta, SystemSettingsDTO, SystemSettingsResponseDTO } from "@insurance/shared";
import { DEFAULT_MAINTENANCE_MESSAGE, SETTINGS_LIMITS } from "@insurance/shared";
import { MaintenanceOverlay } from "../../MaintenanceGate";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card, CardBody, CardHeader } from "../../ui/Card";
import { CharCount, Field, Textarea } from "../../ui/Field";
import { ConfirmDialog } from "../../ui/Modal";
import { Alert } from "../../ui/States";
import { Switch } from "../../ui/Switch";
import { LastChanged } from "./LastChanged";
import { useSettingsSave } from "./useSettingsSave";

export function MaintenanceModePanel({
  values,
  meta,
  canEdit,
  onSaved,
}: {
  values: SystemSettingsDTO["maintenance"];
  meta: SettingsSectionMeta;
  canEdit: boolean;
  onSaved: (res: SystemSettingsResponseDTO) => void;
}) {
  const labelId = useId();
  const [message, setMessage] = useState(values.maintenanceMessage);
  const [confirmOn, setConfirmOn] = useState(false);
  const { save, busy } = useSettingsSave(onSaved);

  const trimmed = message.trim();
  const tooLong = message.length > SETTINGS_LIMITS.maintenanceMessageMax;
  const messageError = tooLong ? `Keep the message under ${SETTINGS_LIMITS.maintenanceMessageMax} characters` : !trimmed ? "Write the message users will see" : null;
  const dirty = message !== values.maintenanceMessage;
  const disabled = !canEdit || busy !== null;

  async function turnOn() {
    // Saves the message as it reads now, together with the switch.
    const ok = await save("mode", "/maintenance", "PUT", { maintenanceMode: true, maintenanceMessage: trimmed }, "Maintenance mode is on. Only admins can use the platform.");
    if (ok) setConfirmOn(false);
  }

  return (
    <div className="space-y-5">
      {values.maintenanceMode && (
        <Alert tone="amber">
          <strong className="font-semibold">Maintenance mode is on.</strong> Applicants, agents and visitors see the message below instead of the app.
        </Alert>
      )}

      <Card>
        <CardHeader icon={<Construction className="h-5 w-5" />} title="Maintenance mode" description="Take the platform offline for everyone except admins." />
        <div className="flex items-start justify-between gap-6 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span id={labelId} className="text-sm font-medium text-gray-900">
                Maintenance mode
              </span>
              {values.maintenanceMode ? <Badge tone="amber" dot>On — platform offline</Badge> : <Badge tone="green" dot>Off — normal operation</Badge>}
            </div>
            <p className="mt-1 text-sm text-gray-600">
              When on, every non-admin sees a full-page message and the API refuses their requests. Admins keep full access, and the sign-in page stays
              open so admins can get in.
            </p>
          </div>
          <span className="mt-0.5 flex items-center gap-2">
            {busy === "mode" && <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label="Saving" />}
            <Switch
              checked={values.maintenanceMode}
              disabled={disabled || (!values.maintenanceMode && Boolean(messageError))}
              labelledBy={labelId}
              onChange={(next) =>
                next ? setConfirmOn(true) : void save("mode", "/maintenance/maintenanceMode", "PUT", { value: false }, "Maintenance mode is off. The platform is back online.")
              }
            />
          </span>
        </div>
        <CardBody className="space-y-3 border-t border-gray-100">
          <Field
            label={
              <span className="flex items-center justify-between">
                <span>Maintenance message</span>
                <CharCount value={message} max={SETTINGS_LIMITS.maintenanceMessageMax} />
              </span>
            }
            htmlFor="maintenanceMessage"
            error={messageError}
            hint="Shown to everyone who isn't an admin while maintenance mode is on. Line breaks are kept."
          >
            <Textarea id="maintenanceMessage" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} disabled={disabled} />
          </Field>
          {canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs font-medium text-primary-navy hover:underline disabled:opacity-50 dark:text-[#7da3d8]"
                disabled={disabled || message === DEFAULT_MAINTENANCE_MESSAGE}
                onClick={() => setMessage(DEFAULT_MAINTENANCE_MESSAGE)}
              >
                Use the default message
              </button>
              <div className="flex gap-2">
                {dirty && (
                  <Button icon={<Undo2 className="h-4 w-4" aria-hidden />} disabled={busy !== null} onClick={() => setMessage(values.maintenanceMessage)}>
                    Discard
                  </Button>
                )}
                <Button
                  variant="navy"
                  icon={<Save className="h-4 w-4" aria-hidden />}
                  loading={busy === "message"}
                  disabled={!dirty || Boolean(messageError) || busy !== null}
                  onClick={() => void save("message", "/maintenance/maintenanceMessage", "PUT", { value: trimmed }, "Maintenance message saved")}
                >
                  Save message
                </Button>
              </div>
            </div>
          )}
        </CardBody>
        <div className="border-t border-gray-100 px-5 py-3">
          <LastChanged meta={meta} />
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Eye className="h-5 w-5" />} title="Preview" description="What visitors see while maintenance mode is on. Updates as you type." />
        <div className="overflow-hidden rounded-b-xl">
          <MaintenanceOverlay message={message} preview />
        </div>
      </Card>

      <ConfirmDialog
        open={confirmOn}
        onClose={() => setConfirmOn(false)}
        onConfirm={() => void turnOn()}
        loading={busy === "mode"}
        title="Turn on maintenance mode?"
        description="Everyone except admins is locked out right away, including applicants partway through an application and agents working their queue."
        confirmLabel="Turn on maintenance"
      >
        {dirty && <p className="text-sm text-gray-600">Your edited message will be saved and shown.</p>}
      </ConfirmDialog>
    </div>
  );
}
