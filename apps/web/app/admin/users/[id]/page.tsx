"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  Briefcase,
  CheckCircle2,
  FileText,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import type { AdminUserDetailDTO, LoginHistoryResponseDTO } from "@insurance/shared";
import { canManageUsers, LOGIN_METHOD_LABELS } from "@insurance/shared";
import { useAuth } from "../../../../lib/auth-context";
import { formatDate, formatDateTime, formatRelative } from "../../../../lib/format";
import { useApiQuery } from "../../../../lib/use-api";
import { ApplicationStatusBadge } from "../../../../components/applications/ApplicationStatusBadge";
import { RoleBadge, StatusBadge } from "../../../../components/admin/users/UserBadges";
import { useUserActions } from "../../../../components/admin/users/useUserActions";
import { DeviceIcon } from "../../../../components/security/SecuritySettings";
import { Avatar } from "../../../../components/ui/Avatar";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../../../components/ui/Card";
import { PageContainer, PageHeader } from "../../../../components/ui/PageHeader";
import { Pagination } from "../../../../components/ui/Pagination";
import { Alert, EmptyState, ErrorState, LoadingState, TableSkeleton } from "../../../../components/ui/States";
import { Table, TBody, Td, Th, THead } from "../../../../components/ui/Table";

const HISTORY_PAGE_SIZE = 10;

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right text-gray-900">{children}</dd>
    </div>
  );
}

