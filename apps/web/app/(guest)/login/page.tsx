"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { ApiError } from "../../../lib/api";
import { useNextPath } from "../../../lib/next-path";

export default function LoginPage() {
  const { login, completeTwoFactor } = useAuth();
  const next = useNextPath();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
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
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await completeTwoFactor(challengeToken, code);
      router.push(next ?? portalPathForRole(res.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (challengeToken) {
    return (
      <div className="mx-auto max-w-sm px-6 py-16">
        <h1 className="text-xl font-semibold">Enter your 2FA code</h1>
        <form onSubmit={handleTwoFactor} className="mt-6 space-y-4">
          <input
            className="w-full rounded border border-gray-300 px-3 py-2"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
          >
            Verify
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-xl font-semibold">Log in</h1>
      <form onSubmit={handleLogin} className="mt-6 space-y-4">
        <input
          type="email"
          className="w-full rounded border border-gray-300 px-3 py-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full rounded border border-gray-300 px-3 py-2"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
        >
          Log in
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        No account yet?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="underline">
          Register
        </Link>
      </p>
    </div>
  );
}
