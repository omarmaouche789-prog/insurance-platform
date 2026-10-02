import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { ADMIN_USER_SORTS, BULK_USER_ACTIONS, ROLES, USER_MANAGER_ADMIN_ROLES, USER_STATUSES } from "@insurance/shared";
import { requireAdminRole, requireAuth, requireRole } from "../../middleware/auth";
import { limiters } from "../../lib/rateLimit";
import { listLoginHistory } from "../security/loginHistory";
import {
  activateUser,
  bulkUserAction,
  deleteUser,
  getUserDetail,
  listUsers,
  resetUserPassword,
  resetUserTwoFactor,
  suspendUser,
  type AdminActor,
} from "./users.service";

// Any admin can read; only SUPER/OPERATIONS can change accounts (and only
// SUPER can change other admins — enforced in the service).
export const adminUsersRouter = Router();
adminUsersRouter.use(requireAuth, requireRole("ADMIN"));
const requireManager = requireAdminRole(...USER_MANAGER_ADMIN_ROLES);

const actorOf = (req: Request): AdminActor => ({ userId: req.auth!.userId, adminRole: req.auth!.adminRole });

const csv = z.string().transform((s) =>
  s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
);

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: csv.pipe(z.array(z.enum(ROLES))).optional(),
  status: z.enum(USER_STATUSES).optional(),
  sort: z.enum(ADMIN_USER_SORTS).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

adminUsersRouter.get("/", async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    res.status(200).json(await listUsers({ ...q, roles: q.role, search: q.search || undefined }));
  } catch (err) {
    next(err);
  }
});

const reasonSchema = z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500);

const bulkSchema = z
  .object({
    action: z.enum(BULK_USER_ACTIONS),
    ids: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .transform((ids) => [...new Set(ids)]),
    reason: reasonSchema.optional(),
  })
  .refine((b) => b.action !== "suspend" || Boolean(b.reason), {
    message: "A suspension reason is required",
    path: ["reason"],
  });

adminUsersRouter.post("/bulk", requireManager, limiters.sensitiveAction, async (req, res, next) => {
  try {
    const { action, ids, reason } = bulkSchema.parse(req.body);
    res.status(200).json(await bulkUserAction(actorOf(req), action, ids, reason, req));
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.get("/:id", async (req, res, next) => {
  try {
    res.status(200).json({ user: await getUserDetail(req.params.id) });
  } catch (err) {
    next(err);
  }
});

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

adminUsersRouter.get("/:id/login-history", async (req, res, next) => {
  try {
    const { page, pageSize } = pageSchema.parse(req.query);
    await getUserDetail(req.params.id); // 404 for unknown ids
    res.status(200).json(await listLoginHistory(req.params.id, page, pageSize));
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.post("/:id/suspend", requireManager, limiters.sensitiveAction, async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: reasonSchema }).parse(req.body ?? {});
    res.status(200).json({ user: await suspendUser(actorOf(req), req.params.id, reason, req) });
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.post("/:id/activate", requireManager, limiters.sensitiveAction, async (req, res, next) => {
  try {
    res.status(200).json({ user: await activateUser(actorOf(req), req.params.id, req) });
  } catch (err) {
    next(err);
  }
});

const deleteSchema = z.object({
  confirmEmail: z.string().trim().min(1, "Type the account's email to confirm").max(254),
  reason: z.string().trim().max(500).optional(),
});

adminUsersRouter.post("/:id/delete", requireManager, limiters.sensitiveAction, async (req, res, next) => {
  try {
    const input = deleteSchema.parse(req.body ?? {});
    await deleteUser(actorOf(req), req.params.id, { confirmEmail: input.confirmEmail, reason: input.reason || undefined }, req);
    res.status(200).json({ status: "deleted" });
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.post("/:id/reset-password", requireManager, limiters.sensitiveAction, async (req, res, next) => {
  try {
    res.status(200).json(await resetUserPassword(actorOf(req), req.params.id, req));
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.post("/:id/2fa/reset", requireManager, limiters.sensitiveAction, async (req, res, next) => {
  try {
    res.status(200).json({ user: await resetUserTwoFactor(actorOf(req), req.params.id, req) });
  } catch (err) {
    next(err);
  }
});
