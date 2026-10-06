import { redirect } from "next/navigation";

// The applications list lives at /account; this keeps /account/applications
// (a natural URL to type or bookmark) from 404ing.
export default function ApplicationsIndexPage() {
  redirect("/account");
}
