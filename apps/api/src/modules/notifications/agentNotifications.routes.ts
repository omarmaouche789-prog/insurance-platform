import { Router } from "express";
import { z } from "zod";
import { NOTIFICATION_CATEGORIES } from "@insurance/shared";
import { requireAuth, requireRole } from "../../middleware/auth";
import {
  deleteNotification,
  listAgentNotifications,
  markAllRead,
  markManyRead,
  markRead,
  unreadNotificationCount,
} from "./notifications.service";

// /api/agent/notifications — the agent Notification Center. Agents only, and
// only their own notifications (the same rows the header bell shows).
export const agentNotificationsRouter = Router();
agentNotificationsRouter.use(requireAuth, requireRole("AGENT"));

const listSchema = z.object({
  type: z.enum(NOTIFICATION_CATEGORIES).optional(),
  read: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

agentNotificationsRouter.get("/", async (req, res, next) => {
  try {
    const q = listSchema.parse(req.query);
    res.status(200).json(await listAgentNotifications(req.auth!.userId, { category: q.type, read: q.read, page: q.page }));
  } catch (err) {
    next(err);
  }
});

agentNotificationsRouter.get("/unread-count", async (req, res, next) => {
  try {
    res.status(200).json({ unreadCount: await unreadNotificationCount(req.auth!.userId) });
  } catch (err) {
    next(err);
  }
});

const idsSchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1, "Select at least one notification").max(100) }).strict();

agentNotificationsRouter.patch("/bulk/read", async (req, res, next) => {
  try {
    const { ids } = idsSchema.parse(req.body);
    res.status(200).json({ updated: await markManyRead(req.auth!.userId, [...new Set(ids)]) });
  } catch (err) {
    next(err);
  }
});

agentNotificationsRouter.patch("/read-all", async (req, res, next) => {
  try {
    res.status(200).json({ updated: await markAllRead(req.auth!.userId) });
  } catch (err) {
    next(err);
  }
});

agentNotificationsRouter.patch("/:id/read", async (req, res, next) => {
  try {
    await markRead(req.auth!.userId, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

agentNotificationsRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteNotification(req.auth!.userId, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
