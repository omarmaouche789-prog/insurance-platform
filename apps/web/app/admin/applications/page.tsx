import { redirect } from "next/navigation";

export default function AdminApplicationsIndexPage() {
  redirect("/admin/applications/pending");
}
