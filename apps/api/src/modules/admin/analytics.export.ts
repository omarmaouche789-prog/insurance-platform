import ExcelJS from "exceljs";
import type {
  ApprovalAnalyticsDTO,
  FunnelAnalyticsDTO,
  RevenueAnalyticsDTO,
  UserAcquisitionDTO,
} from "@insurance/shared";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const MONEY = '"$"#,##0.00';
const PERCENT = "0.0%";

function addSheet(
  book: ExcelJS.Workbook,
  name: string,
  columns: Array<{ header: string; key: string; width?: number; numFmt?: string }>,
  rows: ReadonlyArray<object>,
): void {
  const sheet = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
  sheet.addRows([...rows]);
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = HEADER_FILL;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

const dollars = (cents: number) => cents / 100;

// One workbook, one sheet per dashboard panel. Money is written as numbers
// with a currency format (not strings) so it stays summable in Excel.
export async function buildAnalyticsWorkbook(data: {
  users: UserAcquisitionDTO;
  approvals: ApprovalAnalyticsDTO;
  revenue: RevenueAnalyticsDTO;
  funnel: FunnelAnalyticsDTO;
  generatedAt: Date;
}): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Insurance Marketplace";
  book.created = data.generatedAt;

  addSheet(
    book,
    "Summary",
    [
      { header: "Metric", key: "metric", width: 34 },
      { header: "Value", key: "value", width: 22 },
    ],
    [
      { metric: "Range", value: `${data.users.from} to ${data.users.to}` },
      { metric: "New users", value: data.users.totalUsers },
      { metric: "New agents", value: data.users.totalAgents },
      { metric: "Applications approved", value: data.approvals.overall.approved },
      { metric: "Applications rejected", value: data.approvals.overall.rejected },
      { metric: "Approval rate", value: data.approvals.overall.approvalRate ?? "n/a" },
      { metric: "Commission revenue (USD)", value: dollars(data.revenue.totalCents) },
      { metric: "Generated at (UTC)", value: data.generatedAt.toISOString() },
    ],
  );

  addSheet(
    book,
    "User acquisition",
    [
      { header: `Period (${data.users.interval} starting)`, key: "period", width: 24 },
      { header: "New users", key: "users" },
      { header: "New agents", key: "agents" },
      { header: "Cumulative users", key: "cumulativeUsers" },
    ],
    data.users.points,
  );

  addSheet(
    book,
    "Agents",
    [
      { header: "Agent", key: "agentName", width: 28 },
      { header: "Active", key: "active", width: 10 },
      { header: "Applications handled", key: "handled", width: 22 },
      { header: "Approved", key: "approved" },
      { header: "Rejected", key: "rejected" },
      { header: "Approval rate", key: "approvalRate", numFmt: PERCENT },
      { header: "Revenue (USD)", key: "revenue", numFmt: MONEY },
    ],
    data.approvals.agents.map((a) => ({
      ...a,
      active: a.isActive ? "Yes" : "No",
      approvalRate: a.approvalRate,
      revenue: dollars(a.revenueCents),
    })),
  );

  addSheet(
    book,
    "Revenue by carrier",
    [
      { header: "Carrier", key: "carrierName", width: 28 },
      { header: "Policies", key: "policies" },
      { header: "Total (USD)", key: "total", numFmt: MONEY },
      { header: "Pending (USD)", key: "pending", numFmt: MONEY },
      { header: "Earned (USD)", key: "earned", numFmt: MONEY },
      { header: "Paid (USD)", key: "paid", numFmt: MONEY },
    ],
    data.revenue.carriers.map((c) => ({
      carrierName: c.carrierName,
      policies: c.policies,
      total: dollars(c.revenueCents),
      pending: dollars(c.pendingCents),
      earned: dollars(c.earnedCents),
      paid: dollars(c.paidCents),
    })),
  );

  addSheet(
    book,
    "Funnel",
    [
      { header: "Stage", key: "label", width: 28 },
      { header: "Users", key: "count" },
      { header: "From previous", key: "conversionFromPrevious", numFmt: PERCENT },
      { header: "From start", key: "conversionFromStart", numFmt: PERCENT },
    ],
    data.funnel.stages,
  );

  return Buffer.from(await book.xlsx.writeBuffer());
}
