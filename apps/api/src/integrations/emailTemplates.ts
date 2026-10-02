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

  twoFactorEnabled(p: { firstName: string }): Template {
    return render(
      "Two-factor authentication is on",
      p.firstName,
      [
        "Two-factor authentication was just turned on for your account. You'll be asked for a code from your authenticator app when you sign in.",
        "If this wasn't you, reset your password and contact support right away.",
      ],
      { label: "Review your security settings", path: "/login" },
    );
  },

  twoFactorDisabled(p: { firstName: string; byAdmin: boolean }): Template {
    return render(
      "Two-factor authentication was turned off",
      p.firstName,
      [
        p.byAdmin
          ? "An administrator reset two-factor authentication on your account, as part of account recovery. Set it up again after you sign in."
          : "Two-factor authentication was just turned off for your account.",
        "If you didn't ask for this, reset your password and contact support right away.",
      ],
      { label: "Sign in", path: "/login" },
    );
  },

  backupCodesRegenerated(p: { firstName: string }): Template {
    return render(
      "New backup codes were generated",
      p.firstName,
      ["New two-factor backup codes were generated for your account. Your previous codes no longer work."],
      { label: "Sign in", path: "/login" },
    );
  },

  passwordReset(p: { firstName: string; token: string; expiresInHours: number; byAdmin: boolean }): Template {
    return render(
      "Reset your password",
      p.firstName,
      [
        p.byAdmin
          ? "An administrator started a password reset for your account."
          : "We received a request to reset your password.",
        `Use the link below to choose a new one. It expires in ${p.expiresInHours} hour${p.expiresInHours === 1 ? "" : "s"} and can only be used once.`,
        "If you didn't expect this, you can ignore this email — your password won't change.",
      ],
      { label: "Choose a new password", path: `/reset-password?token=${encodeURIComponent(p.token)}` },
    );
  },

  agentInvite(p: { firstName: string; token: string; expiresInHours: number }): Template {
    return render(
      "Your agent account is ready",
      p.firstName,
      [
        "An administrator created an agent account for you on Insurance Marketplace.",
        `Choose a password to finish setting it up. This link expires in ${p.expiresInHours} hours.`,
      ],
      { label: "Set your password", path: `/reset-password?token=${encodeURIComponent(p.token)}` },
    );
  },

  accountSuspended(p: { firstName: string }): Template {
    return render(
      "Your account has been suspended",
      p.firstName,
      ["Your account has been suspended and you can no longer sign in. Contact support if you think this is a mistake."],
      { label: "Contact support", path: "/" },
    );
  },

  accountReactivated(p: { firstName: string }): Template {
    return render(
      "Your account has been reactivated",
      p.firstName,
      ["Your account is active again. You can sign in as usual."],
      { label: "Sign in", path: "/login" },
    );
  },

  accountDeleted(p: { firstName: string }): Template {
    return render(
      "Your account has been deleted",
      p.firstName,
      [
        "Your Insurance Marketplace account has been deleted and you can no longer sign in.",
        "Records we're required to keep (such as submitted applications) are retained as the law requires. Contact support with any questions.",
      ],
      { label: "Visit Insurance Marketplace", path: "/" },
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
