"use client";

import { useState } from "react";
import type { ApplicationDTO } from "@insurance/shared";

interface SubmitStepProps {
  application: ApplicationDTO;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}

export function SubmitStep({ application, submitting, error, onBack, onSubmit }: SubmitStepProps) {
  const [attested, setAttested] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (attested) onSubmit();
      }}
      className="space-y-4"
    >
      <p className="text-sm text-gray-600">
        We&apos;ll send your application to <strong>{application.plan.carrier.name}</strong>. You&apos;ll get a
        confirmation number right away; the carrier confirms coverage separately.
      </p>
      {application.submissionStatus === "FAILED" && application.carrierMessage && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Last attempt didn&apos;t go through: {application.carrierMessage}
        </p>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
        <span>
          I confirm the information in this application is true and complete to the best of my knowledge, and I
          authorize it to be shared with the insurance carrier for enrollment.
        </span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-between">
        <button type="button" onClick={onBack} disabled={submitting} className="text-sm text-gray-600 hover:underline">
          ← Back
        </button>
        <button
          type="submit"
          disabled={!attested || submitting}
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Submitting to carrier..." : "Submit application"}
        </button>
      </div>
    </form>
  );
}
