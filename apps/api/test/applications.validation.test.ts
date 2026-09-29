import { describe, expect, it } from "vitest";
import {
  createApplicationSchema,
  dateOfBirthSchema,
  isEditable,
  isAwaitingReview,
  isResubmittable,
  requestDocumentsSchema,
  resubmitBlocker,
  sniffDocumentMime,
  ssnSchema,
  submissionBlocker,
  updateApplicationSchema,
  uploadBlocker,
} from "../src/modules/applications/applications.validation";

describe("ssnSchema", () => {
  it("accepts dashed and undashed forms, normalizing to 9 digits", () => {
    expect(ssnSchema.parse("123-45-6789")).toBe("123456789");
    expect(ssnSchema.parse(" 123456789 ")).toBe("123456789");
  });

  it.each(["12345678", "1234567890", "abc-de-fghi", "000-12-3456", "666-12-3456", "912-34-5678", "123-00-4567", "123-45-0000"])(
    "rejects %s",
    (ssn) => {
      expect(ssnSchema.safeParse(ssn).success).toBe(false);
    },
  );
});

describe("dateOfBirthSchema", () => {
  it("accepts a real past date", () => {
    expect(dateOfBirthSchema.safeParse("1990-06-15").success).toBe(true);
  });

  it.each(["1990-02-30", "06/15/1990", "2999-01-01", "1850-01-01"])("rejects %s", (dob) => {
    expect(dateOfBirthSchema.safeParse(dob).success).toBe(false);
  });
});

describe("application request schemas", () => {
  const valid = {
    planId: "p1",
    personal: { firstName: "Uma", lastName: "User", dateOfBirth: "1990-06-15", zipCode: "10001", ssn: "123-45-6789" },
    healthInfo: { conditions: ["ASTHMA", "ASTHMA"], otherConditions: "", preferredDoctors: [] },
  };

  it("dedupes conditions and normalizes the SSN on create", () => {
    const parsed = createApplicationSchema.parse(valid);
    expect(parsed.healthInfo.conditions).toEqual(["ASTHMA"]);
    expect(parsed.personal.ssn).toBe("123456789");
  });

  it("rejects unknown health conditions", () => {
    const bad = { ...valid, healthInfo: { ...valid.healthInfo, conditions: ["MADE_UP"] } };
    expect(createApplicationSchema.safeParse(bad).success).toBe(false);
  });

  it("requires a 5-digit ZIP code", () => {
    for (const zipCode of ["", "1000", "10001-1234", "abcde"]) {
      expect(createApplicationSchema.safeParse({ ...valid, personal: { ...valid.personal, zipCode } }).success).toBe(false);
    }
  });

  it("requires an SSN on create", () => {
    const { ssn: _ssn, ...personal } = valid.personal;
    expect(createApplicationSchema.safeParse({ ...valid, personal }).success).toBe(false);
  });

  it("treats a blank SSN on update as 'keep the one on file'", () => {
    const parsed = updateApplicationSchema.parse({ ...valid, personal: { ...valid.personal, ssn: "" } });
    expect(parsed.personal.ssn).toBeUndefined();
  });
});

