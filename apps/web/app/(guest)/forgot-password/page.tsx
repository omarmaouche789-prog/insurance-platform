"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck, KeyRound } from "lucide-react";
import { apiFetch, describeApiError } from "../../../lib/api";
import { AuthCard } from "../../../components/auth/AuthCard";
import { Button } from "../../../components/ui/Button";
import { Field, Input } from "../../../components/ui/Field";
import { Alert } from "../../../components/ui/States";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthCard
        icon={<MailCheck className="h-5 w-5" />}
        title="Check your email"
        description={
          <>
            If an account exists for <strong className="text-gray-900">{email}</strong>, we&apos;ve sent a link to reset your password. It expires in 1 hour.
          </>
        }
        footer={<Link href="/login" className="hover:text-gray-900">← Back to sign in</Link>}
      >
        <Button className="w-full" onClick={() => setSent(false)}>
          Use a different email
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={<KeyRound className="h-5 w-5" />}
      title="Reset your password"
      description="Enter the email you sign in with and we'll send you a reset link."
      footer={<Link href="/login" className="hover:text-gray-900">← Back to sign in</Link>}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
