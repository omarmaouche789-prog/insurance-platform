"use client";

import type { ReactNode } from "react";
import { ToggleLeft } from "lucide-react";
import { canEditSystemSettings } from "@insurance/shared";
import { useAuth } from "../lib/auth-context";
import { useSiteSettings } from "../lib/site-settings";
import { ButtonLink } from "./ui/Button";
import { Card } from "./ui/Card";
import { PageContainer } from "./ui/PageHeader";
import { EmptyState, LoadingState } from "./ui/States";

// Shows a section only while its feature is on in System Settings. Waits
// for the live settings so a switched-off page never fires its API calls.
export function FeatureGate({ feature, name, children }: { feature: "analytics" | "blog"; name: string; children: ReactNode }) {
  const { status, loaded } = useSiteSettings();
  const { user } = useAuth();
  if (!loaded) return <LoadingState />;
  if (status.features[feature]) return <>{children}</>;
  return (
    <PageContainer>
      <Card>
        <EmptyState
          icon={<ToggleLeft className="h-5 w-5" aria-hidden />}
          title={`${name} is turned off`}
          description={`An administrator switched off ${name.toLowerCase()} in System settings.`}
          action={
            canEditSystemSettings(user?.adminRole ?? null) ? (
              <ButtonLink href="/admin/settings?tab=features" variant="navy">
                Open feature settings
              </ButtonLink>
            ) : undefined
          }
        />
      </Card>
    </PageContainer>
  );
}
