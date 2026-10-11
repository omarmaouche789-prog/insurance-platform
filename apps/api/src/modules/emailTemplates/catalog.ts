import type { EmailTemplateKey, EmailTemplateVariable } from "@insurance/shared";

// Built-in defaults for the admin-editable emails. A template row is created
// from these the first time it's needed, and "Revert to default" copies them
// back. Plain data (no app imports) so prisma/seed.ts can use it too.
//
// Every default is PHI-free: a name, a reference and a link to sign in.
// Rejection reasons and document-request messages stay in the portal.

export interface EmailTemplateDefinition {
  name: string;
  description: string;
  variables: EmailTemplateVariable[];
  subject: string;
  body: string; // HTML, in the shape the rich text editor produces
  // The button added below the body. Not editable, so links can't break.
  callToAction: { label: string; path: (applicationId: string) => string };
}

const applicationPath = (id: string) => `/account/applications/${id}`;
const COMMON: EmailTemplateVariable[] = ["userName", "appId", "status", "agentName"];

export const EMAIL_TEMPLATE_CATALOG: Record<EmailTemplateKey, EmailTemplateDefinition> = {
  APPLICATION_SUBMITTED: {
    name: "Application Submitted",
    description: "Confirmation to the applicant once the carrier receives their application.",
    variables: [...COMMON, "confirmationNumber"],
    subject: "We received your insurance application",
    body:
      "<p>Hi {userName},</p>" +
      "<p>Your application was sent to the carrier. Your confirmation number is <strong>{confirmationNumber}</strong>.</p>" +
      "<p>We'll email you again once it has been reviewed.</p>",
    callToAction: { label: "View your application", path: applicationPath },
  },
  APPLICATION_APPROVED: {
    name: "Application Approved",
    description: "Tells the applicant an admin approved their application.",
    variables: [...COMMON],
    subject: "Your insurance application was approved",
    body:
      "<p>Hi {userName},</p>" +
      "<p>Good news: your application {appId} has been approved.</p>" +
      "<p>Your carrier will send your coverage documents.</p>",
    callToAction: { label: "View your application", path: applicationPath },
  },
  APPLICATION_REJECTED: {
    name: "Application Rejected",
    description: "Tells the applicant their application wasn't approved. The reason is only shown in the portal.",
    variables: [...COMMON],
    subject: "Update on your insurance application",
    body:
      "<p>Hi {userName},</p>" +
      "<p>Your application {appId} was not approved. Sign in to see the reason and talk to {agentName} about other options.</p>",
    callToAction: { label: "View your application", path: applicationPath },
  },
  AGENT_ASSIGNED: {
    name: "Agent Assigned",
    description: "Introduces the licensed agent assigned to the applicant's application.",
    variables: [...COMMON],
    subject: "Meet your licensed insurance agent",
    body:
      "<p>Hi {userName},</p>" +
      "<p>{agentName}, a licensed insurance agent, is now looking after your application {appId}.</p>" +
      "<p>They'll review it with you and reach out if anything else is needed.</p>",
    callToAction: { label: "View your application", path: applicationPath },
  },
  DOCUMENTS_REQUESTED: {
    name: "Documents Requested",
    description: "An agent asked the applicant for more documents.",
    variables: [...COMMON, "documents"],
    subject: "Your agent needs documents for your application",
    body:
      "<p>Hi {userName},</p>" +
      "<p>{agentName} needs a few more documents for your application {appId}.</p>" +
      "<p>Please upload: {documents}.</p>",
    callToAction: { label: "Upload documents", path: applicationPath },
  },
};
