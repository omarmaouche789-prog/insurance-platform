"use client";

import { useState } from "react";
import type { ApplicationDTO, ApplicationDocumentDTO, DocumentType } from "@insurance/shared";
import { DOCUMENT_TYPE_LABELS, MAX_DOCUMENT_BYTES } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../lib/api";

interface DocumentUploadRowProps {
  applicationId: string;
  type: DocumentType;
  hint?: string;
  existing: ApplicationDocumentDTO | undefined;
  accessToken: string;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  onUploaded: (application: ApplicationDTO) => void;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentUploadRow({
  applicationId,
  type,
  hint,
  existing,
  accessToken,
  disabled,
  onUploadingChange,
  onUploaded,
}: DocumentUploadRowProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError(`File must be ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB or smaller.`);
      return;
    }
    setError(null);
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await apiFetch<{ application: ApplicationDTO }>(
        `/api/applications/${applicationId}/documents/${type}`,
        { method: "POST", body, accessToken },
      );
      onUploaded(res.application);
    } catch (err) {
      setError(describeApiError(err, "Upload failed"));
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{DOCUMENT_TYPE_LABELS[type]}</p>
          {hint && <p className="text-xs text-gray-500">{hint}</p>}
          {existing && (
            <p className="mt-2 text-sm text-green-700">
              ✓ {existing.fileName} <span className="text-gray-500">({formatBytes(existing.sizeBytes)})</span>
            </p>
          )}
        </div>
        <label
          className={`shrink-0 rounded border border-gray-300 px-3 py-1.5 text-sm ${
            disabled || uploading ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-gray-50"
          }`}
        >
          {uploading ? "Uploading..." : existing ? "Replace" : "Upload"}
          <input
            type="file"
            className="sr-only"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            disabled={disabled || uploading}
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
