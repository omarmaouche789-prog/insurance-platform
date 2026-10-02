"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Search, ShieldCheck, Trash2, UserCheck, UserX, Users } from "lucide-react";
import type { AdminUserListItemDTO, AdminUserListResponseDTO, AdminUserSort, BulkUserActionResponseDTO, Role, UserStatus } from "@insurance/shared";
import { canManageUsers } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { formatDate, formatRelative } from "../../../lib/format";
import { useApiQuery, useDebounced } from "../../../lib/use-api";
import { RoleBadge, StatusBadge } from "../../../components/admin/users/UserBadges";
import { useUserActions, type UserAction } from "../../../components/admin/users/useUserActions";
import { Avatar } from "../../../components/ui/Avatar";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { CharCount, Checkbox, Field, Input, Select, Textarea } from "../../../components/ui/Field";
import { Menu, type MenuItem } from "../../../components/ui/Menu";
import { ConfirmDialog } from "../../../components/ui/Modal";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { Alert, EmptyState, ErrorState, TableSkeleton } from "../../../components/ui/States";
import { FilterTabs } from "../../../components/ui/Tabs";
import { Table, TBody, Td, Th, THead } from "../../../components/ui/Table";
import { useToast } from "../../../components/ui/Toast";

type StatusTab = "ALL" | UserStatus;
const PAGE_SIZE = 20;

function rowMenuItems(user: AdminUserListItemDTO, canManage: boolean, onAction: (a: UserAction) => void): MenuItem[] {
  const manageable = canManage && user.status !== "DELETED";
  const icon = "h-4 w-4 text-gray-400";
  return [
    { label: "View profile", href: `/admin/users/${user.id}`, icon: <Users className={icon} aria-hidden /> },
    { label: "Suspend", hidden: !manageable || user.status !== "ACTIVE", onSelect: () => onAction("suspend"), icon: <UserX className={icon} aria-hidden /> },
    { label: "Reactivate", hidden: !manageable || user.status !== "SUSPENDED", onSelect: () => onAction("activate"), icon: <UserCheck className={icon} aria-hidden /> },
    { label: "Send password reset", hidden: !manageable, onSelect: () => onAction("reset-password"), icon: <KeyRound className={icon} aria-hidden /> },
    { label: "Delete account", hidden: !manageable, danger: true, onSelect: () => onAction("delete"), icon: <Trash2 className="h-4 w-4" aria-hidden /> },
  ];
}

