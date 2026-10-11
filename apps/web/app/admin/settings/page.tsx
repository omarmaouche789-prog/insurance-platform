"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import type { SystemSettingsResponseDTO } from "@insurance/shared";
import { canEditSystemSettings } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { useApiQuery } from "../../../lib/use-api";
import { FeatureToggleList } from "../../../components/admin/settings/FeatureToggleList";
import { GeneralSettingsForm } from "../../../components/admin/settings/GeneralSettingsForm";
import { LocalizationForm } from "../../../components/admin/settings/LocalizationForm";
import { MaintenanceModePanel } from "../../../components/admin/settings/MaintenanceModePanel";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { Alert, ErrorState, LoadingState } from "../../../components/ui/States";
import { FilterTabs } from "../../../components/ui/Tabs";

type Tab = "general" | "features" | "maintenance" | "localization";
const TABS: Tab[] = ["general", "features", "maintenance", "localization"];

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const canEdit = canEditSystemSettings(user?.adminRole ?? null);
  const query = useApiQuery<SystemSettingsResponseDTO>("/api/admin/settings", "Couldn't load system settings");
  const [tab, setTab] = useState<Tab>("general");

  // The tab lives in ?tab= so links (e.g. from the maintenance banner) land on it.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && (TABS as string[]).includes(t)) setTab(t as Tab);
  }, []);

  function changeTab(next: Tab) {
    setTab(next);
    router.replace(next === "general" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }

  const onSaved = (res: SystemSettingsResponseDTO) => query.setData(res);
  const data = query.data;

  return (
    <PageContainer>
      <PageHeader title="System Settings" description="Company details, features, maintenance and localization for the whole platform." />

      <div className="mb-5">
        <FilterTabs<Tab>
          label="Settings sections"
          value={tab}
          onChange={changeTab}
          tabs={[
            { value: "general", label: "General" },
            { value: "features", label: "Feature Toggles" },
            { value: "maintenance", label: "Maintenance Mode" },
            { value: "localization", label: "Localization & Timezone" },
          ]}
        />
      </div>

      {!canEdit && (
        <div className="mb-5">
          <Alert tone="blue">
            <span className="inline-flex items-center gap-2">
              <Lock className="h-4 w-4 shrink-0" aria-hidden />
              You can view these settings. Only Super admins can change them.
            </span>
          </Alert>
        </div>
      )}

      {query.error ? (
        <Card>
          <ErrorState message={query.error} onRetry={query.reload} />
        </Card>
      ) : !data ? (
        <LoadingState label="Loading settings…" />
      ) : (
        <div role="tabpanel" aria-label={tab}>
          {tab === "general" && (
            <GeneralSettingsForm key={data.meta.general.updatedAt ?? "default"} values={data.settings.general} meta={data.meta.general} canEdit={canEdit} onSaved={onSaved} />
          )}
          {tab === "features" && (
            <FeatureToggleList
              values={data.settings.features}
              session={data.settings.session}
              meta={data.meta.features}
              sessionMeta={data.meta.session}
              canEdit={canEdit}
              onSaved={onSaved}
            />
          )}
          {tab === "maintenance" && (
            <MaintenanceModePanel key={data.meta.maintenance.updatedAt ?? "default"} values={data.settings.maintenance} meta={data.meta.maintenance} canEdit={canEdit} onSaved={onSaved} />
          )}
          {tab === "localization" && (
            <LocalizationForm key={data.meta.localization.updatedAt ?? "default"} values={data.settings.localization} meta={data.meta.localization} canEdit={canEdit} onSaved={onSaved} />
          )}
        </div>
      )}

      {data?.settings.maintenance.maintenanceMode && tab !== "maintenance" && (
        <p className="mt-5 text-sm text-gray-600">
          <Badge tone="amber" dot>Maintenance mode is on</Badge>{" "}
          <button type="button" className="font-medium text-primary-navy hover:underline dark:text-[#7da3d8]" onClick={() => changeTab("maintenance")}>
            Manage
          </button>
        </p>
      )}
    </PageContainer>
  );
}
