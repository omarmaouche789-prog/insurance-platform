"use client";

import { useState } from "react";
import type { SystemSettingsResponseDTO } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useSiteSettings } from "../../../lib/site-settings";
import { useToast } from "../../ui/Toast";

// Sends one settings write, then updates the page and the site-wide settings
// (header, date formats, maintenance) so the change shows up right away.
export function useSettingsSave(onSaved: (res: SystemSettingsResponseDTO) => void) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const { refresh } = useSiteSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(id: string, path: string, method: "PUT" | "POST", body: unknown, success: string): Promise<boolean> {
    if (!accessToken) return false;
    setBusy(id);
    setError(null);
    try {
      const res = await apiFetch<SystemSettingsResponseDTO>(`/api/admin/settings${path}`, { method, accessToken, body: JSON.stringify(body) });
      onSaved(res);
      toast.success(success);
      void refresh();
      return true;
    } catch (err) {
      const message = describeApiError(err, "Couldn't save settings");
      setError(message);
      toast.error("Not saved", message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { save, busy, error, clearError: () => setError(null) };
}
