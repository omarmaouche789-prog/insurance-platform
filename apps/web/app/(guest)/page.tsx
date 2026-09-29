import { ZipSearchForm } from "../../components/plans/ZipSearchForm";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-3xl font-bold">Find the right health plan by ZIP code</h1>
      <p className="mt-4 text-gray-600">
        Compare premiums, deductibles, and copays from every carrier selling in your area. No account needed to
        browse.
      </p>
      <div className="mt-8 flex justify-center">
        <ZipSearchForm />
      </div>
      <p className="mt-3 text-xs text-gray-500">Try 90001, 94103, 10001, 11201, 78701, or 33101.</p>
    </div>
  );
}
