export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    // Zod's flatten() output from the API's 400 responses, when present.
    public fieldErrors: Record<string, string[] | undefined> = {},
  ) {
    super(message);
  }
}

// Requests are same-origin thanks to the Next.js rewrite in next.config.js,
// which proxies /api/* to the Express server — so the refresh-token cookie
// stays first-party even though the two apps run on different ports in dev.
export async function apiFetch<T>(path: string, options: RequestInit & { accessToken?: string } = {}): Promise<T> {
  const { accessToken, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  // FormData bodies need the browser to set a multipart boundary itself.
  if (!(rest.body instanceof FormData)) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (accessToken) {
    finalHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(path, { ...rest, headers: finalHeaders, credentials: "include" });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error ?? `Request to ${path} failed with ${res.status}`,
      body?.details?.fieldErrors ?? {},
    );
  }

  return body as T;
}

// Human-readable message for an error, including nested field errors like
// "personal.ssn" that Zod reports under the top-level key.
export function describeApiError(err: unknown, fallback = "Something went wrong"): string {
  if (!(err instanceof ApiError)) return fallback;
  const details = Object.values(err.fieldErrors).flat().filter(Boolean);
  return details.length ? `${err.message}: ${details.join("; ")}` : err.message;
}
