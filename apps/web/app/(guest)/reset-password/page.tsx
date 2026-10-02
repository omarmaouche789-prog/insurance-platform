"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Link2Off } from "lucide-react";
import type { PasswordResetValidateResponseDTO } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../lib/api";
import { AuthCard } from "../../../components/auth/AuthCard";
import { PasswordStrength, passwordChecks } from "../../../components/auth/PasswordStrength";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { Field, Input } from "../../../components/ui/Field";
import { Alert, LoadingState } from "../../../components/ui/States";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<PasswordResetValidateResponseDTO | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Read the token from the URL after mount (no Suspense boundary needed),
  // then strip it from the address bar so it doesn't linger in history.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) {
      setInvalid("This link is missing its reset token.");
      return;
    }
    setToken(t);
    window.history.replaceState(null, "", "/reset-password");
    apiFetch<PasswordResetValidateResponseDTO>("/api/auth/password-reset/validate", { method: "POST", body: JSON.stringify({ token: t }) })
      .then(setInfo)
      .catch((err) => setInvalid(describeApiError(err, "This link is invalid or has expired.")));
  }, []);

  const valid = passwordChecks(password).every((c) => c.ok);
  const matches = password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !valid || !matches) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <AuthCard icon={<Link2Off className="h-5 w-5" />} title="Link expired" description={invalid}>
        <ButtonLink href="/forgot-password" variant="primary" className="w-full">
          Request a new link
        </ButtonLink>
      </AuthCard>
    );
  }
  if (!info) return <LoadingState className="min-h-[60vh]" label="Checking your link…" />;

  if (done) {
    return (
      <AuthCard
        icon={<CheckCircle2 className="h-5 w-5" />}
        title={info.purpose === "INVITE" ? "You're all set" : "Password updated"}
        description="Sign in with your new password. For your security, any other sessions were signed out."
      >
        <ButtonLink href="/login" variant="primary" className="w-full">
          Continue to sign in
        </ButtonLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={<KeyRound className="h-5 w-5" />}
      title={info.purpose === "INVITE" ? `Welcome, ${info.firstName}` : "Choose a new password"}
      description={
        info.purpose === "INVITE"
          ? `Set a password to activate your account (${info.email}).`
          : `For ${info.email}. You'll be signed out everywhere else.`
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          <PasswordStrength password={password} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={confirm && !matches ? "Passwords don't match" : null}>
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={Boolean(confirm) && !matches} required />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!valid || !matches}>
          {info.purpose === "INVITE" ? "Activate account" : "Update password"}
        </Button>
      </form>
    </AuthCard>
  );
}
