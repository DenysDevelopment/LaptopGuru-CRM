import { Injectable, Logger } from '@nestjs/common';

/**
 * Forwards messaging events from the API process (NestJS, port 4000) to the
 * Web process's in-memory SSE bus (Next.js, port 3000) via a small internal
 * HTTP endpoint at `/api/internal/messaging-event`.
 *
 * Without this bridge, events emitted by API-side jobs like the Allegro
 * polling cron never reach connected browsers (the SSE bus is process-local).
 *
 * Auth is shared `NEXTAUTH_SECRET` — both processes already have it.
 *
 * All calls are fire-and-forget: a failure to bridge must not break the
 * underlying job (e.g. Allegro polling). Errors are logged at warn level.
 */
@Injectable()
export class WebSseBridgeService {
  private readonly logger = new Logger(WebSseBridgeService.name);

  private get baseUrl(): string {
    return process.env.APP_URL ?? 'http://localhost:3000';
  }

  private get token(): string | undefined {
    return process.env.NEXTAUTH_SECRET;
  }

  private async post(body: Record<string, unknown>): Promise<void> {
    if (!this.token) {
      this.logger.warn('NEXTAUTH_SECRET missing — skipping SSE bridge');
      return;
    }
    try {
      const res = await fetch(`${this.baseUrl}/api/internal/messaging-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': this.token,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          `SSE bridge ${res.status}: ${text.slice(0, 200)}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `SSE bridge failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  pushNewMessage(conversationId: string, messageId: string): Promise<void> {
    return this.post({ type: 'new_message', conversationId, messageId });
  }

  pushNewConversation(conversationId: string): Promise<void> {
    return this.post({ type: 'new_conversation', conversationId });
  }

  pushConversationUpdated(
    conversationId: string,
    options: { action?: string; patch?: Record<string, unknown> } = {},
  ): Promise<void> {
    return this.post({
      type: 'conversation_updated',
      conversationId,
      ...(options.action ? { action: options.action } : {}),
      ...(options.patch ? { patch: options.patch } : {}),
    });
  }
}
