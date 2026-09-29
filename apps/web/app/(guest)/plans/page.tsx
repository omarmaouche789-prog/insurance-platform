import { Suspense } from "react";
import { PlanResults } from "./PlanResults";

// useSearchParams in a client component needs a Suspense boundary for `next build`.
export default function PlansPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading...</div>}>
      <PlanResults />
    </Suspense>
  );
}