// Audit actions are dotted identifiers ("admin.user.suspend"); make them readable.
const humanizeAction = (a: string) => a.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user: me } = useAuth();
  const detail = useApiQuery<{ user: AdminUserDetailDTO }>(`/api/admin/users/${encodeURIComponent(id)}`, "Couldn't load this user");
  const [historyPage, setHistoryPage] = useState(1);
  const history = useApiQuery<LoginHistoryResponseDTO>(
    `/api/admin/users/${encodeURIComponent(id)}/login-history?page=${historyPage}&pageSize=${HISTORY_PAGE_SIZE}`,
    "Couldn't load sign-in history",
  );
  const { run, dialogs } = useUserActions((action) => {
    if (action === "delete") router.push("/admin/users");
    else {
      detail.reload();
      history.reload();
    }
  });

  if (detail.error) return <PageContainer><ErrorState message={detail.error} onRetry={detail.reload} /></PageContainer>;
  if (!detail.data) return <LoadingState className="py-32" />;

  const u = detail.data.user;
  const isSelf = u.id === me?.id;
  const canManage = canManageUsers(me?.adminRole ?? null) && !isSelf && u.status !== "DELETED";
  const failedRecent = u.recentLogins.filter((l) => !l.success).length;

  return (
    <PageContainer wide>
      <PageHeader
        back={{ href: "/admin/users", label: "All users" }}
        title={
          <span className="flex items-center gap-4">
            <Avatar firstName={u.firstName} lastName={u.lastName} size="lg" />
            <span className="min-w-0">
              <span className="block truncate">
                {u.firstName} {u.lastName}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-sm font-normal text-gray-500">
                {u.email}
                <RoleBadge role={u.role} adminRole={u.adminRole} />
                <StatusBadge status={u.status} />
              </span>
            </span>
          </span>
        }
        actions={
          canManage && (
            <>
              {u.status === "ACTIVE" ? (
                <Button icon={<UserX className="h-4 w-4" />} onClick={() => run("suspend", u)}>
                  Suspend
                </Button>
              ) : (
                <Button variant="primary" icon={<UserCheck className="h-4 w-4" />} onClick={() => run("activate", u)}>
                  Reactivate
                </Button>
              )}
              <Button icon={<KeyRound className="h-4 w-4" />} onClick={() => run("reset-password", u)}>
                Reset password
              </Button>
              {u.twoFactorEnabled && (
                <Button icon={<ShieldOff className="h-4 w-4" />} onClick={() => run("reset-2fa", u)}>
                  Reset 2FA
                </Button>
              )}
              <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => run("delete", u)}>
                Delete
              </Button>
            </>
          )
        }
      />

      <div className="space-y-6">
        {u.status === "SUSPENDED" && (
          <Alert tone="amber">
            <strong>Suspended {formatDateTime(u.suspendedAt)}.</strong> {u.suspensionReason && <>Reason: {u.suspensionReason}</>}
          </Alert>
        )}
        {u.status === "DELETED" && <Alert>This account was deleted {formatDateTime(u.deletedAt)}. Personal details were erased.</Alert>}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader title="Profile" />
            <CardBody>
              <dl className="divide-y divide-gray-100">
                <Detail label="Phone">{u.phone ?? "—"}</Detail>
                <Detail label="Joined">{formatDate(u.createdAt)}</Detail>
                <Detail label="Last sign-in">{u.lastLoginAt ? formatRelative(u.lastLoginAt) : "Never"}</Detail>
                <Detail label="Email verified">{u.emailVerifiedAt ? formatDate(u.emailVerifiedAt) : "No"}</Detail>
                <Detail label="Last updated">{formatDate(u.updatedAt)}</Detail>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Security" icon={<ShieldCheck className="h-4 w-4" />} />
            <CardBody>
              <dl className="divide-y divide-gray-100">
                <Detail label="Two-factor">{u.twoFactorEnabled ? <Badge tone="green" dot>On</Badge> : <Badge tone="amber" dot>Off</Badge>}</Detail>
                <Detail label="Backup codes left">{u.twoFactorEnabled ? u.backupCodesRemaining : "—"}</Detail>
                <Detail label="Recent failed sign-ins">
                  <span className={failedRecent >= 3 ? "font-medium text-red-700" : undefined}>{failedRecent} of last {u.recentLogins.length}</span>
                </Detail>
              </dl>
            </CardBody>
          </Card>

          {u.agentProfile ? (
            <Card>
              <CardHeader
                title="Agent profile"
                icon={<Briefcase className="h-4 w-4" />}
                actions={
                  <Link href={`/admin/agents/${u.id}`} className="text-sm font-medium text-indigo-600 hover:underline">
                    Manage
                  </Link>
                }
              />
              <CardBody>
                <dl className="divide-y divide-gray-100">
                  <Detail label="License">{u.agentProfile.licenseNumber}</Detail>
                  <Detail label="Licensed in">{u.agentProfile.regions.join(", ") || "—"}</Detail>
                  <Detail label="Assignment pool">{u.agentProfile.isActive ? "Active" : "Inactive"}</Detail>
                </dl>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Applications" icon={<FileText className="h-4 w-4" />} />
              <CardBody>
                <p className="text-3xl font-semibold tabular-nums">{u.applicationCount}</p>
                <p className="text-sm text-gray-500">submitted or in progress</p>
              </CardBody>
            </Card>
          )}
        </div>

        {u.role === "USER" && (
          <Card>
            <CardHeader title="Applications" description={`${u.applicationCount} total · most recent first`} />
            {u.applications.length === 0 ? (
              <EmptyState title="No applications yet" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {u.applications.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/applications/${a.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-gray-50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{a.planName}</span>
                        <span className="text-xs text-gray-500">Updated {formatRelative(a.updatedAt)}</span>
                      </span>
                      <ApplicationStatusBadge status={a.status} submissionStatus={a.submissionStatus} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <div className="grid gap-6 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader title="Sign-in history" description="Every attempt, including failures." />
            {history.error ? (
              <ErrorState message={history.error} onRetry={history.reload} />
            ) : !history.data ? (
              <TableSkeleton rows={5} cols={4} />
            ) : history.data.entries.length === 0 ? (
              <EmptyState title="No sign-ins recorded" />
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <Th>Result</Th>
                      <Th>When</Th>
                      <Th>Device</Th>
                      <Th>IP address</Th>
                      <Th>Method</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {history.data.entries.map((e) => (
                      <tr key={e.id}>
                        <Td>
                          {e.success ? (
                            <span className="inline-flex items-center gap-1.5 text-green-700"><CheckCircle2 className="h-4 w-4" aria-hidden /> Success</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-red-700" title={e.failureReason ?? undefined}><XCircle className="h-4 w-4" aria-hidden /> {e.failureReason ?? "Failed"}</span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap">
                          <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
                        </Td>
                        <Td>
                          <span className="inline-flex items-center gap-2 whitespace-nowrap"><DeviceIcon type={e.deviceType} /> {e.device ?? "Unknown"}</span>
                        </Td>
                        <Td className="font-mono text-xs">{e.ipAddress ?? "—"}</Td>
                        <Td className="whitespace-nowrap">{LOGIN_METHOD_LABELS[e.method]}</Td>
                      </tr>
                    ))}
                  </TBody>
                </Table>
                <Pagination page={historyPage} pageSize={HISTORY_PAGE_SIZE} total={history.data.total} onPage={setHistoryPage} />
              </>
            )}
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Recent activity" icon={<Activity className="h-4 w-4" />} description="Actions this account performed." />
            {u.recentActivity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ol className="relative space-y-4 px-5 py-4">
                {u.recentActivity.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{humanizeAction(a.action)}</p>
                      <p className="text-xs text-gray-500">
                        {formatRelative(a.createdAt)}
                        {a.ipAddress && <> · <span className="font-mono">{a.ipAddress}</span></>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      {dialogs}
    </PageContainer>
  );
}
