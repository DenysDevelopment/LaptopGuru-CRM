import { validateMobileUploadToken } from "@/lib/mobile-upload-token";
import { onMobileUploadEvent } from "@/lib/mobile-upload-events";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * SSE stream: desktop modal subscribes here to get progress/complete events
 * from the mobile client. Stream auto-closes when the browser disconnects.
 *
 * This route is publicly reachable (no NextAuth session) because the desktop
 * modal fetches it with just the token — but the token is short-lived and
 * single-use, so knowledge of the token is the authz proof.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const check = await validateMobileUploadToken(token);

  if (!check.ok) {
    // If already consumed and we have a bound video, the caller likely missed
    // the last event — replay a synthetic complete so the desktop can
    // recover after a reconnect.
    if (check.reason === "consumed") {
      const row = await prisma.mobileUploadToken.findUnique({
        where: { token },
        select: { videoId: true },
      });
      if (row?.videoId) {
        const replay = `event: complete\ndata: ${JSON.stringify({ videoId: row.videoId })}\n\n`;
        return new Response(replay, {
          headers: sseHeaders(),
        });
      }
    }
    return new Response(`event: error\ndata: ${JSON.stringify({ reason: check.reason })}\n\n`, {
      headers: sseHeaders(),
    });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let expireTimer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // client already gone
        }
      };

      send("connected", {});

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": hb\n\n"));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 25_000);

      unsubscribe = onMobileUploadEvent(token, (event) => {
        send(event.type, event);
      });

      // Auto-close when the token TTL expires, so the client can surface "expired"
      // without waiting for the next navigation.
      const msUntilExpiry = check.token.expiresAt.getTime() - Date.now();
      if (msUntilExpiry > 0) {
        expireTimer = setTimeout(() => {
          send("expired", {});
          try {
            controller.close();
          } catch {
            // noop
          }
        }, msUntilExpiry + 1000);
      }
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (expireTimer) clearTimeout(expireTimer);
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}
