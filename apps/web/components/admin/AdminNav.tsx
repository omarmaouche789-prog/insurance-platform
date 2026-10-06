"use client";

import { BarChart3, Briefcase, FileCheck2, Mail, Newspaper, Settings, ShieldCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Messages } from "../../lib/i18n/en";
import { PortalNav } from "../PortalNav";

type NavKey = Exclude<keyof Messages["adminNav"], "label">;

const LINKS: { href: string; key: NavKey; icon: LucideIcon; match?: string }[] = [
  { href: "/admin/analytics", key: "analytics", icon: BarChart3 },
  { href: "/admin/applications/pending", key: "applications", icon: FileCheck2, match: "/admin/applications" },
  { href: "/admin/users", key: "users", icon: Users },
  { href: "/admin/agents", key: "agents", icon: Briefcase },
  { href: "/admin/cms", key: "blog", icon: Newspaper },
  { href: "/admin/notifications", key: "notifications", icon: Mail },
  { href: "/admin/settings", key: "settings", icon: Settings },
  { href: "/admin/security", key: "security", icon: ShieldCheck },
];

export function AdminNav() {
  const { t } = useTranslation();
  return <PortalNav links={LINKS.map(({ key, ...l }) => ({ ...l, label: t(`adminNav.${key}`) }))} label={t("adminNav.label")} />;
}
