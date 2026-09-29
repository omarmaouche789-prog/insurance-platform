"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationDTO, HealthInfoDTO, PlanDTO } from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { useAuth } from "../../lib/auth-context";
import { apiFetch, ApiError, describeApiError } from "../../lib/api";
import { clearDraft, loadDraft, saveDraft } from "../../lib/enrollment-draft";
import { ENROLLMENT_STEPS, ProgressSteps } from "./ProgressSteps";
import { PersonalStep, type PersonalValues } from "./PersonalStep";
import { HealthStep } from "./HealthStep";
import { DocumentsStep } from "./DocumentsStep";
import { ReviewStep } from "./ReviewStep";
import { SubmitStep } from "./SubmitStep";

const EMPTY_HEALTH: HealthInfoDTO = { conditions: [], otherConditions: "", preferredDoctors: [] };

interface EnrollmentWizardProps {
  planId: string;
  // Set when resuming a saved draft from the dashboard.
  resumeApplicationId: string | null;
}

export function EnrollmentWizard({ planId, resumeApplicationId }: EnrollmentWizardProps) {
  const { user, accessToken } = useAuth();
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [step, setStep] = useState(1);
  const [personal, setPersonal] = useState<PersonalValues>({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    zipCode: "",
    ssn: "",
  });
  const [healthInfo, setHealthInfo] = useState<HealthInfoDTO>(EMPTY_HEALTH);
  const [application, setApplication] = useState<ApplicationDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const restoreStarted = useRef(false);

  const goToConfirmation = useCallback(
    (id: string) => {
      clearDraft(planId);
      router.replace(`/account/enroll/success?id=${encodeURIComponent(id)}`);
    },
    [planId, router],
  );

  // Restore: session draft first, then the server copy of the application
  // (the source of truth once one exists).
  useEffect(() => {
    // Run once: a later auth refresh must not reset the wizard mid-flow.
    if (!accessToken || !user || restoreStarted.current) return;
    restoreStarted.current = true;

    async function restore() {
      const draft = loadDraft(planId);
      const applicationId = resumeApplicationId ?? draft?.applicationId ?? null;

      if (applicationId) {
        const res = await apiFetch<{ application: ApplicationDTO }>(`/api/applications/${applicationId}`, { accessToken: accessToken! });
        const app = res.application;
        if (app.status !== "DRAFT") {
          goToConfirmation(app.id);
          return;
        }
        setApplication(app);
        setPlan(app.plan);
        setPersonal({ ...app.personal, zipCode: app.personal.zipCode ?? "", ssn: "" });
        setHealthInfo(app.healthInfo ?? EMPTY_HEALTH);
        const resumeStep = Math.max(draft?.step ?? 3, 3);
        setStep(resumeStep);
      } else {
        const res = await apiFetch<{ plan: PlanDTO }>(`/api/plans/${encodeURIComponent(planId)}`);
        setPlan(res.plan);
        setPersonal({
          firstName: draft?.personal.firstName ?? user!.firstName,
          lastName: draft?.personal.lastName ?? user!.lastName,
          dateOfBirth: draft?.personal.dateOfBirth ?? "",
          zipCode: draft?.personal.zipCode ?? "",
          ssn: "",
        });
        setHealthInfo(draft?.healthInfo ?? EMPTY_HEALTH);
        // Without a saved application, only the first two steps can be restored.
        const resumeStep = Math.min(draft?.step ?? 1, 2);
        setStep(resumeStep);
      }
      setReady(true);
    }

    restore().catch((err) => setLoadError(describeApiError(err, "Couldn't load your application")));
  }, [accessToken, user, planId, resumeApplicationId, goToConfirmation]);

  // Persist progress on every change (minus the SSN — see enrollment-draft.ts).
  useEffect(() => {
    if (!ready) return;
    saveDraft({
      version: 1,
      planId,
      step,
      applicationId: application?.id ?? null,
      personal: {
        firstName: personal.firstName,
        lastName: personal.lastName,
        dateOfBirth: personal.dateOfBirth,
        zipCode: personal.zipCode,
      },
      healthInfo,
    });
  }, [
    ready,
    planId,
    step,
    application?.id,
    personal.firstName,
    personal.lastName,
    personal.dateOfBirth,
    personal.zipCode,
    healthInfo,
  ]);

  function goTo(next: number) {
    setStepError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  // Step 2 → 3: create the application, or update it if it already exists.
  async function saveApplication(health: HealthInfoDTO) {
    setBusy(true);
    setStepError(null);
    try {
      const body = { personal: { ...personal, ssn: personal.ssn || undefined }, healthInfo: health };
      const res = application
        ? await apiFetch<{ application: ApplicationDTO }>(`/api/applications/${application.id}`, {
            method: "PUT",
            body: JSON.stringify(body),
            accessToken: accessToken!,
          })
        : await apiFetch<{ application: ApplicationDTO }>("/api/applications", {
            method: "POST",
            body: JSON.stringify({ ...body, planId }),
            accessToken: accessToken!,
          });
      setApplication(res.application);
      // The API now holds the SSN; drop it from memory.
      setPersonal((p) => ({ ...p, ssn: "" }));
      goTo(3);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && application) {
        goToConfirmation(application.id);
        return;
      }
      setStepError(describeApiError(err, "Couldn't save your application"));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!application) return;
    setBusy(true);
    setStepError(null);
    try {
      const res = await apiFetch<{ application: ApplicationDTO }>(`/api/applications/${application.id}/submit`, {
        method: "POST",
        accessToken: accessToken!,
      });
      goToConfirmation(res.application.id);
    } catch (err) {
      setStepError(describeApiError(err, "Submission failed"));
      // Pick up the FAILED status/message the API recorded.
      apiFetch<{ application: ApplicationDTO }>(`/api/applications/${application.id}`, { accessToken: accessToken! })
        .then((res) => setApplication(res.application))
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!ready || !plan) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Enrolling in</p>
          <h1 className="text-xl font-semibold">{plan.name}</h1>
        </div>
        <p className="text-sm text-gray-600">{formatCents(plan.monthlyPremiumCents)}/month</p>
      </div>

      <ProgressSteps current={step} onSelect={goTo} />

      <section className="rounded border border-gray-200 bg-gray-50 p-6">
        <h2 className="mb-4 font-semibold">
          Step {step} of {ENROLLMENT_STEPS.length}: {ENROLLMENT_STEPS[step - 1]}
        </h2>

        {step === 1 && (
          <PersonalStep
            values={personal}
            ssnLast4OnFile={application?.personal.ssnLast4 ?? null}
            onChange={setPersonal}
            onNext={() => goTo(2)}
          />
        )}
        {step === 2 && (
          <HealthStep
            values={healthInfo}
            saving={busy}
            error={stepError}
            onChange={setHealthInfo}
            onBack={() => goTo(1)}
            onNext={saveApplication}
          />
        )}
        {step === 3 && application && (
          <DocumentsStep
            application={application}
            accessToken={accessToken!}
            onUploaded={setApplication}
            onBack={() => goTo(2)}
            onNext={() => goTo(4)}
          />
        )}
        {step === 4 && application && (
          <ReviewStep application={application} onEdit={goTo} onBack={() => goTo(3)} onNext={() => goTo(5)} />
        )}
        {step === 5 && application && (
          <SubmitStep application={application} submitting={busy} error={stepError} onBack={() => goTo(4)} onSubmit={submit} />
        )}
      </section>

      <p className="text-xs text-gray-500">
        Progress is saved automatically in this browser tab. Your SSN is never saved in the browser.
      </p>
    </div>
  );
}
