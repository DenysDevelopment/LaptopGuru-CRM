import { EventCode, type EventTuple } from '@laptopguru-crm/shared';

export interface SessionAggregates {
  durationWatchedMs: number;
  maxPositionMs: number;
  completionPercent: number;
  playCount: number;
  pauseCount: number;
  seekCount: number;
  bufferCount: number;
  bufferTimeMs: number;
  errorCount: number;
}

export function computeAggregates(trace: EventTuple[], videoDurationMs: number): SessionAggregates {
  let playCount = 0;
  let pauseCount = 0;
  let seekCount = 0;
  let bufferCount = 0;
  let errorCount = 0;
  let bufferTimeMs = 0;
  let durationWatchedMs = 0;
  let maxPositionMs = 0;

  let isPlaying = false;
  let lastTime = 0;
  let lastPos = 0;
  let bufferStart = 0;

  const flushDelta = (tMs: number, pos: number) => {
    if (!isPlaying) return;
    const realDelta = tMs - lastTime;
    const posDelta = pos - lastPos;
    if (realDelta <= 0 || posDelta <= 0) return;
    durationWatchedMs += Math.min(realDelta, posDelta);
  };

  for (const tup of trace) {
    const [tMs, type, pos] = tup;
    if (typeof pos === 'number' && pos > maxPositionMs) maxPositionMs = pos;

    switch (type as EventCode) {
      case EventCode.PLAY:
        playCount++;
        isPlaying = true;
        lastTime = tMs;
        lastPos = pos;
        break;
      case EventCode.PAUSE:
        pauseCount++;
        flushDelta(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.ENDED:
        flushDelta(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.TICK:
        flushDelta(tMs, pos);
        lastTime = tMs;
        lastPos = pos;
        break;
      case EventCode.SEEK:
        seekCount++;
        // Seek resets the play anchor without counting the gap.
        lastTime = tMs;
        lastPos = pos;
        break;
      case EventCode.BUFFER_START:
        bufferCount++;
        bufferStart = tMs;
        // Treat buffer like pause for duration accounting.
        flushDelta(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.BUFFER_END:
        if (bufferStart > 0) bufferTimeMs += tMs - bufferStart;
        bufferStart = 0;
        // Resume playing from here.
        isPlaying = true;
        lastTime = tMs;
        lastPos = pos;
        break;
      case EventCode.VISIBILITY_HIDDEN:
        // Treat as pause for duration accounting but keep counter-free.
        flushDelta(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.VISIBILITY_VISIBLE:
        // Resume, without counting as a new play.
        // Only resume if the prior state was visibility-hidden (we cannot tell
        // here — err on the side of resuming; downstream TICK will re-anchor).
        isPlaying = true;
        lastTime = tMs;
        lastPos = pos;
        break;
      case EventCode.ERROR:
        errorCount++;
        break;
      default:
        break;
    }
  }

  const completionPercent =
    videoDurationMs > 0 ? Math.min(1, Math.max(0, maxPositionMs / videoDurationMs)) : 0;

  return {
    durationWatchedMs,
    maxPositionMs,
    completionPercent,
    playCount,
    pauseCount,
    seekCount,
    bufferCount,
    bufferTimeMs,
    errorCount,
  };
}
