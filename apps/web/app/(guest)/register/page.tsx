"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { ApiError } from "../../../lib/api";
import { useNextPath } from "../../../lib/next-path";
import { AuthCard } from "../../../components/auth/AuthCard";
import { PasswordStrength, passwordChecks } from "../../../components/auth/PasswordStrength";
import { Button } from "../../../components/ui/Button";
import { Field, Input } from "../../../components/ui/Field";
import { Alert } from "../../../components/ui/States";

export default function RegisterPage() {
  const { register } = useAuth();
  const next = useNextPath();
  const router = useRouter();

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordOk = passwordChecks(form.password).every((c) => c.ok);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await register(form);
      router.push(next ?? portalPathForRole(res.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      icon={<UserPlus className="h-5 w-5" />}
      title="Create your account"
      description="Save plans and track your applications in one place."
      footer={
        <>
          Already have an account?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-indigo-600 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="firstName">
            <Input id="firstName" autoComplete="given-name" value={form.firstName} onChange={update("firstName")} required autoFocus />
          </Field>
          <Field label="Last name" htmlFor="lastName">
            <Input id="lastName" autoComplete="family-name" value={form.lastName} onChange={update("lastName")} required />
          </Field>
        </div>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={update("email")} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={update("password")} required />
          <PasswordStrength password={form.password} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="primary" className="w-full" loading={submitting} disabled={!passwordOk}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
