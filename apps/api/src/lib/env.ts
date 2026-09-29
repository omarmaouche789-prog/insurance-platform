import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function encryptionKey(): Buffer {
  const key = Buffer.from(required("FIELD_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  return key;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? "30d",
  apiPort: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  fieldEncryptionKey: encryptionKey(),
  storageDir: path.resolve(process.cwd(), process.env.STORAGE_DIR ?? "storage"),
};
