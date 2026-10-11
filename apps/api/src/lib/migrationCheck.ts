import fs from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";

// Prisma errors for a table or column the code expects but the database
// doesn't have: the schema changed and its migration wasn't applied.
export const SCHEMA_MISMATCH_CODES = ["P2021", "P2022"];

export const MIGRATE_HINT =
  "Run the database migrations (`npm run -w apps/api prisma:migrate` locally, `prisma migrate deploy` in production) and restart the API.";

// Compares prisma/migrations with what the database has applied and warns
// loudly at startup if anything is missing. Never throws: a database that's
// down is reported by the requests themselves.
export async function warnAboutPendingMigrations(migrationsDir = path.resolve(__dirname, "../../prisma/migrations")): Promise<string[]> {
  try {
    if (!fs.existsSync(migrationsDir)) return [];
    const expected = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const applied = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const done = new Set(applied.map((r) => r.migration_name));
    const pending = expected.filter((name) => !done.has(name));
    if (pending.length) {
      console.warn(
        [
          "",
          "⚠️  The database is missing these migrations, so parts of the app will fail:",
          ...pending.map((name) => `     - ${name}`),
          `   ${MIGRATE_HINT}`,
          "",
        ].join("\n"),
      );
    }
    return pending;
  } catch (err) {
    console.warn("Couldn't check database migrations:", err instanceof Error ? err.message.split("\n")[0] : err);
    return [];
  }
}
