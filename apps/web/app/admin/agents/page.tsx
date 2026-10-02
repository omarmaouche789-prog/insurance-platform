"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Briefcase, CircleDollarSign, Clock, Pencil, Plus, Search, UserCheck, UserX, Users, Wallet } from "lucide-react";
import type { AdminAgentDTO, AdminAgentListResponseDTO } from "@insurance/shared";
import { canManageAgents, formatCents, formatRateBps, US_STATES } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { formatDate } from "../../../lib/format";
import { useApiQuery, useDebounced } from "../../../lib/use-api";
import { AgentFormModal } from "../../../components/admin/agents/AgentFormModal";
import { ApprovalBar } from "../../../components/admin/agents/ApprovalBar";
import { DeactivateAgentModal } from "../../../components/admin/agents/DeactivateAgentModal";
import { RegionChips } from "../../../components/admin/agents/RegionPicker";
import { licenseExpiringSoon } from "../../../components/admin/agents/license";
import { Avatar } from "../../../components/ui/Avatar";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input, Select } from "../../../components/ui/Field";
import { Menu } from "../../../components/ui/Menu";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { StatCard } from "../../../components/ui/StatCard";
import { EmptyState, ErrorState, TableSkeleton } from "../../../components/ui/States";
import { FilterTabs } from "../../../components/ui/Tabs";
import { Table, TBody, Td, Th, THead } from "../../../components/ui/Table";
import { useToast } from "../../../components/ui/Toast";

type StatusFilter = "all" | "active" | "inactive";

