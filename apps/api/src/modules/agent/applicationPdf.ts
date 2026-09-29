import PDFDocument from "pdfkit";
import type { AgentApplicationDTO } from "@insurance/shared";
import { DOCUMENT_TYPE_LABELS, HEALTH_CONDITION_LABELS, formatCents } from "@insurance/shared";

const MUTED = "#6b7280";

// Renders an application summary for the agent's records. Like the API, it
// only ever includes the SSN's last 4 digits.
export function renderApplicationPdf(app: AgentApplicationDTO, generatedAt = new Date()): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 56,
      info: { Title: `Enrollment application ${app.id}`, Author: "Insurance Marketplace" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const heading = (text: string) => {
      doc.moveDown(1).font("Helvetica-Bold").fontSize(12).fillColor("black").text(text);
      doc.moveTo(doc.page.margins.left, doc.y + 2).lineTo(doc.page.width - doc.page.margins.right, doc.y + 2).strokeColor("#e5e7eb").stroke();
      doc.moveDown(0.5);
    };
    const row = (label: string, value: string) => {
      const y = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(label, doc.page.margins.left, y, { width: 150 });
      doc.fillColor("black").text(value || "—", doc.page.margins.left + 160, y, { width: 330 });
      doc.moveDown(0.3);
    };

    doc.font("Helvetica-Bold").fontSize(18).text("Enrollment application");
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`Application ${app.id} · generated ${generatedAt.toISOString()}`);

    heading("Applicant");
    row("Name", `${app.personal.firstName} ${app.personal.lastName}`);
    row("Date of birth", app.personal.dateOfBirth);
    row("ZIP code", app.personal.zipCode ?? "");
    row("SSN", `•••-••-${app.personal.ssnLast4}`);
    row("Email", app.applicant.email);
    row("Phone", app.applicant.phone ?? "");

    heading("Plan");
    row("Carrier", app.plan.carrier.name);
    row("Plan", app.plan.name);
    row("Tier / type", `${app.plan.metalTier} · ${app.plan.planType} · ${app.plan.planYear}`);
    row("Monthly premium", formatCents(app.plan.monthlyPremiumCents));
    row("Deductible", formatCents(app.plan.deductibleCents));
    row("Out-of-pocket max", formatCents(app.plan.outOfPocketMaxCents));

    heading("Health information");
    const health = app.healthInfo;
    row("Conditions", health?.conditions.map((c) => HEALTH_CONDITION_LABELS[c]).join(", ") || "None reported");
    row("Other", health?.otherConditions ?? "");
    row(
      "Preferred doctors",
      health?.preferredDoctors.map((d) => (d.specialty ? `${d.name} (${d.specialty})` : d.name)).join(", ") ?? "",
    );

    heading("Documents on file");
    if (app.documents.length === 0) row("—", "No documents uploaded");
    for (const d of app.documents) row(DOCUMENT_TYPE_LABELS[d.type], `${d.fileName} (uploaded ${d.uploadedAt.slice(0, 10)})`);

    heading("Carrier submission");
    row("Status", `${app.status} / ${app.submissionStatus}`);
    row("Attempts", String(app.submissionAttempts));
    row("Reference", app.carrierReference ?? "");
    row("Carrier message", app.carrierMessage ?? "");
    row("Submitted", app.submittedAt ?? "");

    if (app.documentRequests.length) {
      heading("Document requests");
      for (const r of app.documentRequests) {
        row(
          r.createdAt.slice(0, 10),
          `${r.requestedTypes.map((t) => DOCUMENT_TYPE_LABELS[t]).join(", ")} — "${r.message}" (${r.resolvedAt ? "fulfilled" : "open"})`,
        );
      }
    }

    doc
      .moveDown(2)
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor(MUTED)
      .text("Confidential: contains personal and health information. Handle according to company privacy policy.");
    doc.end();
  });
}
