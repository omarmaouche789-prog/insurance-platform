"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { AdminUserListItemDTO, PasswordResetIssuedResponseDTO } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { formatDateTime } from "../../../lib/format";
import { CharCount, Field, Input, Textarea } from "../../ui/Field";
import { ConfirmDialog } from "../../ui/Modal";
import { Alert } from "../../ui/States";
import { useToast } from "../../ui/Toast";

export type UserAction = "suspend" | "activate" | "delete" | "reset-password" | "reset-2fa";
type Target = Pick<AdminUserListItemDTO, "id" | "email" | "firstName" | "lastName">;

const REASON_MAX = 500;

// One place for every account action an admin can take, used by both the
// users table and the user detail page. Returns a trigger plus the dialogs.
export function useUserActions(onDone: (action: UserAction, userId: string) => void): {
  run: (action: UserAction, user: Target) => void;
  dialogs: ReactNode;
} {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [action, setAction] = useState<UserAction | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(next: UserAction, user: Target) {
    setAction(next);
    setTarget(user);
    setReason("");
    setConfirmEmail("");
    setError(null);
  }
  const close = () => !busy && setAction(null);
  const name = target ? `${target.firstName} ${target.lastName}` : "";

  async function submit() {
    if (!target || !action || !accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const path = `/api/admin/users/${target.id}/${action === "reset-2fa" ? "2fa/reset" : action}`;
      const body =
        action === "suspend" ? { reason } : action === "delete" ? { confirmEmail, reason: reason || undefined } : undefined;
      const res = await apiFetch<PasswordResetIssuedResponseDTO | unknown>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
        accessToken,
      });
      const messages: Record<UserAction, [string, string?]> = {
        suspend: [`${name} suspended`, "They've been signed out and can't sign in."],
        activate: [`${name} reactivated`],
        delete: ["Account deleted", "Personal details were removed; required records are retained."],
        "reset-password": [
          "Reset link sent",
          `Expires ${formatDateTime((res as PasswordResetIssuedResponseDTO).expiresAt)}.`,
        ],
        "reset-2fa": [`2FA reset for ${name}`, "They can sign in with their password and set it up again."],
      };
      toast.success(...messages[action]);
      setAction(null);
      onDone(action, target.id);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const dialogs = target && (
    <>
      <ConfirmDialog
        open={action === "suspend"}
        onClose={close}
        onConfirm={submit}
        loading={busy}
        confirmDisabled={reason.trim().length < 3 || reason.length > REASON_MAX}
        title={`Suspend ${name}?`}
        description="They'll be signed out immediately and won't be able to sign in until reactivated."
        confirmLabel="Suspend account"
      >
        <div className="space-y-3">
          {error && <Alert>{error}</Alert>}
          <Field label={<span className="flex justify-between">Reason <CharCount value={reason} max={REASON_MAX} /></span>} htmlFor="suspend-reason" hint="Recorded in the audit log. Not shared with the user.">
            <Textarea id="suspend-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Suspected fraudulent application activity" data-autofocus />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={action === "activate"}
        onClose={close}
        onConfirm={submit}
        loading={busy}
        tone="primary"
        title={`Reactivate ${name}?`}
        description="They'll be able to sign in again and will get an email letting them know."
        confirmLabel="Reactivate"
      >
        {error && <Alert>{error}</Alert>}
      </ConfirmDialog>

      <ConfirmDialog
        open={action === "reset-password"}
        onClose={close}
        onConfirm={submit}
        loading={busy}
        tone="primary"
        title="Send a password reset link?"
        description={`We'll email ${target.email} a single-use link that expires in 1 hour. Their current password keeps working until they use it.`}
        confirmLabel="Send link"
      >
        {error && <Alert>{error}</Alert>}
      </ConfirmDialog>

      <ConfirmDialog
        open={action === "reset-2fa"}
        onClose={close}
        onConfirm={submit}
        loading={busy}
        title="Reset two-factor authentication?"
        description="Only do this after verifying the person's identity out-of-band (e.g. a call to the phone number on file). Their backup codes stop working and they're signed out everywhere."
        confirmLabel="Reset 2FA"
      >
        {error && <Alert>{error}</Alert>}
      </ConfirmDialog>

      <ConfirmDialog
        open={action === "delete"}
        onClose={close}
        onConfirm={submit}
        loading={busy}
        confirmDisabled={confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()}
        title={`Delete ${name}'s account?`}
        description="This can't be undone. Their name, email and phone are erased and they can never sign in again. Submitted applications and commission records are kept for compliance."
        confirmLabel="Delete permanently"
      >
        <div className="space-y-3">
          {error && <Alert>{error}</Alert>}
          <Field label={<>Type <span className="font-mono text-gray-900">{target.email}</span> to confirm</>} htmlFor="delete-confirm">
            <Input id="delete-confirm" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" spellCheck={false} data-autofocus />
          </Field>
          <Field label="Reason (optional)" htmlFor="delete-reason">
            <Input id="delete-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer deletion request #1234" maxLength={REASON_MAX} />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );

  return { run, dialogs };
}
