'use client';

import { useEffect, useRef } from 'react';
import {
  EventCode,
  type EventTuple,
  type SessionEndReason,
  type AppendChunkRequest,
  type CreateSessionRequest,
  type CreateSessionResponse,
} from '@laptopguru-crm/shared';

interface UseVideoTrackerOpts {
  slug: string;
  visitIdRef: React.MutableRefObject<string | null>;
  visitReady: Promise<string>;
  videoId: string;
  videoSource: 'S3' | 'YOUTUBE';
  videoElementRef?: React.MutableRefObject<HTMLVideoElement | null>;
  // YouTube iframe Player API instance — see YouTube adapter below
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ytPlayer?: any;
}

type TrackerState = {
  sessionId: string | null;
  startedAt: number;
  seq: number;
  buffer: EventTuple[];
  pendingCreate: Promise<string | null> | null;
  lastTickPos: number;
  pauseLongTimer: ReturnType<typeof setTimeout> | null;
  flushTimer: ReturnType<typeof setInterval> | null;
  tickTimer: ReturnType<typeof setInterval> | null;
  finalized: boolean;
  inFlightChunk: Promise<void> | null;
};

const FLUSH_INTERVAL_MS = 3000;
const TICK_INTERVAL_MS = 250;
const PAUSE_LONG_MS = 60_000;
const MAX_BUFFER = 100;
const MAX_MEM_BUFFER = 500;

function now() {
  return Date.now();
}

async function post(url: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

function beacon(url: string, body: unknown): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
  try {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    return navigator.sendBeacon(url, blob);
  } catch {
    return false;
  }
}

