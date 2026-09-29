import fs from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../lib/env";

// Adapter boundary for document storage: S3 when AWS_S3_BUCKET is set, local
// disk under STORAGE_DIR otherwise (dev/tests only — PaaS disks are ephemeral).
export interface DocumentStorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

// Storage keys are generated server-side ("applications/<id>/<uuid>.<ext>"),
// but both adapters validate anyway so a bad key can't escape its root.
function assertSafeKey(key: string): void {
  if (!key || key.startsWith("/") || key.split("/").some((part) => part === ".." || part === "")) {
    throw new Error("Invalid storage key");
  }
}

export class LocalDiskStorageAdapter implements DocumentStorageAdapter {
  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.rootDir, key);
    if (!full.startsWith(path.resolve(this.rootDir) + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  // contentType is only meaningful to S3; the disk just stores bytes.
  async put(key: string, data: Buffer, _contentType?: string): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}

// Only the one method we use, so tests can pass a fake.
export interface S3Sender {
  send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

export interface S3StorageOptions {
  bucket: string;
  prefix?: string;
  // Omit for SSE-S3 (AES256); set to use a customer-managed KMS key.
  kmsKeyId?: string;
}

// Objects are always written with server-side encryption. The bucket itself
// should also block all public access and enforce TLS (see DEPLOYMENT.md).
export class S3StorageAdapter implements DocumentStorageAdapter {
  constructor(
    private readonly client: S3Sender,
    private readonly opts: S3StorageOptions,
  ) {}

  private objectKey(key: string): string {
    assertSafeKey(key);
    return `${this.opts.prefix ?? ""}${key}`;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: this.objectKey(key),
        Body: data,
        ContentType: contentType,
        ...(this.opts.kmsKeyId
          ? { ServerSideEncryption: "aws:kms", SSEKMSKeyId: this.opts.kmsKeyId }
          : { ServerSideEncryption: "AES256" }),
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = (await this.client.send(
      new GetObjectCommand({ Bucket: this.opts.bucket, Key: this.objectKey(key) }),
    )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
    if (!res.Body) throw new Error(`Empty S3 object: ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: this.objectKey(key) }));
  }
}

function createDocumentStorage(): DocumentStorageAdapter {
  if (!env.s3) return new LocalDiskStorageAdapter(env.storageDir);
  const client = new S3Client({
    region: env.s3.region,
    ...(env.s3.accessKeyId && env.s3.secretAccessKey
      ? { credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey } }
      : {}),
  });
  return new S3StorageAdapter(client, { bucket: env.s3.bucket, prefix: env.s3.prefix, kmsKeyId: env.s3.kmsKeyId });
}

export const documentStorage: DocumentStorageAdapter = createDocumentStorage();
