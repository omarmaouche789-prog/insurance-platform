import { Router } from "express";
import { z } from "zod";
import { MESSAGE_BODY_MAX, MESSAGE_SUBJECT_MAX } from "@insurance/shared";
import { recordAuditEvent } from "../../lib/audit";
import { limiters } from "../../lib/rateLimit";
import { requireAuth, requireRole } from "../../middleware/auth";
import { getAgentMessage, listAgentMessages, listSentMessages, sendMessage, setMessageRead, unreadMessageCount } from "./messages.service";

const pageSchema = z.coerce.number().int().min(1).max(10_000).default(1);
const searchSchema = z.string().trim().max(100).optional().transform((v) => v || undefined);

// ─── /api/admin/messages — any admin sends to an agent and sees what was sent ─

export const adminMessagesRouter = Router();
adminMessagesRouter.use(requireAuth, requireRole("ADMIN"));

const sendSchema = z
  .object({
    toAgentId: z.string().trim().min(1, "Choose an agent").max(64),
    subject: z.string().trim().min(1, "Enter a subject").max(MESSAGE_SUBJECT_MAX, `Keep the subject under ${MESSAGE_SUBJECT_MAX} characters`),
    body: z.string().trim().min(1, "Write a message").max(MESSAGE_BODY_MAX, `Keep the message under ${MESSAGE_BODY_MAX} characters`),
  })
  .strict();

adminMessagesRouter.post("/", limiters.messageSend, async (req, res, next) => {
  try {
    const input = sendSchema.parse(req.body);
    const message = await sendMessage(req.auth!.userId, input);
    // Who and when only: the subject and body never go into the audit log.
    await recordAuditEvent({
      actorUserId: req.auth!.userId,
      action: "message.sent",
      entityType: "message",
      entityId: message.id,
      metadata: { toAgentId: message.to.id },
      req,
    });
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

const adminListSchema = z.object({ search: searchSchema, agentId: z.string().max(64).optional(), page: pageSchema });

adminMessagesRouter.get("/", async (req, res, next) => {
  try {
    res.status(200).json(await listSentMessages(adminListSchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
});

// ─── /api/agent/messages — an agent's own inbox ──────────────────────────────

export const agentMessagesRouter = Router();
agentMessagesRouter.use(requireAuth, requireRole("AGENT"));

const agentListSchema = z.object({
  search: searchSchema,
  read: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  page: pageSchema,
});

agentMessagesRouter.get("/", async (req, res, next) => {
  try {
    res.status(200).json(await listAgentMessages(req.auth!.userId, agentListSchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
});

agentMessagesRouter.get("/unread-count", async (req, res, next) => {
  try {
    res.status(200).json({ unreadCount: await unreadMessageCount(req.auth!.userId) });
  } catch (err) {
    next(err);
  }
});

agentMessagesRouter.get("/:id", async (req, res, next) => {
  try {
    res.status(200).json(await getAgentMessage(req.auth!.userId, req.params.id));
  } catch (err) {
    next(err);
  }
});

agentMessagesRouter.put("/:id/read", async (req, res, next) => {
  try {
    res.status(200).json(await setMessageRead(req.auth!.userId, req.params.id, true));
  } catch (err) {
    next(err);
  }
});

agentMessagesRouter.put("/:id/unread", async (req, res, next) => {
  try {
    res.status(200).json(await setMessageRead(req.auth!.userId, req.params.id, false));
  } catch (err) {
    next(err);
  }
});
