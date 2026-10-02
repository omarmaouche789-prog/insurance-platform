"use client";

import { useState } from "react";
import { Check, Copy, Download, Printer } from "lucide-react";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

export function backupCodesText(codes: string[], email: string): string {
  return [
    "Insurance Marketplace — two-factor backup codes",
    `Account: ${email}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "Each code works once. Keep them somewhere safe, like a password manager.",
    "",
    ...codes.map((c, i) => `${String(i + 1).padStart(2, " ")}. ${c}`),
    "",
  ].join("\n");
}

// The one and only time plaintext backup codes are shown.
export function BackupCodesPanel({ codes, email }: { codes: string[]; email: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  function download() {
    const url = URL.createObjectURL(new Blob([backupCodesText(codes, email)], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "insurance-marketplace-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy", "Your browser blocked clipboard access. Download the codes instead.");
    }
  }

  function print() {
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    const pre = w.document.createElement("pre");
    pre.textContent = backupCodesText(codes, email);
    pre.style.font = "14px/1.6 ui-monospace, monospace";
    w.document.body.appendChild(pre);
    w.print();
  }

  return (
    <div>
      <ol className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-sm sm:gap-3" aria-label="Backup codes">
        {codes.map((c, i) => (
          <li key={c} className="flex items-center gap-2 rounded-md bg-white px-3 py-2 tracking-wider text-gray-900 shadow-sm">
            <span className="w-5 text-right text-xs text-gray-400">{i + 1}.</span>
            {c}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={<Download className="h-3.5 w-3.5" />} onClick={download}>
          Download
        </Button>
        <Button size="sm" icon={copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={print}>
          Print
        </Button>
      </div>
    </div>
  );
}
