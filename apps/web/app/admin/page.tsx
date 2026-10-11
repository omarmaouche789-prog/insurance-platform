"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSiteSettings } from "../../lib/site-settings";
import { LoadingState } from "../../components/ui/States";

// The admin home is the analytics dashboard, or the review queue when
// analytics is switched off in System settings.
export default function AdminHomePage() {
  const router = useRouter();
  const { status, loaded } = useSiteSettings();
  useEffect(() => {
    if (loaded) router.replace(status.features.analytics ? "/admin/analytics" : "/admin/applications/pending");
  }, [loaded, status.features.analytics, router]);
  return <LoadingState />;
}
