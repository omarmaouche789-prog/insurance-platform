"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { ApiError } from "../../../lib/api";
import { useNextPath } from "../../../lib/next-path";

export default function RegisterPage() {
  const { register } = useAuth();
  const next = useNextPath();
  const router = useRouter();

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          className="w-full rounded border border-gray-300 px-3 py-2"
          placeholder="First name"
          value={form.firstName}
          onChange={update("firstName")}
          required
        />
        <input
          className="w-full rounded border border-gray-300 px-3 py-2"
          placeholder="Last name"
          value={form.lastName}
          onChange={update("lastName")}
          required
        />
        <input
          type="email"
          className="w-full rounded border border-gray-300 px-3 py-2"
          placeholder="Email"
          value={form.email}
          onChange={update("email")}
          required
        />
        <input
          type="password"
          className="w-full rounded border border-gray-300 px-3 py-2"
          placeholder="Password (min 8 characters)"
          value={form.password}
          onChange={update("password")}
          minLength={8}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
        >
          Register
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
