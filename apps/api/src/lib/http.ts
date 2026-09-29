// Small HTTP client shared by the outbound integrations (SendGrid, Smarty,
// carrier APIs): per-attempt timeout plus retries with exponential backoff
// and jitter for transient failures only.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  // Total attempts including the first.
  maxAttempts: number;
  timeoutMs: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

export interface HttpResult {
  response: Response;
  attempts: number;
  durationMs: number;
}

// Thrown when every attempt failed at the transport level (DNS, reset,
// timeout) or kept returning a retryable status.
export class HttpRetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastStatus: number | null,
    public readonly durationMs: number,
  ) {
    super(message);
  }
}

// 408 timeout, 425 too early, 429 rate limited, and 5xx are worth retrying;
// other 4xx mean the request itself is wrong.
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

// Honors Retry-After (seconds or HTTP date) when present, else exponential
// backoff with full jitter.
export function retryDelayMs(attempt: number, opts: Pick<RetryOptions, "baseDelayMs" | "maxDelayMs">, retryAfter: string | null, random = Math.random): number {
  const cap = opts.maxDelayMs ?? 10_000;
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const ms = Number.isFinite(seconds) ? seconds * 1000 : new Date(retryAfter).getTime() - Date.now();
    if (Number.isFinite(ms) && ms >= 0) return Math.min(ms, cap);
  }
  return Math.min(cap, opts.baseDelayMs * 2 ** (attempt - 1)) * random();
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOptions): Promise<HttpResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const started = Date.now();
  let lastError = "no attempts made";
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    let retryAfter: string | null = null;
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs) });
      if (!isRetryableStatus(response.status) || attempt === opts.maxAttempts) {
        if (isRetryableStatus(response.status)) {
          throw new HttpRetryExhaustedError(
            `HTTP ${response.status} after ${attempt} attempts`,
            attempt,
            response.status,
            Date.now() - started,
          );
        }
        return { response, attempts: attempt, durationMs: Date.now() - started };
      }
      lastStatus = response.status;
      lastError = `HTTP ${response.status}`;
      retryAfter = response.headers.get("retry-after");
      // Drain the body so the connection can be reused.
      await response.body?.cancel().catch(() => undefined);
    } catch (err) {
      if (err instanceof HttpRetryExhaustedError) throw err;
      lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      lastStatus = null;
    }
    if (attempt < opts.maxAttempts) await sleep(retryDelayMs(attempt, opts, retryAfter));
  }

  throw new HttpRetryExhaustedError(
    `${lastError} after ${opts.maxAttempts} attempts`,
    opts.maxAttempts,
    lastStatus,
    Date.now() - started,
  );
}
