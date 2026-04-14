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

export type EventExtra =
  | { fromMs: number }                      // SEEK
  | { playbackRate: number }                // RATE
  | { volume: number; muted: boolean }      // VOLUME
  | { durationMs: number }                  // BUFFER_END
  | { label: string }                       // QUALITY
  | { message: string }                     // ERROR
  | Record<string, unknown>;

export type EventTuple =
  | [tMs: number, type: EventCode, posMs: number]
  | [tMs: number, type: EventCode, posMs: number, extra: EventExtra];

export type EventTypeName =
  | 'TICK' | 'PLAY' | 'PAUSE' | 'SEEK' | 'ENDED' | 'RATE'
  | 'VOLUME' | 'FULLSCREEN_ON' | 'FULLSCREEN_OFF'
  | 'BUFFER_START' | 'BUFFER_END' | 'QUALITY'
  | 'ERROR' | 'VISIBILITY_HIDDEN' | 'VISIBILITY_VISIBLE'
  | 'UNKNOWN';

export interface DecodedEvent {
  tMs: number;
  posMs: number;
  type: EventTypeName;
  fromMs?: number;
  playbackRate?: number;
  volume?: number;
  muted?: boolean;
  bufferDurationMs?: number;
  qualityLabel?: string;
  message?: string;
}

const CODE_TO_NAME: Record<number, EventTypeName> = {
  0: 'TICK', 1: 'PLAY', 2: 'PAUSE', 3: 'SEEK', 4: 'ENDED',
  5: 'RATE', 6: 'VOLUME', 7: 'FULLSCREEN_ON', 8: 'FULLSCREEN_OFF',
  9: 'BUFFER_START', 10: 'BUFFER_END', 11: 'QUALITY', 12: 'ERROR',
  13: 'VISIBILITY_HIDDEN', 14: 'VISIBILITY_VISIBLE',
};

export function encodeEvent(tMs: number, type: EventCode, posMs: number, extra?: EventExtra): EventTuple {
  return extra === undefined ? [tMs, type, posMs] : [tMs, type, posMs, extra];
}

export function decodeTrace(trace: EventTuple[]): DecodedEvent[] {
  const out: DecodedEvent[] = [];
  for (const tuple of trace) {
    const [tMs, rawCode, posMs, extra] = tuple as [number, number, number, Record<string, unknown>?];
    const name = CODE_TO_NAME[rawCode] ?? 'UNKNOWN';
    const ev: DecodedEvent = { tMs, posMs, type: name };
    if (extra && typeof extra === 'object') {
      if (typeof extra.fromMs === 'number') ev.fromMs = extra.fromMs;
      if (typeof extra.playbackRate === 'number') ev.playbackRate = extra.playbackRate;
      if (typeof extra.volume === 'number') ev.volume = extra.volume;
      if (typeof extra.muted === 'boolean') ev.muted = extra.muted;
      if (typeof extra.durationMs === 'number') ev.bufferDurationMs = extra.durationMs;
      if (typeof extra.label === 'string') ev.qualityLabel = extra.label;
      if (typeof extra.message === 'string') ev.message = extra.message;
    }
    out.push(ev);
  }
  return out;
}

// Read-side shapes used by the API and dashboard ------------------------------

export interface VideoAnalyticsOverview {
  sessions: number;
  uniqueVisitors: number;
  avgWatchTimeMs: number;
  completionRate: number;    // 0..1
  errorCount: number;
}

export interface VideoRetentionPoint {
  second: number;
  views: number;
  replays: number;
  pauseCount: number;
  seekAwayCount: number;
}

export interface VideoAnalyticsData {
  overview: VideoAnalyticsOverview;
  retention: VideoRetentionPoint[];
  devices: { deviceType: string; sessions: number }[];
  browsers: { browser: string; sessions: number }[];
  geography: { country: string; sessions: number }[];
  referrers: { referrerDomain: string; sessions: number }[];
  recentSessions: {
    id: string;
    visitId: string;
    landingSlug: string;
    startedAt: string;
    endedAt: string | null;
    durationWatchedMs: number;
    completionPercent: number;
    endReason: string | null;
    country: string | null;
    deviceType: string | null;
    browser: string | null;
  }[];
}

export interface VisitPlaybackSession {
  id: string;
  videoId: string;
  videoDurationMs: number;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  durationWatchedMs: number;
  completionPercent: number;
  trace: DecodedEvent[];
}

export interface VisitPlaybackData {
  sessions: VisitPlaybackSession[];
}
