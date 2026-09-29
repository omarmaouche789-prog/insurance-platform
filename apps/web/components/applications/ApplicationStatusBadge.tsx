import type { ApplicationStatus, SubmissionStatus } from "@insurance/shared";

// One badge combining our workflow status with the carrier's response.
function describe(status: ApplicationStatus, submission: SubmissionStatus): { label: string; className: string } {
  if (status === "DRAFT") {
    if (submission === "FAILED") return { label: "Submission failed", className: "bg-red-100 text-red-800" };
    if (submission === "PENDING") return { label: "Submitting", className: "bg-blue-100 text-blue-800" };
    return { label: "Draft", className: "bg-gray-100 text-gray-700" };
  }
  if (status === "APPROVED") return { label: "Approved", className: "bg-green-100 text-green-800" };
  if (status === "REJECTED") {
    if (submission === "FAILED") return { label: "Resubmission failed", className: "bg-red-100 text-red-800" };
    if (submission === "PENDING") return { label: "Resubmitting", className: "bg-blue-100 text-blue-800" };
    // An admin rejection leaves the carrier's ACCEPTED on record.
    if (submission === "ACCEPTED") return { label: "Not approved", className: "bg-red-100 text-red-800" };
    return { label: "Rejected by carrier", className: "bg-red-100 text-red-800" };
  }
  return { label: "Awaiting review", className: "bg-blue-100 text-blue-800" };
}

export function ApplicationStatusBadge({ status, submissionStatus }: { status: ApplicationStatus; submissionStatus: SubmissionStatus }) {
  const { label, className } = describe(status, submissionStatus);
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
