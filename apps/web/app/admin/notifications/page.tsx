"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { EmailTemplatesTab } from "../../../components/admin/notifications/EmailTemplatesTab";
import { SmsTemplatesTab } from "../../../components/admin/notifications/SmsTemplatesTab";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { FilterTabs } from "../../../components/ui/Tabs";

type Tab = "email" | "sms";

export default function AdminNotificationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>("email");

  // The tab lives in ?tab= so links and reloads land on the same one. Read
  // after mount so the page builds statically without a Suspense boundary.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "sms") setTab("sms");
  }, []);

  function changeTab(next: Tab) {
    setTab(next);
    router.replace(next === "email" ? pathname : `${pathname}?tab=sms`, { scroll: false });
  }

  return (
    <PageContainer wide>
      <PageHeader title="Notifications" description="The emails and text messages the platform sends to applicants, agents and staff." />
      <div className="mb-5">
        <FilterTabs<Tab>
          label="Notification channel"
          value={tab}
          onChange={changeTab}
          tabs={[
            { value: "email", label: "Email templates" },
            { value: "sms", label: "SMS templates" },
          ]}
        />
      </div>
      {tab === "email" ? <EmailTemplatesTab /> : <SmsTemplatesTab />}
    </PageContainer>
  );
}
