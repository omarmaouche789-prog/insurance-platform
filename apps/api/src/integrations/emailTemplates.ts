import { env } from "../lib/env";
import type { EmailMessage } from "./email";

// Every template is deliberately PHI-free: names, a confirmation number, and a
// link to sign in. Anything more specific (plan, health, reasons, document
// contents) stays in the portal.

type Template = Omit<EmailMessage, "to">;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function render(subject: string, greetingName: string, paragraphs: string[], cta: { label: string; path: string }): Template {
  const url = `${env.appUrl}${cta.path}`;
  const text = [`Hi ${greetingName},`, "", ...paragraphs.flatMap((p) => [p, ""]), `${cta.label}: ${url}`].join("\n");
  const html = [
    `<p>Hi ${escapeHtml(greetingName)},</p>`,
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<p><a href="${escapeHtml(url)}">${escapeHtml(cta.label)}</a></p>`,
    `<p style="color:#6b7280;font-size:12px">For your privacy, details are only available after you sign in.</p>`,
  ].join("\n");
  return { subject, text, html };
}

const applicationPath = (id: string) => `/account/applications/${id}`;

export const emailTemplates = {
  enrollmentConfirmation(p: { firstName: string; applicationId: string; confirmationNumber: string }): Template {
    return render(
      "We received your insurance application",
      p.firstName,
      [
        `Your application was sent to the carrier. Your confirmation number is ${p.confirmationNumber}.`,
        "We'll email you again once it has been reviewed.",
      ],
      { label: "View your application", path: applicationPath(p.applicationId) },
    );
  },

  carrierNeedsInfo(p: { firstName: string; applicationId: string }): Template {
    return render(
      "Update on your insurance application",
      p.firstName,
      ["The carrier needs more information before it can process your application. Your agent will follow up."],
      { label: "See what's needed", path: applicationPath(p.applicationId) },
    );
  },

  documentRequest(p: { firstName: string; applicationId: string; documentLabels: string[] }): Template {
    return render(
      "Your agent needs documents for your application",
      p.firstName,
      [`Please upload: ${p.documentLabels.join(", ")}.`],
      { label: "Upload documents", path: applicationPath(p.applicationId) },
    );
  },

  resubmissionOutcome(p: { firstName: string; applicationId: string; accepted: boolean; confirmationNumber: string | null }): Template {
    return render(
      p.accepted ? "Your application was resubmitted" : "Update on your insurance application",
      p.firstName,
      p.accepted
        ? [`Your agent resubmitted your application and the carrier accepted it. Confirmation number: ${p.confirmationNumber}.`]
        : ["Your agent resubmitted your application, but the carrier still needs more information. Your agent will follow up."],
      { label: "View your application", path: applicationPath(p.applicationId) },
    );
  },

  approval(p: { firstName: string; applicationId: string; confirmationNumber: string | null }): Template {
    return render(
      "Your insurance application was approved",
      p.firstName,
      [
        `Good news: your application${p.confirmationNumber ? ` (${p.confirmationNumber})` : ""} has been approved.`,
        "Your carrier will send your coverage documents.",
      ],
      { label: "View your application", path: applicationPath(p.applicationId) },
    );
  },

  rejectionToApplicant(p: { firstName: string; applicationId: string }): Template {
    return render(
      "Update on your insurance application",
      p.firstName,
      ["Your application was not approved. Sign in to see the reason and talk to your agent about other options."],
      { label: "View your application", path: applicationPath(p.applicationId) },
    );
  },

  rejectionToAgent(p: { agentFirstName: string; applicantName: string; applicationId: string }): Template {
    return render(
      "An application assigned to you was rejected",
      p.agentFirstName,
      [`The application for ${p.applicantName} was rejected in admin review.`],
      { label: "Open in the agent portal", path: `/agent/applications/${p.applicationId}` },
    );
  },
};
