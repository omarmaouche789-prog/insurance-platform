"use client";

import { useEffect, useState } from "react";
import type { AdminAgentDTO, CreateAgentRequestDTO } from "@insurance/shared";
import { MAX_COMMISSION_RATE_BPS } from "@insurance/shared";
import { ApiError, apiFetch, describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { Button } from "../../ui/Button";
import { Checkbox, Field, Input } from "../../ui/Field";
import { Modal } from "../../ui/Modal";
import { Alert } from "../../ui/States";
import { RegionPicker } from "./RegionPicker";

interface FormState {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  licenseNumber: string;
  npn: string;
  licenseExpiresAt: string;
  regions: string[];
  useDefaultRate: boolean;
  ratePercent: string;
}

const empty: FormState = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  licenseNumber: "",
  npn: "",
  licenseExpiresAt: "",
  regions: [],
  useDefaultRate: true,
  ratePercent: "",
};

function fromAgent(a: AdminAgentDTO): FormState {
  return {
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
    phone: a.phone ?? "",
    licenseNumber: a.licenseNumber,
    npn: a.npn ?? "",
    licenseExpiresAt: a.licenseExpiresAt ?? "",
    regions: a.regions,
    useDefaultRate: a.commissionRateBps === null,
    ratePercent: a.commissionRateBps === null ? "" : String(a.commissionRateBps / 100),
  };
}

// Create (agent = null) or edit an agent. Create sends an invite email so the
// agent sets their own password; admins never handle it.
export function AgentFormModal({
  open,
  onClose,
  agent,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  agent: AdminAgentDTO | null;
  onSaved: (agent: AdminAgentDTO) => void;
}) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(agent ? fromAgent(agent) : empty);
    setErrors({});
    setError(null);
  }, [open, agent]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function validate(): number | null | false {
    const next: Record<string, string> = {};
    if (!agent && !/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email";
    if (!form.firstName.trim()) next.firstName = "Required";
    if (!form.lastName.trim()) next.lastName = "Required";
    if (form.licenseNumber.trim().length < 3) next.licenseNumber = "License number is required";
    if (form.npn && !/^\d{1,10}$/.test(form.npn)) next.npn = "Up to 10 digits";
    if (form.regions.length === 0) next.regions = "Pick at least one state";
    let rateBps: number | null = null;
    if (!form.useDefaultRate) {
      const pct = Number(form.ratePercent);
      if (form.ratePercent === "" || Number.isNaN(pct) || pct < 0 || pct * 100 > MAX_COMMISSION_RATE_BPS) {
        next.commissionRateBps = `Enter a rate between 0% and ${MAX_COMMISSION_RATE_BPS / 100}%`;
      } else rateBps = Math.round(pct * 100);
    }
    setErrors(next);
    return Object.keys(next).length ? false : rateBps;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rate = validate();
    if (rate === false || !accessToken) return;
    setBusy(true);
    setError(null);
    const body: Partial<CreateAgentRequestDTO> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim() || undefined,
      licenseNumber: form.licenseNumber.trim(),
      npn: form.npn.trim() || undefined,
      licenseExpiresAt: form.licenseExpiresAt || undefined,
      regions: form.regions,
      commissionRateBps: rate,
    };
    try {
      const res = await apiFetch<{ agent: AdminAgentDTO }>(agent ? `/api/admin/agents/${agent.id}` : "/api/admin/agents", {
        method: agent ? "PUT" : "POST",
        body: JSON.stringify(agent ? body : { ...body, email: form.email.trim() }),
        accessToken,
      });
      onSaved(res.agent);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v?.[0]])));
      }
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      size="lg"
      title={agent ? `Edit ${agent.firstName} ${agent.lastName}` : "Add an agent"}
      description={agent ? "Changes to regions affect new assignments only." : "We'll email them a link to set a password and finish setup."}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="agent-form" loading={busy}>
            {agent ? "Save changes" : "Create and send invite"}
          </Button>
        </>
      }
    >
      <form id="agent-form" onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</legend>
          {!agent && (
            <Field label="Work email" htmlFor="agent-email" error={errors.email} required className="sm:col-span-2">
              <Input id="agent-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} invalid={Boolean(errors.email)} data-autofocus />
            </Field>
          )}
          <Field label="First name" htmlFor="agent-first" error={errors.firstName} required>
            <Input id="agent-first" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} invalid={Boolean(errors.firstName)} />
          </Field>
          <Field label="Last name" htmlFor="agent-last" error={errors.lastName} required>
            <Input id="agent-last" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} invalid={Boolean(errors.lastName)} />
          </Field>
          <Field label="Phone" htmlFor="agent-phone" error={errors.phone}>
            <Input id="agent-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 010-2030" />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Licensing</legend>
          <Field label="License number" htmlFor="agent-license" error={errors.licenseNumber} required>
            <Input id="agent-license" value={form.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value)} invalid={Boolean(errors.licenseNumber)} />
          </Field>
          <Field label="NPN" htmlFor="agent-npn" error={errors.npn} hint="National Producer Number">
            <Input id="agent-npn" inputMode="numeric" value={form.npn} onChange={(e) => set("npn", e.target.value)} invalid={Boolean(errors.npn)} />
          </Field>
          <Field label="License expires" htmlFor="agent-expiry" error={errors.licenseExpiresAt}>
            <Input id="agent-expiry" type="date" value={form.licenseExpiresAt} onChange={(e) => set("licenseExpiresAt", e.target.value)} />
          </Field>
          <Field label="Licensed states" error={errors.regions} required className="sm:col-span-3" hint="New applications from these states are auto-assigned to this agent.">
            <RegionPicker value={form.regions} onChange={(v) => set("regions", v)} invalid={Boolean(errors.regions)} />
          </Field>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Commission</legend>
          <Checkbox checked={form.useDefaultRate} onChange={(e) => set("useDefaultRate", e.target.checked)} label="Use each carrier's default rate" />
          {!form.useDefaultRate && (
            <Field label="Rate override" htmlFor="agent-rate" error={errors.commissionRateBps} hint="Percent of annualized premium, applied to every carrier." className="mt-3 max-w-xs">
              <div className="relative">
                <Input
                  id="agent-rate"
                  inputMode="decimal"
                  value={form.ratePercent}
                  onChange={(e) => set("ratePercent", e.target.value)}
                  className="pr-8"
                  invalid={Boolean(errors.commissionRateBps)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
              </div>
            </Field>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
