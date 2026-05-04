/**
 * In-memory event bus for messaging real-time updates.
 * Used by SSE endpoint and webhook handlers.
 *
 * Events carry the full payload (message or conversation summary) so the
 * frontend can append/patch its local state instead of refetching the full
 * list/thread on every change. Emitters that can't construct a full payload
 * may omit it — the client treats absence as "patch unknown, please refetch".
 */

export type MessageDirection = "INBOUND" | "OUTBOUND";

export interface SsePayloadMessage {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  contentType: string;
  body: string;
  createdAt: string;
  sender?: { id: string; name: string | null; email?: string | null } | null;
  contact?: {
    id: string;
    name?: string | null;
    avatarUrl?: string | null;
  } | null;
  attachments?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    url: string;
    size: number;
  }>;
  metadata?: Record<string, unknown> | null;
  status?: string;
}

export interface SsePayloadConversationSummary {
  id: string;
  status: string;
  priority: string;
  channelType: string;
  subject: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
  closedAt: string | null;
  contact: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
  } | null;
  assignee: { id: string; name: string | null; email?: string } | null;
  tags: Array<{ id: string; name: string; color: string }>;
  unreadCount: number;
}

export type MessagingEvent =
  | {
      type: "new_message";
      conversationId: string;
      /** Full message — when present, the client appends without refetching. */
      message?: SsePayloadMessage;
      /** Patch fields for the conversation list item (lastMessageAt etc). */
      conversationPatch?: Partial<SsePayloadConversationSummary>;
    }
  | {
      type: "new_conversation";
      conversationId: string;
      /** Required for the client to prepend without refetching. */
      conversation: SsePayloadConversationSummary;
    }
  | {
      type: "conversation_updated";
      conversationId: string;
      /** Subset of fields that changed — client patches its list item. */
      patch?: Partial<SsePayloadConversationSummary>;
      /** Free-form action hint (e.g. "read", "status_changed"). */
      action?: string;
    };

type Listener = (event: MessagingEvent) => void;

const listeners = new Set<Listener>();

export function emitMessagingEvent(event: MessagingEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // ignore
    }
  }
}

export function onMessagingEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