export default function AdminUsersPage() {
  const { user: me, accessToken } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const canManage = canManageUsers(me?.adminRole ?? null);

  const [status, setStatus] = useState<StatusTab>("ALL");
  const [role, setRole] = useState<Role | "">("");
  const [sort, setSort] = useState<AdminUserSort>("createdAt");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search.trim());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const path = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort, direction: sort === "name" || sort === "email" ? "asc" : "desc" });
    if (status !== "ALL") p.set("status", status);
    if (role) p.set("role", role);
    if (debouncedSearch) p.set("search", debouncedSearch);
    return `/api/admin/users?${p}`;
  }, [page, sort, status, role, debouncedSearch]);
  const { data, error, loading, reload } = useApiQuery<AdminUserListResponseDTO>(path, "Couldn't load users");

  // Filters change the result set, so start from page 1 with nothing selected.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [status, role, debouncedSearch, sort]);

  const { run, dialogs } = useUserActions(() => {
    reload();
    setSelected(new Set());
  });

  const [bulk, setBulk] = useState<"suspend" | "activate" | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  async function runBulk() {
    if (!bulk || !accessToken) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const res = await apiFetch<BulkUserActionResponseDTO>("/api/admin/users/bulk", {
        method: "POST",
        body: JSON.stringify({ action: bulk, ids: [...selected], reason: bulk === "suspend" ? bulkReason : undefined }),
        accessToken,
      });
      const ok = res.results.filter((r) => r.ok).length;
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length === 0) toast.success(`${ok} account${ok === 1 ? "" : "s"} ${bulk === "suspend" ? "suspended" : "reactivated"}`);
      else toast.error(`${ok} updated, ${failed.length} skipped`, [...new Set(failed.map((f) => f.error))].join(" · "));
      setBulk(null);
      setSelected(new Set());
      reload();
    } catch (err) {
      setBulkError(describeApiError(err));
    } finally {
      setBulkBusy(false);
    }
  }

  const rows = data?.users ?? [];
  const selectable = rows.filter((u) => u.status !== "DELETED" && u.id !== me?.id);
  const allSelected = selectable.length > 0 && selectable.every((u) => selected.has(u.id));
  const counts = data?.statusCounts;
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <PageContainer wide>
      <PageHeader title="Users" description="Search, review and manage every account on the platform." />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs<StatusTab>
          label="Account status"
          value={status}
          onChange={setStatus}
          tabs={[
            { value: "ALL", label: "All", count: counts ? counts.ACTIVE + counts.SUSPENDED : undefined },
            { value: "ACTIVE", label: "Active", count: counts?.ACTIVE },
            { value: "SUSPENDED", label: "Suspended", count: counts?.SUSPENDED },
            { value: "DELETED", label: "Deleted", count: counts?.DELETED },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className="pl-9" aria-label="Search users" type="search" />
          </div>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role | "")} aria-label="Filter by role" className="sm:w-36">
            <option value="">All roles</option>
            <option value="USER">Users</option>
            <option value="AGENT">Agents</option>
            <option value="ADMIN">Admins</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as AdminUserSort)} aria-label="Sort by" className="sm:w-44">
            <option value="createdAt">Newest first</option>
            <option value="lastLoginAt">Recent sign-in</option>
            <option value="name">Name (A–Z)</option>
            <option value="email">Email (A–Z)</option>
          </Select>
        </div>
      </div>

      {canManage && selected.size > 0 && (
        <div className="mb-4 flex animate-slide-in flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <p className="text-sm font-medium text-indigo-900">{selected.size} selected</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<UserCheck className="h-3.5 w-3.5" />} onClick={() => { setBulk("activate"); setBulkError(null); }}>
              Reactivate
            </Button>
            <Button size="sm" variant="danger" icon={<UserX className="h-3.5 w-3.5" />} onClick={() => { setBulk("suspend"); setBulkReason(""); setBulkError(null); }}>
              Suspend
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <Card>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <TableSkeleton rows={8} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No users match" description="Try a different search or filter." />
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <Table>
              <THead>
                <tr>
                  {canManage && (
                    <Th className="w-10">
                      <Checkbox
                        aria-label="Select all on this page"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((u) => u.id)))}
                      />
                    </Th>
                  )}
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th className="text-center">2FA</Th>
                  <Th>Last sign-in</Th>
                  <Th>Joined</Th>
                  <Th className="w-12"><span className="sr-only">Actions</span></Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((u) => {
                  const canSelect = u.status !== "DELETED" && u.id !== me?.id;
                  return (
                    <tr key={u.id} className="cursor-pointer transition-colors hover:bg-gray-50" onClick={() => router.push(`/admin/users/${u.id}`)}>
                      {canManage && (
                        <Td onClick={(e) => e.stopPropagation()}>
                          <Checkbox aria-label={`Select ${u.firstName} ${u.lastName}`} checked={selected.has(u.id)} onChange={() => toggle(u.id)} disabled={!canSelect} />
                        </Td>
                      )}
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar firstName={u.firstName} lastName={u.lastName} />
                          <div className="min-w-0">
                            <Link href={`/admin/users/${u.id}`} className="block truncate font-medium text-gray-900 hover:underline" onClick={(e) => e.stopPropagation()}>
                              {u.firstName} {u.lastName}
                              {u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-gray-400">(you)</span>}
                            </Link>
                            <span className="block truncate text-xs text-gray-500">{u.email}</span>
                          </div>
                        </div>
                      </Td>
                      <Td><RoleBadge role={u.role} adminRole={u.adminRole} /></Td>
                      <Td><StatusBadge status={u.status} /></Td>
                      <Td className="text-center">
                        {u.twoFactorEnabled ? (
                          <ShieldCheck className="mx-auto h-4 w-4 text-green-600" aria-label="Two-factor on" />
                        ) : (
                          <span className="text-xs text-gray-400" aria-label="Two-factor off">—</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-gray-500">{u.lastLoginAt ? formatRelative(u.lastLoginAt) : "Never"}</Td>
                      <Td className="whitespace-nowrap text-gray-500">{formatDate(u.createdAt)}</Td>
                      <Td>
                        <Menu label={`Actions for ${u.firstName} ${u.lastName}`} items={rowMenuItems(u, canManage && u.id !== me?.id, (a) => run(a, u))} />
                      </Td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </div>
        )}
      </Card>

      {dialogs}

      <ConfirmDialog
        open={bulk !== null}
        onClose={() => !bulkBusy && setBulk(null)}
        onConfirm={runBulk}
        loading={bulkBusy}
        tone={bulk === "suspend" ? "danger" : "primary"}
        confirmDisabled={bulk === "suspend" && bulkReason.trim().length < 3}
        title={`${bulk === "suspend" ? "Suspend" : "Reactivate"} ${selected.size} account${selected.size === 1 ? "" : "s"}?`}
        description={bulk === "suspend" ? "Each account is signed out and blocked from signing in. Accounts you aren't allowed to change are skipped." : "Each account can sign in again."}
        confirmLabel={bulk === "suspend" ? "Suspend all" : "Reactivate all"}
      >
        <div className="space-y-3">
          {bulkError && <Alert>{bulkError}</Alert>}
          {bulk === "suspend" && (
            <Field label={<span className="flex justify-between">Reason <CharCount value={bulkReason} max={500} /></span>} htmlFor="bulk-reason">
              <Textarea id="bulk-reason" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} data-autofocus />
            </Field>
          )}
        </div>
      </ConfirmDialog>
    </PageContainer>
  );
}
