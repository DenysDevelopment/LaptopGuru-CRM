/**
 * In-memory event bus for mobile-upload real-time updates.
 *
 * Each token has its own listener set (short-lived; cleared after the desktop
 * SSE stream closes or the token is consumed). Used by the SSE endpoint
 * (/api/videos/mobile-upload/[token]/events) and by the public upload routes
 * that fire progress/complete events on behalf of the mobile client.
 */

export type MobileUploadEvent =
  | { type: "progress"; pct: number }
  | { type: "uploading" }
  | { type: "complete"; videoId: string }
  | { type: "failed"; reason: string };

type Listener = (event: MobileUploadEvent) => void;

const listenersByToken = new Map<string, Set<Listener>>();

export function emitMobileUploadEvent(token: string, event: MobileUploadEvent): void {
  const set = listenersByToken.get(token);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      // ignore
    }
  }
}

export function onMobileUploadEvent(token: string, listener: Listener): () => void {
  let set = listenersByToken.get(token);
  if (!set) {
    set = new Set();
    listenersByToken.set(token, set);
  }
  set.add(listener);
  return () => {
    const current = listenersByToken.get(token);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listenersByToken.delete(token);
    }
  };
}
