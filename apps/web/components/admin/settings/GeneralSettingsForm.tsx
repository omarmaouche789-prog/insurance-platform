"use client";

import { useMemo, useState } from "react";
import { Building2, ImageOff, Save, ShieldPlus, Undo2 } from "lucide-react";
import type { SettingsSectionMeta, SystemSettingsDTO, SystemSettingsResponseDTO } from "@insurance/shared";
import { isValidEmail, isValidLogoUrl, isValidPhone, SETTINGS_LIMITS } from "@insurance/shared";
import { Button } from "../../ui/Button";
import { Card, CardBody, CardHeader } from "../../ui/Card";
import { Field, Input } from "../../ui/Field";
import { LastChanged } from "./LastChanged";
import { useSettingsSave } from "./useSettingsSave";

type General = SystemSettingsDTO["general"];

function validate(v: General): Partial<Record<keyof General, string>> {
  const e: Partial<Record<keyof General, string>> = {};
  const req = (k: keyof General, label: string) => {
    if (!v[k].trim()) e[k] = `${label} is required`;
    else if (v[k].length > SETTINGS_LIMITS.nameMax && k !== "logoUrl") e[k] = `${label} can be at most ${SETTINGS_LIMITS.nameMax} characters`;
  };
  req("companyName", "Company name");
  req("platformName", "Platform name");
  req("supportEmail", "Support email");
  req("supportPhone", "Support phone");
  if (!e.supportEmail && !isValidEmail(v.supportEmail.trim())) e.supportEmail = "Enter a valid email address, e.g. support@yourcompany.com";
  if (!e.supportPhone && !isValidPhone(v.supportPhone.trim())) e.supportPhone = "Enter a valid phone number, e.g. +1 (800) 555-0100";
  if (!isValidLogoUrl(v.logoUrl.trim())) e.logoUrl = "Enter a full URL starting with https://, or leave it empty";
  return e;
}

export function GeneralSettingsForm({
  values,
  meta,
  canEdit,
  onSaved,
}: {
  values: General;
  meta: SettingsSectionMeta;
  canEdit: boolean;
  onSaved: (res: SystemSettingsResponseDTO) => void;
}) {
  const [draft, setDraft] = useState<General>(values);
  const [touched, setTouched] = useState(false);
  const [logoBroken, setLogoBroken] = useState<string | null>(null);
  const { save, busy } = useSettingsSave(onSaved);

  const errors = useMemo(() => validate(draft), [draft]);
  const invalid = Object.keys(errors).length > 0;
  const dirty = (Object.keys(values) as Array<keyof General>).some((k) => draft[k] !== values[k]);
  const show = (k: keyof General) => (touched || draft[k] !== values[k] ? errors[k] : undefined);
  const set = (k: keyof General) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const disabled = !canEdit || busy !== null;
  const logo = draft.logoUrl.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (invalid || !dirty) return;
    const body = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()]));
    await save("general", "/general", "PUT", body, "Settings saved");
  }

  return (
    <Card>
      <CardHeader icon={<Building2 className="h-5 w-5" />} title="General settings" description="Your company details, shown in the header, footer and support links." />
      <form onSubmit={submit} noValidate>
        <CardBody className="grid gap-5 md:grid-cols-2">
          <Field label="Company name" htmlFor="companyName" required error={show("companyName")}>
            <Input id="companyName" value={draft.companyName} onChange={set("companyName")} disabled={disabled} invalid={Boolean(show("companyName"))} maxLength={SETTINGS_LIMITS.nameMax} />
          </Field>
          <Field label="Platform name" htmlFor="platformName" required error={show("platformName")} hint="Shown next to the logo in the header.">
            <Input id="platformName" value={draft.platformName} onChange={set("platformName")} disabled={disabled} invalid={Boolean(show("platformName"))} maxLength={SETTINGS_LIMITS.nameMax} />
          </Field>
          <Field label="Support email" htmlFor="supportEmail" required error={show("supportEmail")}>
            <Input id="supportEmail" type="email" autoComplete="off" value={draft.supportEmail} onChange={set("supportEmail")} disabled={disabled} invalid={Boolean(show("supportEmail"))} />
          </Field>
          <Field label="Support phone" htmlFor="supportPhone" required error={show("supportPhone")}>
            <Input id="supportPhone" type="tel" value={draft.supportPhone} onChange={set("supportPhone")} disabled={disabled} invalid={Boolean(show("supportPhone"))} />
          </Field>
          <div className="md:col-span-2 grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
            <Field label="Logo URL" htmlFor="logoUrl" error={show("logoUrl")} hint="Optional. A PNG or SVG on https, ideally about 28 px tall. Leave empty to use the built-in mark.">
              <Input id="logoUrl" type="url" placeholder="https://" value={draft.logoUrl} onChange={set("logoUrl")} disabled={disabled} invalid={Boolean(show("logoUrl"))} />
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium text-gray-700">Header preview</p>
              <div className="flex h-[38px] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3">
                {logo && !errors.logoUrl && logoBroken !== logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="Logo preview" className="h-6 max-w-[90px] object-contain" onError={() => setLogoBroken(logo)} />
                ) : logo && logoBroken === logo ? (
                  <ImageOff className="h-5 w-5 text-red-500" aria-label="The image couldn't be loaded" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-navy text-onaccent">
                    <ShieldPlus className="h-3.5 w-3.5" aria-hidden />
                  </span>
                )}
                <span className="truncate text-sm font-semibold text-gray-900">{draft.platformName || "Platform name"}</span>
              </div>
              {logo && logoBroken === logo && <p className="mt-1.5 text-xs text-red-600">This image couldn&apos;t be loaded. Check the URL.</p>}
            </div>
          </div>
        </CardBody>
        <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <LastChanged meta={meta} />
          {canEdit && (
            <div className="flex gap-2">
              {dirty && (
                <Button icon={<Undo2 className="h-4 w-4" aria-hidden />} disabled={busy !== null} onClick={() => { setDraft(values); setTouched(false); }}>
                  Discard
                </Button>
              )}
              <Button type="submit" variant="navy" icon={<Save className="h-4 w-4" aria-hidden />} loading={busy === "general"} disabled={!dirty || busy !== null}>
                Save changes
              </Button>
            </div>
          )}
        </div>
      </form>
    </Card>
  );
}
