import { ApiError } from "./api";

// Downloads an authenticated file. A plain <a href> can't send the Bearer
// token, so fetch it as a blob and hand the browser an object URL instead.
export async function downloadWithAuth(path: string, accessToken: string, fallbackName: string): Promise<void> {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? `Download failed with ${res.status}`);
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;

  const url = URL.createObjectURL(await res.blob());
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Give the browser a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
