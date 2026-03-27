"use client";

import { useEffect, useRef } from "react";

const MAX_RETRIES = 10;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

interface MessagingEvent {
  type: "new_message" | "conversation_updated" | "new_conversation";
  conversationId: string;
  data?: Record<string, unknown>;
}

type EventHandler = (event: MessagingEvent) => void;

/**
 * Hook that listens to Server-Sent Events from /api/messaging/events.
 * Automatically reconnects on disconnect with exponential backoff (max 10 retries).
 */
export function useMessagingEvents(onEvent: EventHandler) {
  const handlerRef = useRef(onEvent);
  const retryCountRef = useRef(0);

  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    let closed = false;
    let eventSource: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      eventSource = new EventSource("/api/messaging/events");

      const handleMessage = (type: string) => (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handlerRef.current({ ...data, type });
        } catch {
          // ignore parse errors
        }
      };

      eventSource.addEventListener("new_message", handleMessage("new_message"));
      eventSource.addEventListener("new_conversation", handleMessage("new_conversation"));
      eventSource.addEventListener("conversation_updated", handleMessage("conversation_updated"));

      eventSource.onopen = () => {
        retryCountRef.current = 0;
      };

      eventSource.onerror = () => {
        eventSource?.close();

        if (closed) return;

        if (retryCountRef.current >= MAX_RETRIES) {
          console.warn("[MessagingEvents] Max retries reached, giving up");
          return;
        }

        const backoff = Math.min(
          INITIAL_BACKOFF_MS * Math.pow(2, retryCountRef.current),
          MAX_BACKOFF_MS,
        );
        retryCountRef.current += 1;
        retryTimer = setTimeout(connect, backoff);
      };
    }

    connect();

    return () => {
      closed = true;
      eventSource?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);
}
