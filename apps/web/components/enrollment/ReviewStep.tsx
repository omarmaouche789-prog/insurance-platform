import type { ApplicationDTO } from "@insurance/shared";
import { DOCUMENT_TYPE_LABELS, HEALTH_CONDITION_LABELS, formatCents } from "@insurance/shared";

interface ReviewStepProps {
  application: ApplicationDTO;
  onEdit: (step: number) => void;
  onBack: () => void;
  onNext: () => void;
}

function Section({ title, step, onEdit, children }: { title: string; step: number; onEdit: (step: number) => void; children: React.ReactNode }) {
  return (
    <section className="rounded border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button type="button" onClick={() => onEdit(step)} className="text-sm text-gray-600 hover:underline">
          Edit
        </button>
      </div>
      <dl className="divide-y divide-gray-100 text-sm">{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export function ReviewStep({ application: app, onEdit, onBack, onNext }: ReviewStepProps) {
  const health = app.healthInfo;
  const conditions = [
    ...(health?.conditions.map((c) => HEALTH_CONDITION_LABELS[c]) ?? []),
    ...(health?.otherConditions ? [health.otherConditions] : []),
  ];

  return (
    <div className="space-y-4">
      <section className="rounded border border-gray-200 bg-white px-4 py-3 text-sm">
        <p className="text-xs uppercase tracking-wide text-gray-500">{app.plan.carrier.name}</p>
        <p className="font-semibold">{app.plan.name}</p>
        <p className="text-gray-600">
          {formatCents(app.plan.monthlyPremiumCents)}/month · {formatCents(app.plan.deductibleCents)} deductible
        </p>
      </section>

      <Section title="Personal details" step={1} onEdit={onEdit}>
        <Row label="Name">
          {app.personal.firstName} {app.personal.lastName}
        </Row>
        <Row label="Date of birth">{app.personal.dateOfBirth}</Row>
        <Row label="ZIP code">{app.personal.zipCode ?? "—"}</Row>
        <Row label="SSN">•••-••-{app.personal.ssnLast4}</Row>
      </Section>

      <Section title="Health info" step={2} onEdit={onEdit}>
        <Row label="Conditions">{conditions.length ? conditions.join(", ") : "None reported"}</Row>
        <Row label="Preferred doctors">
          {health?.preferredDoctors.length
            ? health.preferredDoctors.map((d) => (d.specialty ? `${d.name} (${d.specialty})` : d.name)).join(", ")
            : "None"}
        </Row>
      </Section>

      <Section title="Documents" step={3} onEdit={onEdit}>
        {app.documents.map((d) => (
          <Row key={d.id} label={DOCUMENT_TYPE_LABELS[d.type]}>
            {d.fileName}
          </Row>
        ))}
      </Section>

      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="text-sm text-gray-600 hover:underline">
          ← Back
        </button>
        <button type="button" onClick={onNext} className="rounded bg-gray-900 px-4 py-2 text-white">
          Looks good
        </button>
      </div>
    </div>
  );
}
