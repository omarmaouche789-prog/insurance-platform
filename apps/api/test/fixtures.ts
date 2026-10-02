import { vi } from "vitest";
import { encryptField, encryptJson } from "../src/lib/fieldCrypto";

// Shape of the Prisma mock the route tests install with vi.mock. Each test
// file creates its own via vi.hoisted(makeDbMock).
export function makeDbMock() {
  return {
    application: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    applicationDocument: { upsert: vi.fn(), findMany: vi.fn() },
    documentRequest: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    plan: { findFirst: vi.fn() },
    planServiceArea: { findUnique: vi.fn() },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    agentProfile: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    carrier: { findMany: vi.fn() },
    commissionRate: { findUnique: vi.fn() },
    commission: { create: vi.fn(), count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn() },
    refreshToken: { create: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    twoFactorSecret: { upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    backupCode: { createMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    loginHistory: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    passwordResetToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    notification: { create: vi.fn(), count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    followUp: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    applicationNote: { create: vi.fn(), findMany: vi.fn() },
    blogPost: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
}

// Supports both forms of prisma.$transaction: an array of promises, or an
// interactive callback (which gets the same mock as its `tx`).
export function installTransaction(db: ReturnType<typeof makeDbMock>) {
  db.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof db) => unknown)(db) : Promise.all(arg as Promise<unknown>[]),
  );
}

export const PLAN = {
  id: "plan-1",
  carrierId: "c1",
  carrier: { id: "c1", code: "BLUEPEAK", name: "BluePeak Health", isActive: true },
  name: "BluePeak Health Silver Select PPO",
  planYear: 2027,
  metalTier: "SILVER",
  planType: "PPO",
  monthlyPremiumCents: 46800,
  deductibleCents: 400000,
  outOfPocketMaxCents: 850000,
  primaryCareCopayCents: 3500,
  specialistCopayCents: 7000,
  genericDrugCopayCents: 1500,
  hsaEligible: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const DOCS = ["PHOTO_ID", "PROOF_OF_ADDRESS"].map((type, i) => ({
  id: `doc-${i}`,
  applicationId: "app-1",
  type,
  fileName: `${type}.pdf`,
  mimeType: "application/pdf",
  sizeBytes: 100,
  storageKey: `applications/app-1/${i}.pdf`,
  uploadedAt: new Date("2026-09-01T00:00:00Z"),
}));

export function makeApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    userId: "user-1",
    agentId: "agent-1",
    planId: "plan-1",
    plan: PLAN,
    status: "DRAFT",
    firstName: "Uma",
    lastName: "User",
    dateOfBirth: new Date("1990-06-15T00:00:00Z"),
    zipCode: "10001",
    ssnEncrypted: encryptField("123456789"),
    ssnLast4: "6789",
    healthInfoEncrypted: encryptJson({ conditions: ["ASTHMA"], otherConditions: "", preferredDoctors: [] }),
    submissionStatus: "NOT_SUBMITTED",
    submissionAttempts: 0,
    carrierReference: null,
    carrierMessage: null,
    submittedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    documents: DOCS,
    documentRequests: [],
    agent: { firstName: "Alex", lastName: "Agent", email: "agent@example.com" },
    user: { email: "user@example.com", phone: null },
    reviewedAt: null,
    reviewedById: null,
    reviewedBy: null,
    reviewNotes: null,
    commission: null,
    ...overrides,
  };
}

export function makeDocumentRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    applicationId: "app-1",
    agentId: "agent-1",
    agent: { firstName: "Alex", lastName: "Agent" },
    message: "Please upload a clearer ID",
    requestedTypes: ["PHOTO_ID"],
    status: "OPEN",
    createdAt: new Date("2026-09-10T00:00:00Z"),
    resolvedAt: null,
    completedAt: null,
    completedById: null,
    ...overrides,
  };
}

// A users-table row with every column, for auth/admin tests.
export function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    passwordHash: "$2a$04$abcdefghijklmnopqrstuuJ0lQ2cJ7cH0.0Lwq0N1mF9nA2r3P5y6",
    role: "USER",
    adminRole: null,
    firstName: "Uma",
    lastName: "User",
    phone: null,
    isActive: true,
    emailVerifiedAt: null,
    twoFactorEnabled: false,
    suspendedAt: null,
    suspensionReason: null,
    deletedAt: null,
    lastLoginAt: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    twoFactorSecret: null,
    ...overrides,
  };
}
