"use client";

import { useMemo } from "react";
import type { EmailTemplateVariable } from "@insurance/shared";
import { EMAIL_TEMPLATE_VARIABLE_INFO } from "@insurance/shared";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const SAMPLES = Object.fromEntries(
  Object.entries(EMAIL_TEMPLATE_VARIABLE_INFO).map(([k, v]) => [k, v.sample]),
) as Record<EmailTemplateVariable, string>;

// Merged values are wrapped in a <mark> so admins can see what the platform
// fills in. Placeholders the template can't use are flagged in red.
function highlight(html: string, allowed: readonly EmailTemplateVariable[], on: boolean): string {
  return html.replace(/\{(\w*)\}/g, (match, name: string) => {
    if (!(allowed as readonly string[]).includes(name)) {
      return `<mark class="bad" title="Not available in this template">${escapeHtml(match)}</mark>`;
    }
    const value = escapeHtml(SAMPLES[name as EmailTemplateVariable]);
    return on ? `<mark class="var" title="Variable: ${name}">${value}</mark>` : value;
  });
}

const STYLES = `
  body { margin: 0; background: #f3f4f6; font: 15px/1.6 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; }
  .meta { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 14px 24px; font-size: 13px; color: #6b7280; }
  .meta b { color: #111827; font-weight: 600; }
  .meta .subject { margin-top: 4px; font-size: 16px; color: #111827; font-weight: 600; }
  .card { background: #fff; margin: 20px; padding: 24px 28px; border-radius: 10px; border: 1px solid #e5e7eb; }
  .card p { margin: 0 0 14px; }
  .card h2, .card h3, .card h4 { margin: 18px 0 8px; line-height: 1.3; }
  .card ul, .card ol { margin: 0 0 14px; padding-left: 22px; }
  .card blockquote { margin: 0 0 14px; padding-left: 12px; border-left: 3px solid #d1d5db; color: #4b5563; }
  .card a { color: #1e3a5f; }
  .cta { display: inline-block; margin-top: 6px; background: #1e3a5f; color: #fff !important; text-decoration: none; padding: 9px 16px; border-radius: 8px; font-weight: 600; font-size: 14px; }
  .fixed { margin-top: 18px; padding-top: 14px; border-top: 1px dashed #e5e7eb; }
  .note { font-size: 12px; color: #6b7280; margin: 10px 0 0 !important; }
  .tag { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px !important; }
  mark.var { background: #fef3c7; color: #92400e; border-radius: 3px; padding: 0 3px; }
  mark.bad { background: #fee2e2; color: #b91c1c; border-radius: 3px; padding: 0 3px; }
  .empty { color: #9ca3af; font-style: italic; }
`;

export function TemplatePreview({
  subject,
  body,
  variables,
  callToAction,
  highlightVariables,
}: {
  subject: string;
  body: string;
  variables: readonly EmailTemplateVariable[];
  callToAction: string;
  highlightVariables: boolean;
}) {
  const doc = useMemo(() => {
    const subjectHtml = subject.trim() ? highlight(escapeHtml(subject), variables, highlightVariables) : `<span class="empty">No subject</span>`;
    const bodyHtml = body.trim() ? highlight(body, variables, highlightVariables) : `<p class="empty">The email body is empty.</p>`;
    return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLES}</style></head><body>
      <div class="meta">
        <div><b>From</b> Insurance Marketplace &nbsp;·&nbsp; <b>To</b> uma@example.com</div>
        <div class="subject">${subjectHtml}</div>
      </div>
      <div class="card">
        ${bodyHtml}
        <div class="fixed">
          <p class="tag">Added automatically</p>
          <a class="cta">${escapeHtml(callToAction)}</a>
          <p class="note">For your privacy, details are only available after you sign in.</p>
        </div>
      </div>
    </body></html>`;
  }, [subject, body, variables, callToAction, highlightVariables]);

  // Sandboxed with no permissions: the preview can't run scripts or navigate.
  return <iframe title="Email preview" sandbox="" srcDoc={doc} className="h-[520px] w-full rounded-lg border border-gray-200 bg-[#f3f4f6]" />;
}
