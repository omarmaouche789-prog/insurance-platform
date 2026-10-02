"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BadgeCheck, CircleDollarSign, Clock, FileText, Mail, Pencil, Phone, ShieldCheck, Target, UserCheck, UserX, Wallet } from "lucide-react";
import type { AdminAgentDetailDTO, CommissionStatus, PayCommissionsResponseDTO } from "@insurance/shared";
import { canManageAgents, canPayCommissions, formatCents, formatRateBps } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import { formatDate, formatPercent, formatRelative } from "../../../../lib/format";
import { useApiQuery } from "../../../../lib/use-api";
import { ApplicationStatusBadge } from "../../../../components/applications/ApplicationStatusBadge";
import { AgentFormModal } from "../../../../components/admin/agents/AgentFormModal";
import { DeactivateAgentModal } from "../../../../components/admin/agents/DeactivateAgentModal";
import { RegionChips } from "../../../../components/admin/agents/RegionPicker";
import { licenseExpiringSoon } from "../../../../components/admin/agents/license";
import { Avatar } from "../../../../components/ui/Avatar";
import { Badge, type BadgeTone } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../../../components/ui/Card";
import { ConfirmDialog } from "../../../../components/ui/Modal";
import { PageContainer, PageHeader } from "../../../../components/ui/PageHeader";
import { StatCard } from "../../../../components/ui/StatCard";
import { Alert, EmptyState, ErrorState, LoadingState } from "../../../../components/ui/States";
import { Table, TBody, Td, Th, THead } from "../../../../components/ui/Table";
import { useToast } from "../../../../components/ui/Toast";

const COMMISSION_TONE: Record<CommissionStatus, BadgeTone> = { PENDING: "amber", EARNED: "blue", PAID: "green", VOID: "gray" };