export default function AdminAgentsPage() {
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const canManage = canManageAgents(user?.adminRole ?? null);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [region, setRegion] = useState("");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim());
  const path = useMemo(() => {
    const p = new URLSearchParams({ status });
    if (region) p.set("region", region);
    if (debounced) p.set("search", debounced);
    return `/api/admin/agents?${p}`;
  }, [status, region, debounced]);
  const { data, error, loading, reload } = useApiQuery<AdminAgentListResponseDTO>(path, "Couldn't load agents");
  // Summary cards always describe the whole team, not the current filter.
  const all = useApiQuery<AdminAgentListResponseDTO>("/api/admin/agents?status=all", "Couldn't load agents");

  const [editing, setEditing] = useState<AdminAgentDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<AdminAgentDTO | null>(null);

  const refresh = () => {
    reload();
    all.reload();
  };

  async function reactivate(a: AdminAgentDTO) {
    if (!accessToken) return;
    try {
      await apiFetch(`/api/admin/agents/${a.id}/reactivate`, { method: "POST", accessToken });
      toast.success(`${a.firstName} ${a.lastName} reactivated`, "They're back in the assignment pool.");
      refresh();
    } catch (err) {
      toast.error("Couldn't reactivate", describeApiError(err));
    }
  }

  const summary = all.data?.summary;
  const rows = data?.agents ?? [];

  return (
    <PageContainer wide>
      <PageHeader
        title="Agents"
        description="Licensing, territories, commission rates and performance across your agent team."
        actions={
          canManage && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>
              Add agent
            </Button>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active agents" value={summary ? summary.active : "—"} icon={<Users className="h-4 w-4" />} hint={summary ? `${summary.inactive} inactive` : undefined} />
        <StatCard label="Pending commission" value={summary ? formatCents(summary.commissions.PENDING) : "—"} icon={<Clock className="h-4 w-4" />} hint="Awaiting admin approval" />
        <StatCard label="Earned, unpaid" value={summary ? formatCents(summary.commissions.EARNED) : "—"} icon={<Wallet className="h-4 w-4" />} hint="Approved, ready to pay" />
        <StatCard label="Paid out" value={summary ? formatCents(summary.commissions.PAID) : "—"} icon={<CircleDollarSign className="h-4 w-4" />} hint="All time" />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs<StatusFilter>
          label="Agent status"
          value={status}
          onChange={setStatus}
          tabs={[
            { value: "all", label: "All", count: summary ? summary.active + summary.inactive : undefined },
            { value: "active", label: "Active", count: summary?.active },
            { value: "inactive", label: "Inactive", count: summary?.inactive },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or license #" className="pl-9" aria-label="Search agents" />
          </div>
          <Select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Filter by state" className="sm:w-36">
            <option value="">All states</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="h-5 w-5" />}
            title={debounced || region || status !== "all" ? "No agents match" : "No agents yet"}
            description={debounced || region || status !== "all" ? "Try a different filter." : "Add your first agent to start assigning applications."}
            action={canManage && !debounced && !region && status === "all" && <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>Add agent</Button>}
          />
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <Table>
              <THead>
                <tr>
                  <Th>Agent</Th>
                  <Th>License</Th>
                  <Th>States</Th>
                  <Th>Rate</Th>
                  <Th className="text-right">Handled</Th>
                  <Th>Approval rate</Th>
                  <Th className="text-right">Earned</Th>
                  <Th>Status</Th>
                  <Th className="w-12"><span className="sr-only">Actions</span></Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((a) => (
                  <tr key={a.id} className="cursor-pointer transition-colors hover:bg-gray-50" onClick={() => router.push(`/admin/agents/${a.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar firstName={a.firstName} lastName={a.lastName} />
                        <div className="min-w-0">
                          <Link href={`/admin/agents/${a.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-gray-900 hover:underline">
                            {a.firstName} {a.lastName}
                          </Link>
                          <span className="block truncate text-xs text-gray-500">{a.email}</span>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="font-mono text-xs">{a.licenseNumber}</span>
                      {a.licenseExpiresAt && (
                        <span className={`mt-0.5 flex items-center gap-1 text-xs ${licenseExpiringSoon(a.licenseExpiresAt) ? "font-medium text-amber-700" : "text-gray-500"}`}>
                          {licenseExpiringSoon(a.licenseExpiresAt) && <AlertTriangle className="h-3 w-3" aria-hidden />}
                          Exp. {formatDate(`${a.licenseExpiresAt}T12:00:00Z`)}
                        </span>
                      )}
                    </Td>
                    <Td><RegionChips regions={a.regions} max={4} /></Td>
                    <Td className="whitespace-nowrap">{a.commissionRateBps === null ? <span className="text-gray-400">Carrier default</span> : <Badge tone="indigo">{formatRateBps(a.commissionRateBps)}</Badge>}</Td>
                    <Td className="text-right tabular-nums">
                      {a.performance.applicationsHandled}
                      {a.performance.openApplications > 0 && <span className="block text-xs text-gray-400">{a.performance.openApplications} open</span>}
                    </Td>
                    <Td><ApprovalBar rate={a.performance.approvalRate} approved={a.performance.approved} rejected={a.performance.rejected} /></Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {formatCents(a.performance.commissions.EARNED + a.performance.commissions.PAID)}
                      {a.performance.commissions.PENDING > 0 && <span className="block text-xs text-gray-400">+{formatCents(a.performance.commissions.PENDING)} pending</span>}
                    </Td>
                    <Td>{a.isActive ? <Badge tone="green" dot>Active</Badge> : <Badge tone="gray" dot>Inactive</Badge>}</Td>
                    <Td>
                      <Menu
                        label={`Actions for ${a.firstName} ${a.lastName}`}
                        items={[
                          { label: "View dashboard", href: `/admin/agents/${a.id}`, icon: <Briefcase className="h-4 w-4 text-gray-400" aria-hidden /> },
                          { label: "Edit", hidden: !canManage, onSelect: () => { setEditing(a); setFormOpen(true); }, icon: <Pencil className="h-4 w-4 text-gray-400" aria-hidden /> },
                          { label: "Deactivate", hidden: !canManage || !a.isActive, danger: true, onSelect: () => setDeactivating(a), icon: <UserX className="h-4 w-4" aria-hidden /> },
                          { label: "Reactivate", hidden: !canManage || a.isActive, onSelect: () => void reactivate(a), icon: <UserCheck className="h-4 w-4 text-gray-400" aria-hidden /> },
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      <AgentFormModal
        open={formOpen}
        agent={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(a) => {
          setFormOpen(false);
          toast.success(editing ? "Agent updated" : `${a.firstName} ${a.lastName} added`, editing ? undefined : `An invite was sent to ${a.email}.`);
          refresh();
        }}
      />
      <DeactivateAgentModal
        agent={deactivating}
        onClose={() => setDeactivating(null)}
        onDone={(res) => {
          setDeactivating(null);
          toast.success(
            `${res.agent.firstName} ${res.agent.lastName} deactivated`,
            res.reassigned + res.unassigned > 0 ? `${res.reassigned} application(s) reassigned, ${res.unassigned} left unassigned.` : undefined,
          );
          refresh();
        }}
      />
    </PageContainer>
  );
}
