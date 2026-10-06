"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { ApiError } from "../../../lib/api";
import { useLocale } from "../../../lib/i18n/LocaleProvider";
import { useNextPath } from "../../../lib/next-path";
import { AuthCard } from "../../../components/auth/AuthCard";
import { PasswordStrength, passwordChecks } from "../../../components/auth/PasswordStrength";
import { Button } from "../../../components/ui/Button";
import { Field, Input } from "../../../components/ui/Field";
import { Alert } from "../../../components/ui/States";

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useTranslation();
  const { locale } = useLocale();
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
      // The language they were browsing in becomes their saved preference.
      const res = await register({ ...form, locale });
      router.push(next ?? portalPathForRole(res.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      icon={<UserPlus className="h-5 w-5" />}
      title={t("auth.registerTitle")}
      description={t("auth.registerDescription")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-indigo-600 hover:underline">
            {t("auth.logIn")}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("auth.firstName")} htmlFor="firstName">
            <Input id="firstName" autoComplete="given-name" value={form.firstName} onChange={update("firstName")} required autoFocus />
          </Field>
          <Field label={t("auth.lastName")} htmlFor="lastName">
            <Input id="lastName" autoComplete="family-name" value={form.lastName} onChange={update("lastName")} required />
          </Field>
        </div>
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" dir="ltr" value={form.email} onChange={update("email")} required />
        </Field>
        <Field label={t("auth.password")} htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={update("password")} required />
          <PasswordStrength password={form.password} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="primary" className="w-full" loading={submitting} disabled={!passwordOk}>
          {t("auth.createAccount")}
        </Button>
      </form>
    </AuthCard>
  );
}
