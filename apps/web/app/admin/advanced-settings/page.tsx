import { redirect } from "next/navigation";

// Branding and localization now live in System settings (saved to the
// database for everyone, not just this browser).
export default function AdvancedSettingsPage() {
  redirect("/admin/settings?tab=general");
}
