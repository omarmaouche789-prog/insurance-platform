"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  LifeBuoy,
  Monitor,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Tablet,
  XCircle,
} from "lucide-react";
import type {
  BackupCodesResponseDTO,
  DeviceType,
  LoginHistoryResponseDTO,
  TwoFactorStatusDTO,
} from "@insurance/shared";
import { LOGIN_METHOD_LABELS } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { formatDate, formatDateTime, formatRelative } from "../../lib/format";
import { useApiQuery } from "../../lib/use-api";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { Field, Input } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { PageContainer, PageHeader } from "../ui/PageHeader";
import { Pagination } from "../ui/Pagination";
import { Alert, EmptyState, ErrorState, Skeleton, TableSkeleton } from "../ui/States";
import { useToast } from "../ui/Toast";
import { BackupCodesPanel } from "./BackupCodesPanel";
import { OtpInput } from "./OtpInput";
import { TwoFactorSetupModal } from "./TwoFactorSetupModal";

const LOW_CODES = 3;
const HISTORY_PAGE_SIZE = 10;

export function DeviceIcon({ type }: { type: DeviceType }) {
  const Icon = type === "mobile" ? Smartphone : type === "tablet" ? Tablet : Monitor;
  return <Icon className="h-4 w-4 text-gray-400" aria-hidden />;
}