export default function AdminAgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const { data, error, reload } = useApiQuery<{ agent: AdminAgentDetailDTO }>(`/api/admin/agents/${encodeURIComponent(id)}`, "Couldn't load this agent");
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (error) return <PageContainer><ErrorState message={error} onRetry={reload} /></PageContainer>;
  if (!data) return <LoadingState className="py-32" />;

  const a = data.agent;
  const p = a.performance;
  const canManage = canManageAgents(user?.adminRole ?? null);
  const canPay = canPayCommissions(user?.adminRole ?? null);

  async function reactivate() {
    if (!accessToken) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/agents/${a.id}/reactivate`, { method: "POST", accessToken });
      toast.success("Agent reactivated");
      reload();
    } catch (err) {
      toast.error("Couldn't reactivate", describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!accessToken) return;
    setBusy(true);
    try {
      const res = await apiFetch<PayCommissionsResponseDTO>(`/api/admin/agents/${a.id}/commissions/pay`, { method: "POST", body: "{}", accessToken });
      toast.success(`Paid ${formatCents(res.paidCents)}`, `${res.paidCount} commission${res.paidCount === 1 ? "" : "s"} marked paid.`);
      setPayOpen(false);
      reload();
    } catch (err) {
      toast.error("Couldn't record payout", describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer wide>
      <PageHeader
        back={{ href: "/admin/agents", label: "All agents" }}
        title={
          <span className="flex items-center gap-4">
            <Avatar firstName={a.firstName} lastName={a.lastName} size="lg" />
            <span>
              <span className="block">
                {a.firstName} {a.lastName}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-sm font-normal text-gray-500">
                {a.isActive ? <Badge tone="green" dot>Active</Badge> : <Badge tone="gray" dot>Inactive</Badge>}
                {a.twoFactorEnabled ? <Badge tone="indigo"><ShieldCheck className="h-3 w-3" aria-hidden /> 2FA</Badge> : <Badge tone="amber">2FA off</Badge>}
                <span>Joined {formatDate(a.createdAt)}</span>
              </span>
            </span>
          </span>
        }
        actions={
          <>
            {canPay && p.commissions.EARNED > 0 && (
              <Button variant="accent" icon={<Wallet className="h-4 w-4" />} onClick={() => setPayOpen(true)}>
                Pay {formatCents(p.commissions.EARNED)}
              </Button>
            )}
            {canManage && (
              <>
                <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
                {a.isActive ? (
                  <Button variant="danger" icon={<UserX className="h-4 w-4" />} onClick={() => setDeactivateOpen(true)}>
                    Deactivate
                  </Button>
                ) : (
                  <Button variant="primary" icon={<UserCheck className="h-4 w-4" />} onClick={reactivate} loading={busy}>
                    Reactivate
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      <div className="space-y-6">
        {!a.isActive && <Alert tone="amber">Deactivated {formatDate(a.deactivatedAt)}. Their history is preserved; they receive no new assignments and can&apos;t sign in.</Alert>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Applications handled" value={p.applicationsHandled} icon={<FileText className="h-4 w-4" />} hint={`${p.openApplications} open`} />
          <StatCard label="Approval rate" value={formatPercent(p.approvalRate)} icon={<Target className="h-4 w-4" />} hint={`${p.approved} approved · ${p.rejected} rejected`} />
          <StatCard label="Pending commission" value={formatCents(p.commissions.PENDING)} icon={<Clock className="h-4 w-4" />} hint="Awaiting approval" />
          <StatCard label="Earned / paid" value={formatCents(p.commissions.EARNED + p.commissions.PAID)} icon={<CircleDollarSign className="h-4 w-4" />} hint={`${formatCents(p.commissions.PAID)} paid out`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader title="Licensing & contact" icon={<BadgeCheck className="h-4 w-4" />} />
            <CardBody className="space-y-4 text-sm">
              <dl className="space-y-3">
                <div className="flex justify-between gap-4"><dt className="text-gray-500">License #</dt><dd className="font-mono">{a.licenseNumber}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-gray-500">NPN</dt><dd className="font-mono">{a.npn ?? "—"}</dd></div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Expires</dt>
                  <dd className={licenseExpiringSoon(a.licenseExpiresAt) ? "font-medium text-amber-700" : undefined}>
                    {a.licenseExpiresAt ? formatDate(`${a.licenseExpiresAt}T12:00:00Z`) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Commission rate</dt>
                  <dd>{a.commissionRateBps === null ? "Carrier default" : formatRateBps(a.commissionRateBps)}</dd>
                </div>
              </dl>
              <div>
                <p className="mb-1.5 text-gray-500">Licensed states</p>
                <RegionChips regions={a.regions} max={60} />
              </div>
              <div className="space-y-1.5 border-t border-gray-100 pt-3">
                <a href={`mailto:${a.email}`} className="flex items-center gap-2 text-gray-700 hover:text-gray-900"><Mail className="h-4 w-4 text-gray-400" aria-hidden />{a.email}</a>
                {a.phone && <a href={`tel:${a.phone}`} className="flex items-center gap-2 text-gray-700 hover:text-gray-900"><Phone className="h-4 w-4 text-gray-400" aria-hidden />{a.phone}</a>}
                <p className="text-xs text-gray-500">Last sign-in {a.lastLoginAt ? formatRelative(a.lastLoginAt) : "never"}</p>
              </div>
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Recent applications" description="Most recently updated first." />
            {a.recentApplications.length === 0 ? (
              <EmptyState title="No applications assigned yet" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {a.recentApplications.map((app) => (
                  <li key={app.id}>
                    <Link href={`/admin/applications/${app.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-gray-50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{app.applicantName}</span>
                        <span className="block truncate text-xs text-gray-500">{app.planName} · {formatRelative(app.updatedAt)}</span>
                      </span>
                      <ApplicationStatusBadge status={app.status} submissionStatus={app.submissionStatus} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Commission history" description="Snapshots of premium and rate at the time each sale was booked." />
          {a.commissionHistory.length === 0 ? (
            <EmptyState icon={<Wallet className="h-5 w-5" />} title="No commissions yet" description="Commissions are booked when a carrier accepts an application." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Applicant</Th>
                  <Th>Carrier / plan</Th>
                  <Th className="text-right">Premium</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Booked</Th>
                </tr>
              </THead>
              <TBody>
                {a.commissionHistory.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium text-gray-900">{c.applicantName}</Td>
                    <Td>
                      <span className="block">{c.carrierName}</span>
                      <span className="block text-xs text-gray-500">{c.planName}</span>
                    </Td>
                    <Td className="text-right tabular-nums">{formatCents(c.premiumCents)}/mo</Td>
                    <Td className="text-right tabular-nums">{formatRateBps(c.rateBps)}</Td>
                    <Td className="text-right font-medium tabular-nums text-gray-900">{formatCents(c.amountCents)}</Td>
                    <Td><Badge tone={COMMISSION_TONE[c.status]}>{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</Badge></Td>
                    <Td className="whitespace-nowrap text-gray-500">{formatDate(c.createdAt)}</Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <AgentFormModal
        open={editOpen}
        agent={a}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          toast.success("Agent updated");
          reload();
        }}
      />
      <DeactivateAgentModal
        agent={deactivateOpen ? a : null}
        onClose={() => setDeactivateOpen(false)}
        onDone={(res) => {
          setDeactivateOpen(false);
          toast.success("Agent deactivated", res.reassigned + res.unassigned > 0 ? `${res.reassigned} reassigned, ${res.unassigned} unassigned.` : undefined);
          reload();
        }}
      />
      <ConfirmDialog
        open={payOpen}
        onClose={() => !busy && setPayOpen(false)}
        onConfirm={pay}
        loading={busy}
        tone="primary"
        title={`Record a payout of ${formatCents(p.commissions.EARNED)}?`}
        description="All earned commissions for this agent will be marked paid. Do this after the payment has actually been sent."
        confirmLabel="Mark as paid"
      />
    </PageContainer>
  );
}
