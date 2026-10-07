import { Check, X } from "lucide-react";
import { PASSWORD_MIN_LENGTH } from "@insurance/shared";
import { cn } from "../ui/cn";

// Mirrors the API's newPasswordSchema, so the user knows before submitting.
export function passwordChecks(password: string) {
  return [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { label: "A letter", ok: /[A-Za-z]/.test(password) },
    { label: "A number", ok: /\d/.test(password) },
  ];
}

export function PasswordStrength({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1" aria-label="Password requirements">
      {passwordChecks(password).map((c) => (
        <li key={c.label} className={cn("flex items-center gap-1.5 text-xs", c.ok ? "text-green-700" : "text-gray-500")}>
          {c.ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
          {c.label}
          <span className="sr-only">{c.ok ? "(met)" : "(not met)"}</span>
        </li>
      ))}
    </ul>
  );
}
