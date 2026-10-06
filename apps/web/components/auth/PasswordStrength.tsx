"use client";

import { Check, X } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { PASSWORD_MIN_LENGTH } from "@insurance/shared";
import { cn } from "../ui/cn";

// Mirrors the API's newPasswordSchema, so the user knows before submitting.
export function passwordChecks(password: string, t?: TFunction) {
  return [
    { label: t ? t("auth.ruleLength", { count: PASSWORD_MIN_LENGTH }) : `At least ${PASSWORD_MIN_LENGTH} characters`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { label: t ? t("auth.ruleLetter") : "A letter", ok: /[A-Za-z]/.test(password) },
    { label: t ? t("auth.ruleNumber") : "A number", ok: /\d/.test(password) },
  ];
}

export function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation();
  return (
    <ul className="mt-2 space-y-1" aria-label={t("auth.passwordRequirements")}>
      {passwordChecks(password, t).map((c) => (
        <li key={c.label} className={cn("flex items-center gap-1.5 text-xs", c.ok ? "text-green-700" : "text-gray-500")}>
          {c.ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
          {c.label}
          <span className="sr-only">{c.ok ? t("auth.ruleMet") : t("auth.ruleNotMet")}</span>
        </li>
      ))}
    </ul>
  );
}
