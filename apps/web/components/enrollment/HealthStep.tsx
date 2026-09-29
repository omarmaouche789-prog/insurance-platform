"use client";

import type { HealthCondition, HealthInfoDTO } from "@insurance/shared";
import { HEALTH_CONDITIONS, HEALTH_CONDITION_LABELS } from "@insurance/shared";

interface HealthStepProps {
  values: HealthInfoDTO;
  saving: boolean;
  error: string | null;
  onChange: (values: HealthInfoDTO) => void;
  onBack: () => void;
  // Receives the cleaned values so the caller saves exactly what was validated.
  onNext: (values: HealthInfoDTO) => void;
}

const MAX_DOCTORS = 10;

export function HealthStep({ values, saving, error, onChange, onBack, onNext }: HealthStepProps) {
  function toggleCondition(condition: HealthCondition) {
    const conditions = values.conditions.includes(condition)
      ? values.conditions.filter((c) => c !== condition)
      : [...values.conditions, condition];
    onChange({ ...values, conditions });
  }

  function updateDoctor(index: number, field: "name" | "specialty", value: string) {
    const preferredDoctors = values.preferredDoctors.map((d, i) => (i === index ? { ...d, [field]: value } : d));
    onChange({ ...values, preferredDoctors });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Drop rows the user added but left empty.
    const cleaned = { ...values, preferredDoctors: values.preferredDoctors.filter((d) => d.name.trim()) };
    onChange(cleaned);
    onNext(cleaned);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-sm text-gray-600">
        Under the ACA, plans can&apos;t deny coverage or charge more for pre-existing conditions. This helps your agent
        confirm the plan covers the care you need.
      </p>

      <fieldset>
        <legend className="text-sm font-medium">Do you have any of these conditions?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {HEALTH_CONDITIONS.map((condition) => (
            <label key={condition} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.conditions.includes(condition)}
                onChange={() => toggleCondition(condition)}
              />
              {HEALTH_CONDITION_LABELS[condition]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        Other conditions or ongoing treatments (optional)
        <textarea
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          rows={3}
          maxLength={1000}
          value={values.otherConditions}
          onChange={(e) => onChange({ ...values, otherConditions: e.target.value })}
        />
      </label>

      <fieldset>
        <legend className="text-sm font-medium">Doctors you&apos;d like to keep (optional)</legend>
        <div className="mt-2 space-y-2">
          {values.preferredDoctors.map((doctor, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Doctor's name"
                value={doctor.name}
                maxLength={100}
                onChange={(e) => updateDoctor(i, "name", e.target.value)}
                aria-label={`Doctor ${i + 1} name`}
              />
              <input
                className="w-40 rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Specialty"
                value={doctor.specialty}
                maxLength={100}
                onChange={(e) => updateDoctor(i, "specialty", e.target.value)}
                aria-label={`Doctor ${i + 1} specialty`}
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ ...values, preferredDoctors: values.preferredDoctors.filter((_, j) => j !== i) })
                }
                className="text-sm text-gray-500 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {values.preferredDoctors.length < MAX_DOCTORS && (
          <button
            type="button"
            onClick={() =>
              onChange({ ...values, preferredDoctors: [...values.preferredDoctors, { name: "", specialty: "" }] })
            }
            className="mt-2 text-sm text-gray-700 hover:underline"
          >
            + Add a doctor
          </button>
        )}
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="text-sm text-gray-600 hover:underline">
          ← Back
        </button>
        <button type="submit" disabled={saving} className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">
          {saving ? "Saving..." : "Save and continue"}
        </button>
      </div>
    </form>
  );
}
