"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { ApiError } from "../../../lib/api";
import { useNextPath } from "../../../lib/next-path";
import { AuthCard } from "../../../components/auth/AuthCard";
import { OtpInput } from "../../../components/security/OtpInput";
import { Button } from "../../../components/ui/Button";
import { Field, Input } from "../../../components/ui/Field";
import { Alert } from "../../../components/ui/States";

export default function LoginPage() {
  const { login, completeTwoFactor } = useAuth();
  const { t } = useTranslation();
  const next = useNextPath();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await login({ email, password });
      if (res.status === "2fa_required") {
        setChallengeToken(res.challengeToken);
      } else {
        router.push(next ?? portalPathForRole(res.user.role));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTwoFactor(value = code) {
    if (!challengeToken || !value) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await completeTwoFactor(challengeToken, value);
      router.push(next ?? portalPathForRole(res.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.somethingWentWrong"));
      setCode("");
      // The challenge only lives 5 minutes; send them back to the password step.
      if (err instanceof ApiError && err.status === 401 && /expired/i.test(err.message)) setChallengeToken(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (challengeToken) {
    return (
      <AuthCard
        icon={useBackup ? <KeyRound className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
        title={useBackup ? t("auth.backupTitle") : t("auth.twoFactorTitle")}
        description={
          useBackup ? t("auth.backupDescription") : t("auth.twoFactorDescription")
        }
        footer={
          <button type="button" className="hover:text-gray-900" onClick={() => { setChallengeToken(null); setCode(""); setError(null); }}>
            {t("auth.backToSignIn")}
          </button>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleTwoFactor();
          }}
          className="space-y-5"
        >
          {useBackup ? (
            <Field label={t("auth.backupCode")} htmlFor="backup-code">
              <Input
                id="backup-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXXX-XXXXX"
                autoComplete="off"
                autoFocus
                className="text-center font-mono text-base tracking-widest"
                maxLength={11}
                required
              />
            </Field>
          ) : (
            <OtpInput value={code} onChange={setCode} onComplete={(v) => void handleTwoFactor(v)} disabled={submitting} invalid={Boolean(error)} autoFocus />
          )}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="primary" className="w-full" loading={submitting} disabled={useBackup ? code.length < 10 : code.length !== 6}>
            {t("auth.verify")}
          </Button>
          <div className="text-center">
            <button
              type="button"
              className="text-sm font-medium text-indigo-600 hover:underline"
              onClick={() => {
                setUseBackup((b) => !b);
                setCode("");
                setError(null);
              }}
            >
              {useBackup ? t("auth.useApp") : t("auth.useBackup")}
            </button>
          </div>
          {useBackup && (
            <p className="text-center text-xs text-gray-500">{t("auth.noBackupCodes")}</p>
          )}
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={<LogIn className="h-5 w-5" />}
      title={t("auth.loginTitle")}
      description={t("auth.loginDescription")}
      footer={
        <>
          {t("auth.noAccount")}{" "}
          <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-medium text-indigo-600 hover:underline">
            {t("auth.createOne")}
          </Link>
        </>
      }
    >
      <form onSubmit={handleLogin} className="space-y-4">
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" dir="ltr" type="text" inputMode="email" autoCapitalize="none" spellCheck={false} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field
          label={
            <span className="flex items-center justify-between">
              {t("auth.password")}
              <Link href="/forgot-password" className="text-xs font-medium text-indigo-600 hover:underline">
                {t("auth.forgotPassword")}
              </Link>
            </span>
          }
          htmlFor="password"
        >
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="primary" className="w-full" loading={submitting}>
          {t("auth.signIn")}
        </Button>
      </form>
    </AuthCard>
  );
}
