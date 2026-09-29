"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EnrollmentWizard } from "../../../components/enrollment/EnrollmentWizard";

function Enroll() {
  const params = useSearchParams();
  const planId = params.get("planId");

  if (!planId) {
    return (
      <p className="text-sm text-gray-600">
        Choose a plan to enroll in first.{" "}
        <Link href="/plans" className="underline">
          Browse plans
        </Link>
      </p>
    );
  }

  // Keyed so switching plans starts a fresh wizard instead of reusing state.
  return <EnrollmentWizard key={planId} planId={planId} resumeApplicationId={params.get("applicationId")} />;
}

export default function EnrollPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Suspense fallback={<p className="text-sm text-gray-500">Loading...</p>}>
        <Enroll />
      </Suspense>
    </div>
  );
}
