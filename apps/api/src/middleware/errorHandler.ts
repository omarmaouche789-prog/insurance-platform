import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { MIGRATE_HINT, SCHEMA_MISMATCH_CODES } from "../lib/migrationCheck";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }
  // A missing table or column means migrations weren't applied: say so
  // instead of a bare "Internal server error".
  if (err instanceof Prisma.PrismaClientKnownRequestError && SCHEMA_MISMATCH_CODES.includes(err.code)) {
    console.error(`Database is out of date (${err.code}): ${err.message.split("\n").pop()?.trim()}\n${MIGRATE_HINT}`);
    res.status(500).json({ error: `The database is out of date. ${MIGRATE_HINT}`, code: "DATABASE_OUT_OF_DATE" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