export function useVideoTracker(opts: UseVideoTrackerOpts) {
  const state = useRef<TrackerState>({
    sessionId: null,
    startedAt: 0,
    seq: 0,
    buffer: [],
    pendingCreate: null,
    lastTickPos: 0,
    pauseLongTimer: null,
    flushTimer: null,
    tickTimer: null,
    finalized: false,
    inFlightChunk: null,
  });

  const getDuration = (): number => {
    const el = opts.videoElementRef?.current;
    if (el) return Math.round((el.duration || 0) * 1000);
    if (opts.ytPlayer && typeof opts.ytPlayer.getDuration === 'function') {
      return Math.round((opts.ytPlayer.getDuration() || 0) * 1000);
    }
    return 0;
  };

  const getCurrentTimeMs = (): number => {
    const el = opts.videoElementRef?.current;
    if (el) return Math.round(el.currentTime * 1000);
    if (opts.ytPlayer && typeof opts.ytPlayer.getCurrentTime === 'function') {
      return Math.round(opts.ytPlayer.getCurrentTime() * 1000);
    }
    return state.current.lastTickPos;
  };

  const relTime = () => (state.current.startedAt ? now() - state.current.startedAt : 0);

  const ensureSession = async (): Promise<string | null> => {
    if (state.current.sessionId) return state.current.sessionId;
    if (state.current.pendingCreate) return state.current.pendingCreate;

    state.current.pendingCreate = (async () => {
      const visitId = opts.visitIdRef.current ?? (await opts.visitReady);
      const body: CreateSessionRequest = {
        slug: opts.slug,
        visitId,
        videoId: opts.videoId,
        videoDurationMs: getDuration(),
        clientStartedAt: new Date(state.current.startedAt || now()).toISOString(),
      };
      try {
        const r = await post('/api/public/video-sessions', body);
        if (!r.ok) return null;
        const data = (await r.json()) as CreateSessionResponse;
        state.current.sessionId = data.sessionId;
        return data.sessionId;
      } catch {
        return null;
      } finally {
        state.current.pendingCreate = null;
      }
    })();
    return state.current.pendingCreate;
  };

  const flush = async (opts2?: { final?: boolean; endReason?: SessionEndReason; useBeacon?: boolean }) => {
    const s = state.current;
    if (s.finalized) return;
    if (s.buffer.length === 0 && !opts2?.final) return;

    // Serialize concurrent flushes. A second call returns the first's promise so
    // seq/buffer updates stay consistent.
    if (s.inFlightChunk) {
      await s.inFlightChunk;
      // After the prior flush resolves, fall through only if there's still work
      // to do. This matters because the first flush may have drained the buffer.
      if (s.buffer.length === 0 && !opts2?.final) return;
    }

    const promise = (async () => {
      const sessionId = s.sessionId || (await ensureSession());
      if (!sessionId) return;

      const events = s.buffer;
      s.buffer = [];
      const body: AppendChunkRequest = {
        seq: s.seq++,
        events,
        final: !!opts2?.final,
        endReason: opts2?.endReason,
      };
      const url = opts2?.useBeacon
        ? `/api/public/video-sessions/${sessionId}/chunks/beacon`
        : `/api/public/video-sessions/${sessionId}/chunks`;

      if (opts2?.useBeacon && beacon(url, body)) {
        if (opts2?.final) s.finalized = true;
        return;
      }

      try {
        const r = await post(url, body);
        if (!r.ok && r.status !== 202) {
          if (r.status !== 410) {
            s.buffer = events.concat(s.buffer);
            if (s.buffer.length > MAX_MEM_BUFFER) {
              s.buffer = s.buffer.filter((e) => e[1] !== EventCode.TICK).slice(-MAX_MEM_BUFFER);
            }
            s.seq--;
            return;
          }
        }
      } catch {
        s.buffer = events.concat(s.buffer);
        s.seq--;
        return;
      }

      if (opts2?.final) s.finalized = true;
    })();

    s.inFlightChunk = promise;
    try {
      await promise;
    } finally {
      s.inFlightChunk = null;
    }
  };

  const push = (tuple: EventTuple, opts2?: { flush?: boolean }) => {
    state.current.buffer.push(tuple);
    if (opts2?.flush || state.current.buffer.length >= MAX_BUFFER) {
      void flush();
    }
  };

  const startTimers = () => {
    if (state.current.flushTimer == null) {
      state.current.flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    }
    if (state.current.tickTimer == null) {
      state.current.tickTimer = setInterval(() => {
        const pos = getCurrentTimeMs();
        if (pos !== state.current.lastTickPos) {
          state.current.lastTickPos = pos;
          push([relTime(), EventCode.TICK, pos]);
        }
      }, TICK_INTERVAL_MS);
    }
  };

  const stopTickTimer = () => {
    if (state.current.tickTimer != null) {
      clearInterval(state.current.tickTimer);
      state.current.tickTimer = null;
    }
  };

  const stopTimers = () => {
    stopTickTimer();
    if (state.current.flushTimer != null) {
      clearInterval(state.current.flushTimer);
      state.current.flushTimer = null;
    }
  };

  const onPlay = () => {
    if (state.current.finalized) {
      // New session after prior seal
      state.current.sessionId = null;
      state.current.seq = 0;
      state.current.finalized = false;
    }
    if (!state.current.startedAt) state.current.startedAt = now();
    push([relTime(), EventCode.PLAY, getCurrentTimeMs()]);
    if (state.current.pauseLongTimer) {
      clearTimeout(state.current.pauseLongTimer);
      state.current.pauseLongTimer = null;
    }
    startTimers();
  };

  const onPause = () => {
    push([relTime(), EventCode.PAUSE, getCurrentTimeMs()], { flush: true });
    stopTickTimer();
    state.current.pauseLongTimer = setTimeout(() => {
      void flush({ final: true, endReason: 'PAUSED_LONG' });
    }, PAUSE_LONG_MS);
  };

  const onEnded = () => {
    push([relTime(), EventCode.ENDED, getCurrentTimeMs()], { flush: true });
    void flush({ final: true, endReason: 'ENDED' });
    stopTimers();
  };

  const onSeek = (fromMs: number, toMs: number) => {
    push([relTime(), EventCode.SEEK, toMs, { fromMs }], { flush: true });
  };

  const onBufferStart = () => push([relTime(), EventCode.BUFFER_START, getCurrentTimeMs()]);
  const onBufferEnd = (durationMs: number) =>
    push([relTime(), EventCode.BUFFER_END, getCurrentTimeMs(), { durationMs }]);

  const onRate = (rate: number) => push([relTime(), EventCode.RATE, getCurrentTimeMs(), { playbackRate: rate }]);
  const onVolume = (v: number, muted: boolean) =>
    push([relTime(), EventCode.VOLUME, getCurrentTimeMs(), { volume: v, muted }]);
  const onFullscreen = (on: boolean) =>
    push([relTime(), on ? EventCode.FULLSCREEN_ON : EventCode.FULLSCREEN_OFF, getCurrentTimeMs()]);
  const onError = (message: string) =>
    push([relTime(), EventCode.ERROR, getCurrentTimeMs(), { message: message.slice(0, 500) }], { flush: true });

  useEffect(() => {
    const onVis = () => {
      const pos = getCurrentTimeMs();
      if (document.visibilityState === 'hidden') {
        push([relTime(), EventCode.VISIBILITY_HIDDEN, pos]);
        void flush({ useBeacon: true });
      } else {
        push([relTime(), EventCode.VISIBILITY_VISIBLE, pos]);
      }
    };
    const onPageHide = (e: PageTransitionEvent) => {
      void flush({ useBeacon: true, final: !e.persisted, endReason: !e.persisted ? 'CLOSED' : undefined });
    };
    const onFreeze = () => void flush({ useBeacon: true });
    const onBeforeUnload = () => void flush({ useBeacon: true, final: true, endReason: 'CLOSED' });

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('freeze', onFreeze);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('freeze', onFreeze);
      window.removeEventListener('beforeunload', onBeforeUnload);
      // SPA navigation: seal the session before disposing timers.
      if (!state.current.finalized && state.current.startedAt > 0) {
        void flush({ useBeacon: true, final: true, endReason: 'NAVIGATED' });
      }
      stopTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    onPlay,
    onPause,
    onEnded,
    onSeek,
    onBufferStart,
    onBufferEnd,
    onRate,
    onVolume,
    onFullscreen,
    onError,
  };
}
