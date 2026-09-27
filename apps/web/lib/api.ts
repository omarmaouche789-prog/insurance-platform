export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Requests are same-origin thanks to the Next.js rewrite in next.config.js,
// which proxies /api/* to the Express server — so the refresh-token cookie
// stays first-party even though the two apps run on different ports in dev.
export async function apiFetch<T>(path: string, options: RequestInit & { accessToken?: string } = {}): Promise<T> {
  const { accessToken, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  finalHeaders.set("Content-Type", "application/json");
  if (accessToken) {
    finalHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(path, { ...rest, headers: finalHeaders, credentials: "include" });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Request to ${path} failed with ${res.status}`);
  }

  return body as T;
}