describe("sniffDocumentMime", () => {
  it("recognizes PDF, PNG and JPEG by magic bytes", () => {
    expect(sniffDocumentMime(Buffer.from("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(sniffDocumentMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe("image/png");
    expect(sniffDocumentMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("rejects anything else, whatever it claims to be", () => {
    expect(sniffDocumentMime(Buffer.from("<html><script>"))).toBeNull();
    expect(sniffDocumentMime(Buffer.from("MZ\x90\x00"))).toBeNull();
    expect(sniffDocumentMime(Buffer.alloc(0))).toBeNull();
  });
});

describe("submissionBlocker", () => {
  const ready = {
    status: "DRAFT" as const,
    submissionStatus: "NOT_SUBMITTED" as const,
    documents: [{ type: "PHOTO_ID" as const }, { type: "PROOF_OF_ADDRESS" as const }],
    planAvailable: true,
  };

  it("allows a complete draft", () => {
    expect(submissionBlocker(ready)).toBeNull();
  });

  it("allows retrying after a carrier failure", () => {
    expect(submissionBlocker({ ...ready, submissionStatus: "FAILED" })).toBeNull();
  });

  it("names each missing document", () => {
    expect(submissionBlocker({ ...ready, documents: [] })).toMatch(/photo ID.*Proof of address/);
  });

  it("blocks resubmission, in-flight submissions, and unavailable plans", () => {
    expect(submissionBlocker({ ...ready, status: "SUBMITTED", submissionStatus: "ACCEPTED" })).toMatch(/already been submitted/);
    expect(submissionBlocker({ ...ready, submissionStatus: "PENDING" })).toMatch(/already being submitted/);
    expect(submissionBlocker({ ...ready, planAvailable: false })).toMatch(/no longer available/);
  });
});

describe("isEditable", () => {
  it("allows edits only on a draft that isn't mid-submission", () => {
    expect(isEditable({ status: "DRAFT", submissionStatus: "NOT_SUBMITTED" })).toBe(true);
    expect(isEditable({ status: "DRAFT", submissionStatus: "FAILED" })).toBe(true);
    expect(isEditable({ status: "DRAFT", submissionStatus: "PENDING" })).toBe(false);
    expect(isEditable({ status: "SUBMITTED", submissionStatus: "ACCEPTED" })).toBe(false);
  });
});

describe("resubmission rules", () => {
  const docs = [{ type: "PHOTO_ID" as const }, { type: "PROOF_OF_ADDRESS" as const }];

  it("only rejected or failed submissions are resubmittable", () => {
    expect(isResubmittable({ status: "REJECTED", submissionStatus: "REJECTED" })).toBe(true);
    expect(isResubmittable({ status: "DRAFT", submissionStatus: "FAILED" })).toBe(true);
    expect(isResubmittable({ status: "REJECTED", submissionStatus: "FAILED" })).toBe(true);
    expect(isResubmittable({ status: "DRAFT", submissionStatus: "NOT_SUBMITTED" })).toBe(false);
    expect(isResubmittable({ status: "SUBMITTED", submissionStatus: "ACCEPTED" })).toBe(false);
    expect(isResubmittable({ status: "APPROVED", submissionStatus: "ACCEPTED" })).toBe(false);
  });

  it("treats an admin rejection (carrier had accepted) as final", () => {
    expect(isResubmittable({ status: "REJECTED", submissionStatus: "ACCEPTED" })).toBe(false);
  });

  it("only carrier-accepted submissions await admin review", () => {
    expect(isAwaitingReview({ status: "SUBMITTED", submissionStatus: "ACCEPTED" })).toBe(true);
    expect(isAwaitingReview({ status: "SUBMITTED", submissionStatus: "PENDING" })).toBe(false);
    expect(isAwaitingReview({ status: "APPROVED", submissionStatus: "ACCEPTED" })).toBe(false);
    expect(isAwaitingReview({ status: "REJECTED", submissionStatus: "ACCEPTED" })).toBe(false);
  });

  it("still requires the documents and an available plan", () => {
    const base = { status: "REJECTED" as const, submissionStatus: "REJECTED" as const, documents: docs, planAvailable: true };
    expect(resubmitBlocker(base)).toBeNull();
    expect(resubmitBlocker({ ...base, documents: [] })).toMatch(/Missing required documents/);
    expect(resubmitBlocker({ ...base, planAvailable: false })).toMatch(/no longer available/);
    expect(resubmitBlocker({ ...base, submissionStatus: "PENDING" })).toMatch(/already being submitted/);
  });

  it("optional document types don't count toward submission readiness", () => {
    expect(
      submissionBlocker({ status: "DRAFT", submissionStatus: "NOT_SUBMITTED", documents: docs, planAvailable: true }),
    ).toBeNull();
  });
});

describe("uploadBlocker", () => {
  it("allows any type on an editable draft", () => {
    expect(uploadBlocker({ status: "DRAFT", submissionStatus: "NOT_SUBMITTED" }, "OTHER", [])).toBeNull();
  });

  it("after submission, allows only types with an open request", () => {
    const rejected = { status: "REJECTED" as const, submissionStatus: "REJECTED" as const };
    expect(uploadBlocker(rejected, "PROOF_OF_INCOME", ["PROOF_OF_INCOME"])).toBeNull();
    expect(uploadBlocker(rejected, "PHOTO_ID", ["PROOF_OF_INCOME"])).not.toBeNull();
    expect(uploadBlocker(rejected, "PHOTO_ID", [])).not.toBeNull();
  });

  it("refuses uploads mid-submission or once approved, even if requested", () => {
    expect(uploadBlocker({ status: "REJECTED", submissionStatus: "PENDING" }, "PHOTO_ID", ["PHOTO_ID"])).not.toBeNull();
    expect(uploadBlocker({ status: "APPROVED", submissionStatus: "ACCEPTED" }, "PHOTO_ID", ["PHOTO_ID"])).not.toBeNull();
  });
});

describe("requestDocumentsSchema", () => {
  it("dedupes types and trims the message", () => {
    expect(requestDocumentsSchema.parse({ requestedTypes: ["OTHER", "OTHER"], message: "  hi  " })).toEqual({
      requestedTypes: ["OTHER"],
      message: "hi",
    });
  });

  it("requires at least one known type and a message", () => {
    expect(requestDocumentsSchema.safeParse({ requestedTypes: [], message: "hi" }).success).toBe(false);
    expect(requestDocumentsSchema.safeParse({ requestedTypes: ["TAX_RETURN"], message: "hi" }).success).toBe(false);
    expect(requestDocumentsSchema.safeParse({ requestedTypes: ["OTHER"], message: "" }).success).toBe(false);
  });
});
