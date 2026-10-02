import { Router } from "express";
import { z } from "zod";
import {
  AGENT_MANAGER_ADMIN_ROLES,
  COMMISSION_PAYER_ADMIN_ROLES,
  MAX_COMMISSION_RATE_BPS,
  US_STATES,
} from "@insurance/shared";
import { requireAdminRole, requireAuth, requireRole } from "../../middleware/auth";
import { limiters } from "../../lib/rateLimit";
import {
  createAgent,
  deactivateAgent,
  getAgentDetail,
  listAgents,
  payCommissions,
  reactivateAgent,
  updateAgent,
} from "./agents.service";

export const adminAgentsRouter = Router();
adminAgentsRouter.use(requireAuth, requireRole("ADMIN"));
const requireManager = requireAdminRole(...AGENT_MANAGER_ADMIN_ROLES);
const requirePayer = requireAdminRole(...COMMISSION_PAYER_ADMIN_ROLES);

const regionsSchema = z
  .array(z.string().trim().toUpperCase().pipe(z.enum(US_STATES)))
  .min(1, "Pick at least one licensed state")
  .max(US_STATES.length)
  .transform((r) => [...new Set(r)].sort());

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Not a valid date");

const rateSchema = z
  .number()
  .int("Rate must be whole basis points")
  .min(0)
  .max(MAX_COMMISSION_RATE_BPS, `Rate can be at most ${MAX_COMMISSION_RATE_BPS / 100}%`)
  .nullable();

const agentFields = {
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+().\-\s]*$/, "Phone can only contain digits and + ( ) - .")
    .optional(),
  licenseNumber: z.string().trim().min(3, "License number is required").max(50),
  npn: z
    .string()
    .trim()
    .regex(/^\d{0,10}$/, "NPN is up to 10 digits")
    .optional(),
  licenseExpiresAt: dateSchema.optional(),
  regions: regionsSchema,
  commissionRateBps: rateSchema.optional(),
};

const createSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), ...agentFields });
const updateSchema = z.object(agentFields).partial().strict();

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["active", "inactive", "all"]).default("all"),
  region: z.string().trim().toUpperCase().pipe(z.enum(US_STATES)).optional(),
});

adminAgentsRouter.get("/", async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    res.status(200).json(await listAgents({ ...q, search: q.search || undefined }));
  } catch (err) {
    next(err);
  }
});

adminAgentsRouter.post("/", requireManager, limiters.sensitiveAction, async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    res.status(201).json({ agent: await createAgent(req.auth!.userId, input, req) });
  } catch (err) {
    next(err);
  }
});

adminAgentsRouter.get("/:id", async (req, res, next) => {
  try {
    res.status(200).json({ agent: await getAgentDetail(req.params.id) });
  } catch (err) {
    next(err);
  }
});

adminAgentsRouter.put("/:id", requireManager, async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    res.status(200).json({ agent: await updateAgent(req.auth!.userId, req.params.id, input, req) });
  } catch (err) {
    next(err);
  }
});

const deactivateSchema = z.object({
  reassignOpen: z.boolean().default(false),
  reason: z.string().trim().max(500).optional(),
});

adminAgentsRouter.post("/:id/deactivate", requireManager, limiters.sensitiveAction, async (req, res, next) => {
  try {
    const { reassignOpen, reason } = deactivateSchema.parse(req.body ?? {});
    res.status(200).json(await deactivateAgent(req.auth!.userId, req.params.id, { reassignOpen, reason: reason || undefined }, req));
  } catch (err) {
    next(err);
  }
});

adminAgentsRouter.post("/:id/reactivate", requireManager, async (req, res, next) => {
  try {
    res.status(200).json({ agent: await reactivateAgent(req.auth!.userId, req.params.id, req) });
  } catch (err) {
    next(err);
  }
});

const paySchema = z.object({ commissionIds: z.array(z.string().min(1)).min(1).max(500).optional() });

adminAgentsRouter.post("/:id/commissions/pay", requirePayer, limiters.sensitiveAction, async (req, res, next) => {
  try {
    const { commissionIds } = paySchema.parse(req.body ?? {});
    res.status(200).json(await payCommissions(req.auth!.userId, req.params.id, commissionIds, req));
  } catch (err) {
    next(err);
  }
});
