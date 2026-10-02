"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, QrCode, ShieldCheck } from "lucide-react";
import type { BackupCodesResponseDTO, TwoFactorEnableResponseDTO } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { Alert, LoadingState } from "../ui/States";
import { cn } from "../ui/cn";
import { BackupCodesPanel } from "./BackupCodesPanel";
import { OtpInput } from "./OtpInput";

type Step = "scan" | "verify" | "codes";
const STEPS: Array<{ key: Step; label: string }> = [
  { key: "scan", label: "Scan" },
  { key: "verify", label: "Verify" },
  { key: "codes", label: "Save codes" },
];

// Groups the base32 secret in fours so it's easier to type by hand.
const groupSecret = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();

export function TwoFactorSetupModal({ open, onClose, onEnabled }: { open: boolean; onClose: () => void; onEnabled: () => void }) {
  const { accessToken, user } = useAuth();
  const [step, setStep] = useState<Step>("scan");
  const [setup, setSetup] = useState<TwoFactorEnableResponseDTO | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Each time the dialog opens, start a fresh enrollment.
  useEffect(() => {
    if (!open || !accessToken) return;
    setStep("scan");
    setSetup(null);
    setCode("");
    setCodes(null);
    setSaved(false);
    setError(null);
    apiFetch<TwoFactorEnableResponseDTO>("/api/users/me/2fa/enable", { method: "POST", accessToken })
      .then(setSetup)
      .catch((err) => setError(describeApiError(err, "Couldn't start setup")));
  }, [open, accessToken]);

  async function verify(value = code) {
    if (value.length !== 6 || !accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<BackupCodesResponseDTO>("/api/users/me/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ code: value }),
        accessToken,
      });
      setCodes(res.backupCodes);
      setStep("codes");
      onEnabled();
    } catch (err) {
      setError(describeApiError(err, "That code didn't work"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  // Once 2FA is on, the dialog can only be closed after acknowledging the codes.
  const canDismiss = step !== "codes" || saved;

  return (
    <Modal
      open={open}
      onClose={canDismiss ? onClose : () => undefined}
      dismissible={canDismiss}
      size="md"
      title="Set up two-factor authentication"
      description="Protect your account with a code from an authenticator app every time you sign in."
      footer={
        step === "scan" ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!setup} onClick={() => setStep("verify")}>
              Continue
            </Button>
          </>
        ) : step === "verify" ? (
          <>
            <Button onClick={() => setStep("scan")} disabled={busy}>
              Back
            </Button>
            <Button variant="primary" loading={busy} disabled={code.length !== 6} onClick={() => verify()}>
              Verify and turn on
            </Button>
          </>
        ) : (
          <Button variant="primary" disabled={!saved} onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      <ol className="mb-5 flex items-center gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < stepIndex ? "bg-green-600 text-onaccent" : i === stepIndex ? "bg-indigo-600 text-onaccent" : "bg-gray-100 text-gray-500",
              )}
              aria-current={i === stepIndex ? "step" : undefined}
            >
              {i < stepIndex ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn("text-xs font-medium", i === stepIndex ? "text-gray-900" : "text-gray-500")}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-gray-200" aria-hidden />}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {step === "scan" &&
        (!setup ? (
          !error && <LoadingState label="Generating your secure key…" className="py-10" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <p>
                Open <strong className="text-gray-900">Google Authenticator</strong>, <strong className="text-gray-900">Authy</strong>,{" "}
                <strong className="text-gray-900">1Password</strong> or another authenticator app and scan this code.
              </p>
            </div>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL; next/image adds nothing here */}
              <img
                src={setup.qrCodeDataUrl}
                alt="QR code for your authenticator app"
                width={200}
                height={200}
                className="rounded-xl border border-gray-200 bg-[#fff] p-2"
              />
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <KeyRound className="h-3.5 w-3.5" aria-hidden /> Can&apos;t scan? Enter this key manually
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <code className="break-all font-mono text-sm tracking-wider text-gray-900">{groupSecret(setup.secret)}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  onClick={async () => {
                    await navigator.clipboard.writeText(setup.secret).catch(() => undefined);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          </div>
        ))}

      {step === "verify" && (
        <div className="space-y-4 py-2 text-center">
          <p className="text-sm text-gray-600">Enter the 6-digit code your app shows for Insurance Marketplace.</p>
          <OtpInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={busy} invalid={Boolean(error)} autoFocus />
          <p className="text-xs text-gray-400">Codes refresh every 30 seconds.</p>
        </div>
      )}

      {step === "codes" && codes && (
        <div className="space-y-4">
          <Alert tone="green">
            <span className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Two-factor authentication is on.
            </span>
          </Alert>
          <div>
            <p className="text-sm font-medium text-gray-900">Save your backup codes</p>
            <p className="mt-1 text-sm text-gray-500">
              If you lose your phone, each of these codes lets you sign in once. They won&apos;t be shown again.
            </p>
          </div>
          <BackupCodesPanel codes={codes} email={user?.email ?? ""} />
          <Checkbox checked={saved} onChange={(e) => setSaved(e.target.checked)} label="I've saved these codes somewhere safe" />
        </div>
      )}
    </Modal>
  );
}
