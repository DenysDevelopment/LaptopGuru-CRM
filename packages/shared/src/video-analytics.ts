// ============================================================================
// Event codes — integer tuples for compact trace storage.
// Never renumber existing codes. Add new ones at the end.
// ============================================================================

export enum EventCode {
  TICK = 0,
  PLAY = 1,
  PAUSE = 2,
  SEEK = 3,
  ENDED = 4,
  RATE = 5,
  VOLUME = 6,
  FULLSCREEN_ON = 7,
  FULLSCREEN_OFF = 8,
  BUFFER_START = 9,
  BUFFER_END = 10,
  QUALITY = 11,
  ERROR = 12,
  VISIBILITY_HIDDEN = 13,
  VISIBILITY_VISIBLE = 14,
}

// Tuple: [tMs, typeCode, posMs, extra?]
//   tMs    — ms since session startedAt
//   posMs  — position in video in ms
//   extra  — type-dependent (see EventExtras)
export type EventTuple = [number, number, number, unknown?];

export type EventExtras = {
  [EventCode.SEEK]: { fromMs: number };
  [EventCode.RATE]: { playbackRate: number };
  [EventCode.VOLUME]: { volume: number; muted: boolean };
  [EventCode.BUFFER_END]: { durationMs: number };
  [EventCode.QUALITY]: { label: string };
  [EventCode.ERROR]: { message: string };
};

export type DecodedEvent =
  | { tMs: number; type: EventCode.TICK; posMs: number }
  | { tMs: number; type: EventCode.PLAY; posMs: number }
  | { tMs: number; type: EventCode.PAUSE; posMs: number }
  | { tMs: number; type: EventCode.SEEK; posMs: number; fromMs: number }
  | { tMs: number; type: EventCode.ENDED; posMs: number }
  | { tMs: number; type: EventCode.RATE; posMs: number; playbackRate: number }
  | { tMs: number; type: EventCode.VOLUME; posMs: number; volume: number; muted: boolean }
  | { tMs: number; type: EventCode.FULLSCREEN_ON; posMs: number }
  | { tMs: number; type: EventCode.FULLSCREEN_OFF; posMs: number }
  | { tMs: number; type: EventCode.BUFFER_START; posMs: number }
  | { tMs: number; type: EventCode.BUFFER_END; posMs: number; durationMs: number }
  | { tMs: number; type: EventCode.QUALITY; posMs: number; label: string }
  | { tMs: number; type: EventCode.ERROR; posMs: number; message: string }
  | { tMs: number; type: EventCode.VISIBILITY_HIDDEN; posMs: number }
  | { tMs: number; type: EventCode.VISIBILITY_VISIBLE; posMs: number };

export function decodeTrace(trace: EventTuple[]): DecodedEvent[] {
  const out: DecodedEvent[] = [];
  for (const tup of trace) {
    const [tMs, type, posMs, extra] = tup;
    switch (type as EventCode) {
      case EventCode.SEEK:
        out.push({ tMs, type, posMs, fromMs: (extra as { fromMs?: number })?.fromMs ?? posMs });
        break;
      case EventCode.RATE:
        out.push({ tMs, type, posMs, playbackRate: (extra as { playbackRate?: number })?.playbackRate ?? 1 });
        break;
      case EventCode.VOLUME: {
        const e = extra as { volume?: number; muted?: boolean } | undefined;
        out.push({ tMs, type, posMs, volume: e?.volume ?? 1, muted: e?.muted ?? false });
        break;
      }
      case EventCode.BUFFER_END:
        out.push({ tMs, type, posMs, durationMs: (extra as { durationMs?: number })?.durationMs ?? 0 });
        break;
      case EventCode.QUALITY:
        out.push({ tMs, type, posMs, label: (extra as { label?: string })?.label ?? '' });
        break;
      case EventCode.ERROR:
        out.push({ tMs, type, posMs, message: (extra as { message?: string })?.message ?? '' });
        break;
      case EventCode.TICK:
      case EventCode.PLAY:
      case EventCode.PAUSE:
      case EventCode.ENDED:
      case EventCode.FULLSCREEN_ON:
      case EventCode.FULLSCREEN_OFF:
      case EventCode.BUFFER_START:
      case EventCode.VISIBILITY_HIDDEN:
      case EventCode.VISIBILITY_VISIBLE:
        out.push({ tMs, type, posMs } as DecodedEvent);
        break;
      default:
        // Unknown code — skip. Keeps the decoder forward-compatible.
        break;
    }
  }
  return out;
}

export function encodeTrace(events: DecodedEvent[]): EventTuple[] {
  return events.map((e) => {
    switch (e.type) {
      case EventCode.SEEK:
        return [e.tMs, e.type, e.posMs, { fromMs: e.fromMs }];
      case EventCode.RATE:
        return [e.tMs, e.type, e.posMs, { playbackRate: e.playbackRate }];
      case EventCode.VOLUME:
        return [e.tMs, e.type, e.posMs, { volume: e.volume, muted: e.muted }];
      case EventCode.BUFFER_END:
        return [e.tMs, e.type, e.posMs, { durationMs: e.durationMs }];
      case EventCode.QUALITY:
        return [e.tMs, e.type, e.posMs, { label: e.label }];
      case EventCode.ERROR:
        return [e.tMs, e.type, e.posMs, { message: e.message }];
      default:
        return [e.tMs, e.type, e.posMs];
    }
  });
}

// ============================================================================
// Ingestion DTOs
// ============================================================================

export interface CreateSessionRequest {
  slug: string;
  visitId: string;
  videoId: string;
  videoDurationMs: number;
  clientStartedAt: string; // ISO timestamp
}

export interface CreateSessionResponse {
  sessionId: string;
}

export type SessionEndReason = 'ENDED' | 'PAUSED_LONG' | 'CLOSED' | 'NAVIGATED' | 'ERROR' | 'INCOMPLETE';

export interface AppendChunkRequest {
  seq: number;
  events: EventTuple[];
  final: boolean;
  endReason?: SessionEndReason;
}

// ============================================================================
// Read-side types
// ============================================================================

export interface VideoAnalyticsOverview {
  totalViews: number;
  uniqueViewers: number;
  totalWatchTime: number;   // seconds
  avgViewDuration: number;  // seconds
  completionRate: number;   // 0..1
  playRate: number;         // 0..1
  errorCount: number;
}

export interface VideoRetentionPoint {
  second: number;
  views: number;
  replays: number;
  viewersPercent: number;
}

export interface VideoAnalyticsData {
  overview: VideoAnalyticsOverview;
  durationSeconds: number;
  retention: VideoRetentionPoint[];
  topSeekAwaySeconds: { second: number; count: number }[];
  topPauseSeconds: { second: number; count: number }[];
  viewsTimeSeries: { date: string; views: number }[];
  geography: { country: string; views: number }[];
  devices: { deviceType: string; views: number }[];
  browsers: { browser: string; views: number }[];
  os: { os: string; views: number }[];
  referrers: { referrerDomain: string; views: number }[];
  recentSessions: {
    sessionId: string;
    visitId: string;
    startedAt: string;
    durationWatchedMs: number;
    completionPercent: number;
    endReason: SessionEndReason | null;
    country: string | null;
    device: string | null;
    browser: string | null;
  }[];
}

export interface VisitPlaybackSession {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  endReason: SessionEndReason | null;
  videoDurationMs: number;
  durationWatchedMs: number;
  completionPercent: number;
  events: DecodedEvent[];
}

export interface VisitPlaybackData {
  visitId: string;
  videoId: string;
  sessions: VisitPlaybackSession[];
}
