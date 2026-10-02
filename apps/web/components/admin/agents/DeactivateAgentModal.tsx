"use client";

import { useEffect, useState } from "react";
import type { AdminAgentDTO, DeactivateAgentResponseDTO } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { Checkbox, Field, Input } from "../../ui/Field";
import { ConfirmDialog } from "../../ui/Modal";
import { Alert } from "../../ui/States";

export function DeactivateAgentModal({
  agent,
  onClose,
  onDone,
}: {
  agent: AdminAgentDTO | null;
  onClose: () => void;
  onDone: (res: DeactivateAgentResponseDTO) => void;
}) {
  const { accessToken } = useAuth();
  const [reason, setReason] = useState("");
  const [reassign, setReassign] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setReassign(true);
    setError(null);
  }, [agent]);

  async function submit() {
    if (!agent || !accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<DeactivateAgentResponseDTO>(`/api/admin/agents/${agent.id}/deactivate`, {
        method: "POST",
        body: JSON.stringify({ reassignOpen: reassign, reason: reason || undefined }),
        accessToken,
      });
      onDone(res);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={agent !== null}
      onClose={() => !busy && onClose()}
      onConfirm={submit}
      loading={busy}
      title={agent ? `Deactivate ${agent.firstName} ${agent.lastName}?` : ""}
      description="They'll be signed out and stop receiving new applications. Their applications, commissions and audit history are kept."
      confirmLabel="Deactivate"
    >
      {agent && (
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          {agent.performance.openApplications > 0 && (
            <Alert tone="amber">
              {agent.performance.openApplications} open application{agent.performance.openApplications === 1 ? "" : "s"} assigned.
            </Alert>
          )}
          <Checkbox
            checked={reassign}
            onChange={(e) => setReassign(e.target.checked)}
            label="Reassign their unsubmitted applications to other agents in the same state"
          />
          <p className="-mt-2 pl-6 text-xs text-gray-500">Submitted applications stay with them (their commission is already booked) and finish through admin review.</p>
          <Field label="Reason (optional)" htmlFor="deactivate-reason">
            <Input id="deactivate-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Left the agency" />
          </Field>
        </div>
      )}
    </ConfirmDialog>
  );
}
