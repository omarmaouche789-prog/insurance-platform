import "server-only";

// Server components can't use the browser-side /api rewrite, so they call
// the API directly at the same base URL next.config.js proxies to.
const API_BASE_URL = (process.env.API_BASE_URL ?? `http://localhost:${process.env.API_PORT ?? "4000"}`).replace(/\/+$/, "");

export async function serverApi<T>(path: string, revalidateSeconds = 60): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { next: { revalidate: revalidateSeconds } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API ${path} responded ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    throw err;
  }
}
