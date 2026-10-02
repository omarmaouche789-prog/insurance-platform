import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { listNotifications, markAllRead, markRead } from "./notifications.service";

// Any signed-in user's own notifications.
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const listQuerySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  after: z.string().datetime().optional().transform((v) => (v ? new Date(v) : undefined)),
});

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    res.status(200).json(await listNotifications(req.auth!.userId, q));
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/read-all", async (req, res, next) => {
  try {
    res.status(200).json({ updated: await markAllRead(req.auth!.userId) });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/:id/read", async (req, res, next) => {
  try {
    await markRead(req.auth!.userId, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
