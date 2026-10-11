"use client";

import { useMemo, useState } from "react";
import { Globe2, Save, Undo2 } from "lucide-react";
import type { DateFormat, LanguageCode, SettingsSectionMeta, SystemSettingsDTO, SystemSettingsResponseDTO, TimeFormat, TimezoneCode } from "@insurance/shared";
import { DATE_FORMATS, LANGUAGES, TIME_FORMATS, TIMEZONE_CODES, TIMEZONES } from "@insurance/shared";
import { previewDateTime } from "../../../lib/format";
import { Button } from "../../ui/Button";
import { Card, CardBody, CardHeader } from "../../ui/Card";
import { Field, Select } from "../../ui/Field";
import { LastChanged } from "./LastChanged";
import { useSettingsSave } from "./useSettingsSave";

type Localization = SystemSettingsDTO["localization"];

export function LocalizationForm({
  values,
  meta,
  canEdit,
  onSaved,
}: {
  values: Localization;
  meta: SettingsSectionMeta;
  canEdit: boolean;
  onSaved: (res: SystemSettingsResponseDTO) => void;
}) {
  const [draft, setDraft] = useState<Localization>(values);
  const { save, busy } = useSettingsSave(onSaved);
  const dirty = (Object.keys(values) as Array<keyof Localization>).some((k) => draft[k] !== values[k]);
  const disabled = !canEdit || busy !== null;
  // Fixed so the example doesn't tick while the admin is choosing.
  const [sampleAt] = useState(() => new Date());
  const example = useMemo(() => previewDateTime(draft, sampleAt), [draft, sampleAt]);

  return (
    <Card>
      <CardHeader icon={<Globe2 className="h-5 w-5" />} title="Localization & timezone" description="How dates and times are shown across the platform, for every user." />
      <CardBody className="grid gap-5 md:grid-cols-2">
        <Field label="System default timezone" htmlFor="timezone" hint="All dates and times are shown in this timezone. Daylight saving is handled automatically.">
          <Select id="timezone" value={draft.timezone} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value as TimezoneCode }))}>
            {TIMEZONE_CODES.map((tz) => (
              <option key={tz} value={tz}>
                {TIMEZONES[tz].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="System default language" htmlFor="language" hint="The platform is English-only for now.">
          <Select id="language" value={draft.language} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value as LanguageCode }))}>
            {(Object.keys(LANGUAGES) as LanguageCode[]).map((l) => (
              <option key={l} value={l} disabled={!LANGUAGES[l].available}>
                {LANGUAGES[l].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date format" htmlFor="dateFormat">
          <Select id="dateFormat" value={draft.dateFormat} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, dateFormat: e.target.value as DateFormat }))}>
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Time format" htmlFor="timeFormat">
          <Select id="timeFormat" value={draft.timeFormat} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, timeFormat: e.target.value as TimeFormat }))}>
            {(Object.keys(TIME_FORMATS) as TimeFormat[]).map((f) => (
              <option key={f} value={f}>
                {TIME_FORMATS[f]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 md:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Example</p>
          <p className="mt-1 text-sm text-gray-900">
            Right now is shown as <span className="font-mono font-semibold">{example}</span> ({draft.timezone})
          </p>
        </div>
      </CardBody>
      <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <LastChanged meta={meta} />
        {canEdit && (
          <div className="flex gap-2">
            {dirty && (
              <Button icon={<Undo2 className="h-4 w-4" aria-hidden />} disabled={busy !== null} onClick={() => setDraft(values)}>
                Discard
              </Button>
            )}
            <Button
              variant="navy"
              icon={<Save className="h-4 w-4" aria-hidden />}
              loading={busy === "localization"}
              disabled={!dirty || busy !== null}
              onClick={() => void save("localization", "/localization", "PUT", draft, "Localization settings saved")}
            >
              Save changes
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
