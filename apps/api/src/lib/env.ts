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

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function encryptionKey(): Buffer {
  const key = Buffer.from(required("FIELD_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  return key;
}

export interface CarrierEndpoint {
  baseUrl: string;
  apiKey: string;
}

// Per-carrier API endpoints, keyed by carrier code:
//   CARRIER_BLUEPEAK_API_URL=https://…   CARRIER_BLUEPEAK_API_KEY=…
export function parseCarrierEndpoints(source: NodeJS.ProcessEnv): Record<string, CarrierEndpoint> {
  const endpoints: Record<string, CarrierEndpoint> = {};
  for (const [name, value] of Object.entries(source)) {
    const match = /^CARRIER_([A-Z0-9]+)_API_URL$/.exec(name);
    const apiKey = match && source[`CARRIER_${match[1]}_API_KEY`];
    if (match && value && apiKey) endpoints[match[1]] = { baseUrl: value.replace(/\/+$/, ""), apiKey };
  }
  return endpoints;
}

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  isProduction,
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? "30d",
  // Render (and most PaaS hosts) inject PORT. optional() so an empty value
  // falls through instead of becoming Number("") === 0 (a random port).
  apiPort: Number(optional("API_PORT") ?? optional("PORT") ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  // Number of reverse-proxy hops in front of the API, so req.ip (audit logs)
  // is the client rather than the proxy. 0 = trust nothing.
  trustProxyHops: Number(optional("TRUST_PROXY") ?? 0),
  fieldEncryptionKey: encryptionKey(),
  storageDir: path.resolve(process.cwd(), process.env.STORAGE_DIR ?? "storage"),

  // Staging escape hatch: let production builds run on the mock adapters.
  allowMockIntegrations: process.env.ALLOW_MOCK_INTEGRATIONS === "true",

  s3: optional("AWS_S3_BUCKET")
    ? {
        bucket: optional("AWS_S3_BUCKET")!,
        region: optional("AWS_REGION") ?? "us-east-1",
        // Credentials are optional so an IAM role can be used instead.
        accessKeyId: optional("AWS_ACCESS_KEY_ID"),
        secretAccessKey: optional("AWS_SECRET_ACCESS_KEY"),
        kmsKeyId: optional("AWS_S3_KMS_KEY_ID"),
        prefix: optional("AWS_S3_PREFIX") ?? "",
      }
    : null,

  sendgrid: optional("SENDGRID_API_KEY")
    ? {
        apiKey: optional("SENDGRID_API_KEY")!,
        from: optional("EMAIL_FROM") ?? "",
        fromName: optional("EMAIL_FROM_NAME") ?? "Insurance Marketplace",
      }
    : null,

  smarty:
    optional("SMARTY_AUTH_ID") && optional("SMARTY_AUTH_TOKEN")
      ? { authId: optional("SMARTY_AUTH_ID")!, authToken: optional("SMARTY_AUTH_TOKEN")! }
      : null,

  // SMS via Twilio when all three are set; otherwise texts are only logged.
  // Not required in production yet: nothing sends SMS automatically, only
  // the admin test send.
  twilio:
    optional("TWILIO_ACCOUNT_SID") && optional("TWILIO_AUTH_TOKEN") && optional("TWILIO_FROM_NUMBER")
      ? {
          accountSid: optional("TWILIO_ACCOUNT_SID")!,
          authToken: optional("TWILIO_AUTH_TOKEN")!,
          from: optional("TWILIO_FROM_NUMBER")!,
        }
      : null,

  carriers: parseCarrierEndpoints(process.env),

  // Base URL of the web app, for links in emails.
  appUrl: (process.env.APP_URL ?? process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, ""),
};

// Called at server startup (not import time, so tests and scripts can load
// modules freely). Production must be wired to real services unless mocks
// were explicitly allowed; running on the local-disk/mocked adapters in prod
// would silently lose documents and never deliver email.
export function assertProductionIntegrations(e: typeof env = env): void {
  if (!e.isProduction || e.allowMockIntegrations) return;
  const problems: string[] = [];
  if (!e.s3) problems.push("AWS_S3_BUCKET (document storage)");
  if (!e.sendgrid) problems.push("SENDGRID_API_KEY (email)");
  else if (!e.sendgrid.from) problems.push("EMAIL_FROM (a SendGrid-verified sender)");
  if (!e.smarty) problems.push("SMARTY_AUTH_ID + SMARTY_AUTH_TOKEN (ZIP lookup)");
  if (Object.keys(e.carriers).length === 0) problems.push("CARRIER_<CODE>_API_URL + CARRIER_<CODE>_API_KEY (carrier APIs)");
  for (const [code, c] of Object.entries(e.carriers)) {
    if (!c.baseUrl.startsWith("https://")) problems.push(`CARRIER_${code}_API_URL must use https:// (it carries PHI)`);
  }
  if (problems.length) {
    throw new Error(
      `Production is missing integration config:\n  - ${problems.join("\n  - ")}\n` +
        "Set them, or set ALLOW_MOCK_INTEGRATIONS=true to run on mocks (staging only).",
    );
  }
}