// Shared by /account/security, /agent/security and /admin/security: every
// role manages its own 2FA and sees its own sign-in history.
export function SecuritySettings() {
  const { user, accessToken, refreshUser } = useAuth();
  const toast = useToast();
  const status = useApiQuery<TwoFactorStatusDTO>("/api/users/me/2fa", "Couldn't load your security settings");
  const [historyPage, setHistoryPage] = useState(1);
  const history = useApiQuery<LoginHistoryResponseDTO>(
    `/api/users/me/login-history?page=${historyPage}&pageSize=${HISTORY_PAGE_SIZE}`,
    "Couldn't load sign-in history",
  );

  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);

  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  function resetForms() {
    setPassword("");
    setCode("");
    setUseBackup(false);
    setModalError(null);
    setNewCodes(null);
  }

  async function onEnabled() {
    status.reload();
    history.reload();
    await refreshUser().catch(() => undefined);
    toast.success("Two-factor authentication is on", "You'll be asked for a code next time you sign in.");
  }

  async function disable() {
    if (!accessToken) return;
    setBusy(true);
    setModalError(null);
    try {
      await apiFetch("/api/users/me/2fa/disable", { method: "POST", body: JSON.stringify({ password, code }), accessToken });
      setDisableOpen(false);
      resetForms();
      status.reload();
      await refreshUser().catch(() => undefined);
      toast.success("Two-factor authentication turned off");
    } catch (err) {
      setModalError(describeApiError(err, "Couldn't turn off two-factor authentication"));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(value = code) {
    if (!accessToken || value.length !== 6) return;
    setBusy(true);
    setModalError(null);
    try {
      const res = await apiFetch<BackupCodesResponseDTO>("/api/users/me/2fa/backup-codes", {
        method: "POST",
        body: JSON.stringify({ code: value }),
        accessToken,
      });
      setNewCodes(res.backupCodes);
      status.reload();
      toast.success("New backup codes generated", "Your old codes no longer work.");
    } catch (err) {
      setModalError(describeApiError(err, "Couldn't generate new codes"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const s = status.data;
  return (
    <PageContainer>
      <PageHeader title="Security" description="Two-factor authentication, recovery options and recent sign-in activity." />

      <div className="space-y-6">
        <Card>
          <CardHeader
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Two-factor authentication"
            description="Require a code from your phone in addition to your password."
            actions={s && (s.enabled ? <Badge tone="green" dot>On</Badge> : <Badge tone="amber" dot>Off</Badge>)}
          />
          <CardBody>
            {status.error ? (
              <ErrorState message={status.error} onRetry={status.reload} className="py-6" />
            ) : !s ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-9 w-40" />
              </div>
            ) : s.enabled ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
                    <Smartphone className="mt-0.5 h-5 w-5 text-indigo-600" aria-hidden />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Authenticator app</p>
                      <p className="text-sm text-gray-500">Turned on {formatDate(s.enabledAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
                    <KeyRound className={`mt-0.5 h-5 w-5 ${s.backupCodesRemaining <= LOW_CODES ? "text-amber-700" : "text-indigo-600"}`} aria-hidden />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Backup codes</p>
                      <p className="text-sm text-gray-500">
                        {s.backupCodesRemaining} of 10 remaining
                      </p>
                    </div>
                  </div>
                </div>
                {s.backupCodesRemaining <= LOW_CODES && (
                  <Alert tone="amber">
                    You&apos;re running low on backup codes. Generate a new set so you can still get in if you lose your phone.
                  </Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    icon={<RefreshCw className="h-4 w-4" />}
                    onClick={() => {
                      resetForms();
                      setRegenOpen(true);
                    }}
                  >
                    New backup codes
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-red-700 hover:bg-red-50"
                    icon={<ShieldOff className="h-4 w-4" />}
                    onClick={() => {
                      resetForms();
                      setDisableOpen(true);
                    }}
                  >
                    Turn off
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm text-gray-600">
                  {user?.role === "USER"
                    ? "Your applications contain sensitive personal and health information. Two-factor authentication keeps them safe even if your password leaks."
                    : "Your account can see applicants' personal and health information. We strongly recommend two-factor authentication."}
                </p>
                {s?.setupAvailable === false ? (
                  <p className="max-w-xs rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Two-factor setup is currently turned off by your administrator.
                  </p>
                ) : (
                  <Button variant="primary" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setSetupOpen(true)}>
                    Set up 2FA
                  </Button>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<LifeBuoy className="h-5 w-5" />} title="If you lose your phone" />
          <CardBody>
            <ol className="space-y-3 text-sm text-gray-600">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">1</span>
                <span>
                  On the sign-in screen, choose <strong className="text-gray-900">Use a backup code</strong> and enter one of your saved codes. Each code works once.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">2</span>
                <span>Once you&apos;re in, turn two-factor authentication off and set it up again on your new phone.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">3</span>
                <span>
                  No backup codes left? Contact support. After verifying your identity, an administrator can reset two-factor authentication on your account.
                </span>
              </li>
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent sign-in activity" description="If you see a sign-in you don't recognize, change your password right away." />
          {history.error ? (
            <ErrorState message={history.error} onRetry={history.reload} />
          ) : !history.data ? (
            <TableSkeleton rows={4} cols={3} />
          ) : history.data.entries.length === 0 ? (
            <EmptyState title="No sign-ins yet" />
          ) : (
            <>
              <ul className="divide-y divide-gray-100">
                {history.data.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-4 px-5 py-3.5">
                    {e.success ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-label="Successful" />
                    ) : (
                      <XCircle className="h-5 w-5 shrink-0 text-red-600" aria-label="Failed" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900">
                        <DeviceIcon type={e.deviceType} />
                        {e.device ?? "Unknown device"}
                        {!e.success && <Badge tone="red">{e.failureReason ?? "Failed"}</Badge>}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {LOGIN_METHOD_LABELS[e.method]} · {e.ipAddress ?? "unknown IP"}
                      </p>
                    </div>
                    <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)} className="shrink-0 text-xs text-gray-500">
                      {formatRelative(e.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
              <Pagination page={historyPage} pageSize={HISTORY_PAGE_SIZE} total={history.data.total} onPage={setHistoryPage} />
            </>
          )}
        </Card>
      </div>

      <TwoFactorSetupModal open={setupOpen} onClose={() => setSetupOpen(false)} onEnabled={onEnabled} />

      <Modal
        open={disableOpen}
        onClose={() => !busy && setDisableOpen(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden /> Turn off two-factor authentication?
          </span>
        }
        description="Your account will be protected by your password alone."
        footer={
          <>
            <Button onClick={() => setDisableOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} disabled={!password || code.length < 6} onClick={disable}>
              Turn off
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void disable();
          }}
        >
          {modalError && <Alert>{modalError}</Alert>}
          <Field label="Current password" htmlFor="disable-password">
            <Input id="disable-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
          </Field>
          {useBackup ? (
            <Field label="Backup code" htmlFor="disable-backup">
              <Input id="disable-backup" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXXX-XXXXX" className="font-mono tracking-wider" autoComplete="off" />
            </Field>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Authenticator code</p>
              <OtpInput value={code} onChange={setCode} disabled={busy} />
            </div>
          )}
          <button
            type="button"
            className="text-sm font-medium text-indigo-600 hover:underline"
            onClick={() => {
              setUseBackup((b) => !b);
              setCode("");
            }}
          >
            {useBackup ? "Use your authenticator app instead" : "Use a backup code instead"}
          </button>
          <button type="submit" hidden />
        </form>
      </Modal>

      <Modal
        open={regenOpen}
        onClose={() => !busy && setRegenOpen(false)}
        title={newCodes ? "Your new backup codes" : "Generate new backup codes"}
        description={newCodes ? "Your previous codes stopped working. Save these now — they won't be shown again." : "This replaces all of your existing backup codes."}
        footer={
          newCodes ? (
            <Button variant="primary" onClick={() => setRegenOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={() => setRegenOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" loading={busy} disabled={code.length !== 6} onClick={() => regenerate()}>
                Generate
              </Button>
            </>
          )
        }
      >
        {newCodes ? (
          <BackupCodesPanel codes={newCodes} email={user?.email ?? ""} />
        ) : (
          <div className="space-y-4 py-2 text-center">
            {modalError && <Alert>{modalError}</Alert>}
            <p className="text-sm text-gray-600">Confirm with a code from your authenticator app.</p>
            <OtpInput value={code} onChange={setCode} onComplete={(v) => void regenerate(v)} disabled={busy} invalid={Boolean(modalError)} />
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
