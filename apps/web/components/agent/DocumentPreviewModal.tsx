"use client";

import { useEffect, useState } from "react";
import { Download, ZoomIn, ZoomOut } from "lucide-react";
import type { ApplicationDocumentDTO } from "@insurance/shared";
import { DOCUMENT_TYPE_LABELS } from "@insurance/shared";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { downloadWithAuth } from "../../lib/download";
import { formatBytes } from "../applications/DocumentUploadRow";
import { Button, IconButton } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { ErrorState, LoadingState } from "../ui/States";

// In-browser viewer for applicant uploads. The file is fetched with the
// agent's token (every fetch is audit-logged server-side) and shown from a
// short-lived object URL that's revoked on close.
export function DocumentPreviewModal({ applicationId, document, onClose }: { applicationId: string; document: ApplicationDocumentDTO | null; onClose: () => void }) {
  const { accessToken } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const path = document ? `/api/agent/applications/${applicationId}/documents/${document.id}` : null;

  useEffect(() => {
    if (!path || !accessToken) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    setZoom(1);
    fetch(path, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new ApiError(res.status, body?.error ?? "Couldn't load the document");
        }
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load the document"));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, accessToken]);

  const isPdf = document?.mimeType === "application/pdf";
  return (
    <Modal
      open={document !== null}
      onClose={onClose}
      size="xl"
      title={document ? DOCUMENT_TYPE_LABELS[document.type] : ""}
      description={document ? `${document.fileName} · ${formatBytes(document.sizeBytes)} · uploaded ${new Date(document.uploadedAt).toLocaleString()}` : undefined}
      footer={
        <>
          {!isPdf && url && (
            <span className="mr-auto flex items-center gap-1">
              <IconButton label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><ZoomOut className="h-4 w-4" /></IconButton>
              <span className="w-12 text-center text-xs tabular-nums text-gray-500">{Math.round(zoom * 100)}%</span>
              <IconButton label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}><ZoomIn className="h-4 w-4" /></IconButton>
            </span>
          )}
          <Button
            icon={<Download className="h-4 w-4" />}
            disabled={!document || !accessToken}
            onClick={() => document && accessToken && void downloadWithAuth(path!, accessToken, document.fileName)}
          >
            Download
          </Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="flex h-[65vh] items-center justify-center overflow-auto rounded-lg bg-gray-100">
        {error ? (
          <ErrorState message={error} />
        ) : !url ? (
          <LoadingState label="Loading document…" />
        ) : isPdf ? (
          <iframe src={url} title={document?.fileName ?? "Document"} className="h-full w-full rounded-lg bg-[#fff]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- blob: URL of a private upload
          <img src={url} alt={document ? DOCUMENT_TYPE_LABELS[document.type] : ""} style={{ transform: `scale(${zoom})` }} className="max-h-full max-w-full origin-center object-contain transition-transform" />
        )}
      </div>
    </Modal>
  );
}
