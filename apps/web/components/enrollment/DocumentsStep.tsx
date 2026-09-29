"use client";

import { useState } from "react";
import type { ApplicationDTO, DocumentType } from "@insurance/shared";
import { MAX_DOCUMENT_BYTES, REQUIRED_DOCUMENT_TYPES } from "@insurance/shared";
import { DocumentUploadRow } from "../applications/DocumentUploadRow";

interface DocumentsStepProps {
  application: ApplicationDTO;
  accessToken: string;
  onUploaded: (application: ApplicationDTO) => void;
  onBack: () => void;
  onNext: () => void;
}

const HINTS: Partial<Record<DocumentType, string>> = {
  PHOTO_ID: "Driver's license, state ID, or passport.",
  PROOF_OF_ADDRESS: "Utility bill, lease, or bank statement from the last 90 days.",
};

export function DocumentsStep({ application, accessToken, onUploaded, onBack, onNext }: DocumentsStepProps) {
  const [uploadingCount, setUploadingCount] = useState(0);
  const uploaded = new Map(application.documents.map((d) => [d.type, d]));
  const complete = REQUIRED_DOCUMENT_TYPES.every((t) => uploaded.has(t));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">PDF, JPEG, or PNG, up to {MAX_DOCUMENT_BYTES / 1024 / 1024} MB each.</p>

      {REQUIRED_DOCUMENT_TYPES.map((type) => (
        <DocumentUploadRow
          key={type}
          applicationId={application.id}
          type={type}
          hint={HINTS[type]}
          existing={uploaded.get(type)}
          accessToken={accessToken}
          onUploadingChange={(u) => setUploadingCount((n) => n + (u ? 1 : -1))}
          onUploaded={onUploaded}
        />
      ))}

      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="text-sm text-gray-600 hover:underline">
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!complete || uploadingCount > 0}
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
