import type { Message, Prisma } from "@prisma/client";
import type { AdminMessageListResponseDTO, AgentMessageListResponseDTO, MessageDTO, SendMessageRequestDTO } from "@insurance/shared";
import { MESSAGES_PAGE_SIZE } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { notify } from "../notifications/notifications.service";

const PARTY = { select: { id: true, firstName: true, lastName: true } } as const;
const WITH_PARTIES = { fromAdmin: PARTY, toAgent: PARTY } as const;

type Party = { id: string; firstName: string; lastName: string };
type MessageWithParties = Message & { fromAdmin: Party; toAgent: Party };

const partyName = (p: Party) => `${p.firstName} ${p.lastName}`.trim();

export function toMessageDTO(m: MessageWithParties): MessageDTO {
  return {
    id: m.id,
    subject: m.subject,
    body: m.body,
    sentAt: m.sentAt.toISOString(),
    read: m.read,
    readAt: m.readAt?.toISOString() ?? null,
    from: { id: m.fromAdmin.id, name: partyName(m.fromAdmin) },
    to: { id: m.toAgent.id, name: partyName(m.toAgent) },
  };
}

function pagination(page: number, total: number) {
  return { page, pageSize: MESSAGES_PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / MESSAGES_PAGE_SIZE)) };
}

const subjectSearch = (search: string | undefined): Prisma.MessageWhereInput =>
  search ? { subject: { contains: search, mode: "insensitive" } } : {};

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function sendMessage(fromAdminId: string, input: SendMessageRequestDTO): Promise<MessageDTO> {
  // Only active, non-deleted agents can be messaged.
  const agent = await prisma.user.findFirst({
    where: { id: input.toAgentId, role: "AGENT", isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!agent) throw new HttpError(404, "Agent not found");

  const message = await prisma.message.create({
    data: { fromAdminId, toAgentId: agent.id, subject: input.subject, body: input.body },
    include: WITH_PARTIES,
  });

  // The subject and body stay out of the notification (no PHI in
  // notifications); the agent reads them on the Messages page.
  await notify(agent.id, {
    type: "message",
    title: `New message from ${partyName(message.fromAdmin)}`,
    link: `/agent/messages?id=${message.id}`,
    messageId: message.id,
  });
  return toMessageDTO(message);
}

export async function listSentMessages(opts: { search?: string; agentId?: string; page: number }): Promise<AdminMessageListResponseDTO> {
  const where: Prisma.MessageWhereInput = { ...subjectSearch(opts.search), ...(opts.agentId ? { toAgentId: opts.agentId } : {}) };
  const [total, rows] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      include: WITH_PARTIES,
      orderBy: [{ sentAt: "desc" }, { id: "asc" }],
      skip: (opts.page - 1) * MESSAGES_PAGE_SIZE,
      take: MESSAGES_PAGE_SIZE,
    }),
  ]);
  return { messages: rows.map(toMessageDTO), pagination: pagination(opts.page, total) };
}

// ─── Agent ───────────────────────────────────────────────────────────────────
// Every lookup is scoped to toAgentId: another agent's message is a 404.

export async function listAgentMessages(
  agentId: string,
  opts: { search?: string; read?: boolean; page: number },
): Promise<AgentMessageListResponseDTO> {
  const where: Prisma.MessageWhereInput = {
    toAgentId: agentId,
    ...subjectSearch(opts.search),
    ...(opts.read === undefined ? {} : { read: opts.read }),
  };
  const [total, unreadCount, rows] = await Promise.all([
    prisma.message.count({ where }),
    unreadMessageCount(agentId),
    prisma.message.findMany({
      where,
      include: WITH_PARTIES,
      orderBy: [{ sentAt: "desc" }, { id: "asc" }],
      skip: (opts.page - 1) * MESSAGES_PAGE_SIZE,
      take: MESSAGES_PAGE_SIZE,
    }),
  ]);
  return { messages: rows.map(toMessageDTO), unreadCount, pagination: pagination(opts.page, total) };
}

export async function unreadMessageCount(agentId: string): Promise<number> {
  return prisma.message.count({ where: { toAgentId: agentId, read: false } });
}

async function findAgentMessage(agentId: string, id: string): Promise<MessageWithParties> {
  const message = await prisma.message.findFirst({ where: { id, toAgentId: agentId }, include: WITH_PARTIES });
  if (!message) throw new HttpError(404, "Message not found");
  return message;
}

export async function getAgentMessage(agentId: string, id: string): Promise<MessageDTO> {
  return toMessageDTO(await findAgentMessage(agentId, id));
}

// Reading a message also clears its "new message" notification. An already
// read message keeps its original read time.
export async function setMessageRead(agentId: string, id: string, read: boolean): Promise<MessageDTO> {
  const message = await findAgentMessage(agentId, id);
  if (message.read === read) return toMessageDTO(message);
  const readAt = read ? new Date() : null;
  const [updated] = await prisma.$transaction([
    prisma.message.update({ where: { id: message.id }, data: { read, readAt }, include: WITH_PARTIES }),
    ...(read ? [prisma.notification.updateMany({ where: { userId: agentId, messageId: message.id, readAt: null }, data: { readAt } })] : []),
  ]);
  return toMessageDTO(updated as MessageWithParties);
}
