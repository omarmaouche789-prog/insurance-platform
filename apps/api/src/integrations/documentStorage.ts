import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../lib/env";

// Adapter boundary for document storage. The spec calls for S3/GCS; until that
// lands (Phase 6) documents go to local disk under STORAGE_DIR.
export interface DocumentStorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export class LocalDiskStorageAdapter implements DocumentStorageAdapter {
  constructor(private readonly rootDir: string) {}

  // Keys are generated server-side, but resolve-and-check anyway so a bad key
  // can never escape the storage root.
  private resolve(key: string): string {
    const full = path.resolve(this.rootDir, key);
    if (!full.startsWith(path.resolve(this.rootDir) + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
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

export const documentStorage: DocumentStorageAdapter = new LocalDiskStorageAdapter(env.storageDir);
