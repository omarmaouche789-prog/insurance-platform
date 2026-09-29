import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { LocalDiskStorageAdapter } from "../src/integrations/documentStorage";
import { CarrierUnavailableError, MockCarrierSubmissionAdapter } from "../src/integrations/carrierSubmission";
import { LogEmailTransport } from "../src/integrations/email";

describe("LocalDiskStorageAdapter", () => {
  let root: string;
  const adapter = () => new LocalDiskStorageAdapter(root);

  afterAll(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("stores, reads back, and deletes a file under nested keys", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "storage-test-"));
    await adapter().put("applications/a1/doc.pdf", Buffer.from("%PDF-data"), "application/pdf");
    expect((await adapter().get("applications/a1/doc.pdf")).toString()).toBe("%PDF-data");

    await adapter().delete("applications/a1/doc.pdf");
    await expect(adapter().get("applications/a1/doc.pdf")).rejects.toThrow();
  });

  it("refuses keys that would escape the storage root", async () => {
    root ??= await fs.mkdtemp(path.join(os.tmpdir(), "storage-test-"));
    await expect(adapter().put("../escape.txt", Buffer.from("x"), "text/plain")).rejects.toThrow("Invalid storage key");
    await expect(adapter().get("/etc/passwd")).rejects.toThrow("Invalid storage key");
  });
});

describe("MockCarrierSubmissionAdapter", () => {
  const adapter = new MockCarrierSubmissionAdapter(0);
  const submit = (ssn: string, attempt: number) =>
    adapter.submit({
      carrierCode: "BLUEPEAK",
      planId: "p1",
      applicationId: "a1",
      attempt,
      applicant: { firstName: "Uma", lastName: "User", dateOfBirth: "1990-06-15", zipCode: "10001", ssn },
      healthInfo: null,
      documentTypes: ["PHOTO_ID", "PROOF_OF_ADDRESS"],
    });

  it("accepts with a carrier-prefixed reference", async () => {
    const result = await submit("123456789", 1);
    expect(result.outcome).toBe("ACCEPTED");
    expect(result.reference).toMatch(/^BLUEPEAK-[0-9A-F]{8}$/);
  });

  it("rejects test SSN ...0001 on the first attempt only", async () => {
    expect((await submit("123450001", 1)).outcome).toBe("REJECTED");
    expect((await submit("123450001", 2)).outcome).toBe("ACCEPTED");
  });

  it("fails test SSN ...0002 on the first attempt only", async () => {
    await expect(submit("123450002", 1)).rejects.toThrow(CarrierUnavailableError);
    expect((await submit("123450002", 2)).outcome).toBe("ACCEPTED");
  });
});

describe("LogEmailTransport", () => {
  it("records what it sent and logs a masked recipient", async () => {
    const transport = new LogEmailTransport();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const message = { to: "alice@example.com", subject: "s", text: "t", html: "<p>t</p>" };
    await transport.send(message);
    expect(transport.sent).toEqual([message]);
    expect(info.mock.calls[0][0]).toContain("a***@example.com");
    expect(info.mock.calls[0][0]).not.toContain("alice@");
  });
});
