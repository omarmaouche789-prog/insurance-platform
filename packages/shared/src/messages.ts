// Admin → agent messages. Admins send, agents read; there are no replies yet.

export const MESSAGE_SUBJECT_MAX = 200;
export const MESSAGE_BODY_MAX = 5000;
export const MESSAGES_PAGE_SIZE = 20;

export interface MessagePartyDTO {
  id: string;
  name: string;
}

export interface MessageDTO {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
  read: boolean;
  readAt: string | null;
  from: MessagePartyDTO;
  to: MessagePartyDTO;
}

export interface MessagePaginationDTO {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface AgentMessageListResponseDTO {
  messages: MessageDTO[];
  unreadCount: number;
  pagination: MessagePaginationDTO;
}

export interface AdminMessageListResponseDTO {
  messages: MessageDTO[];
  pagination: MessagePaginationDTO;
}

export interface SendMessageRequestDTO {
  toAgentId: string;
  subject: string;
  body: string;
}
