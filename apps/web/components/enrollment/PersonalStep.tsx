"use client";

import { useState } from "react";

export interface PersonalValues {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  zipCode: string;
  ssn: string;
}

interface PersonalStepProps {
  values: PersonalValues;
  // Last 4 of the SSN already saved server-side; when set the SSN field is optional.
  ssnLast4OnFile: string | null;
  onChange: (values: PersonalValues) => void;
  onNext: () => void;
}

const SSN_PATTERN = /^\d{3}-?\d{2}-?\d{4}$/;
const inputClass = "mt-1 w-full rounded border border-gray-300 px-3 py-2";

// Formats as the user types: 123456789 → 123-45-6789
function formatSsn(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export function PersonalStep({ values, ssnLast4OnFile, onChange, onNext }: PersonalStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [showSsn, setShowSsn] = useState(false);
  const set = (field: keyof PersonalValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({
      ...values,
      [field]:
        field === "ssn" ? formatSsn(e.target.value) : field === "zipCode" ? e.target.value.replace(/\D/g, "").slice(0, 5) : e.target.value,
    });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (values.ssn ? !SSN_PATTERN.test(values.ssn) : !ssnLast4OnFile) {
      setError("Enter a 9-digit Social Security number.");
      return;
    }
    if (values.dateOfBirth >= new Date().toISOString().slice(0, 10)) {
      setError("Date of birth must be in the past.");
      return;
    }
    setError(null);
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          First name
          <input className={inputClass} value={values.firstName} onChange={set("firstName")} required maxLength={100} />
        </label>
        <label className="block text-sm">
          Last name
          <input className={inputClass} value={values.lastName} onChange={set("lastName")} required maxLength={100} />
        </label>
      </div>
      <label className="block text-sm">
        Home ZIP code
        <input
          className={inputClass}
          value={values.zipCode}
          onChange={set("zipCode")}
          inputMode="numeric"
          autoComplete="postal-code"
          pattern="\d{5}"
          title="5-digit ZIP code"
          required
        />
        <span className="mt-1 block text-xs text-gray-500">Must be in the plan&apos;s coverage area.</span>
      </label>
      <label className="block text-sm">
        Date of birth
        <input
          type="date"
          className={inputClass}
          value={values.dateOfBirth}
          onChange={set("dateOfBirth")}
          max={new Date().toISOString().slice(0, 10)}
          required
        />
      </label>
      <label className="block text-sm">
        Social Security number
        <div className="mt-1 flex gap-2">
          <input
            type={showSsn ? "text" : "password"}
            className="w-full rounded border border-gray-300 px-3 py-2 tabular-nums"
            value={values.ssn}
            onChange={set("ssn")}
            inputMode="numeric"
            autoComplete="off"
            placeholder={ssnLast4OnFile ? `On file: •••-••-${ssnLast4OnFile}` : "123-45-6789"}
            required={!ssnLast4OnFile}
          />
          <button type="button" onClick={() => setShowSsn((s) => !s)} className="text-sm text-gray-600 hover:underline">
            {showSsn ? "Hide" : "Show"}
          </button>
        </div>
        <span className="mt-1 block text-xs text-gray-500">
          {ssnLast4OnFile
            ? "Leave blank to keep the number on file."
            : "Required by carriers to verify identity. Stored encrypted and never shown in full."}
        </span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-white">
          Continue
        </button>
      </div>
    </form>
  );
}
