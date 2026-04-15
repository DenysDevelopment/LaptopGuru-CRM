import { EventCode, EventTuple } from '@laptopguru-crm/shared';

export interface SessionAggregates {
  playCount: number;
  pauseCount: number;
  seekCount: number;
  bufferCount: number;
  errorCount: number;
  bufferTimeMs: number;
  durationWatchedMs: number;
  maxPositionMs: number;
  completionPercent: number;
}

export function computeAggregates(trace: EventTuple[], videoDurationMs: number): SessionAggregates {
  let playCount = 0, pauseCount = 0, seekCount = 0;
  let bufferCount = 0, errorCount = 0, bufferTimeMs = 0;
  let durationWatchedMs = 0, maxPositionMs = 0;
  let bufferStartTime = 0;
  let lastPlayTime = 0, lastPlayPos = 0;
  let isPlaying = false;
  let isHidden = false;

  const commit = (tMs: number, pos: number) => {
    if (!isPlaying || isHidden) return;
    const realDelta = tMs - lastPlayTime;
    const posDelta = pos - lastPlayPos;
    if (realDelta > 0 && posDelta > 0) {
      durationWatchedMs += Math.max(0, Math.min(realDelta, posDelta));
    }
    lastPlayTime = tMs;
    lastPlayPos = pos;
  };

  for (const tuple of trace) {
    const [tMs, type, pos] = tuple;
    maxPositionMs = Math.max(maxPositionMs, pos);

    switch (type) {
      case EventCode.PLAY:
        playCount++;
        isPlaying = true;
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
      case EventCode.PAUSE:
        pauseCount++;
        commit(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.ENDED:
        commit(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.TICK:
        commit(tMs, pos);
        break;
      case EventCode.SEEK:
        seekCount++;
        // close out the pre-seek interval, then rebase to new pos
        commit(tMs, pos);
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
      case EventCode.BUFFER_START:
        bufferCount++;
        commit(tMs, pos);
        bufferStartTime = tMs;
        // pause the duration clock while buffering
        isPlaying = false;
        break;
      case EventCode.BUFFER_END:
        if (bufferStartTime > 0) bufferTimeMs += tMs - bufferStartTime;
        bufferStartTime = 0;
        isPlaying = true;
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
      case EventCode.ERROR:
        errorCount++;
        commit(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.VISIBILITY_HIDDEN:
        commit(tMs, pos);
        isHidden = true;
        break;
      case EventCode.VISIBILITY_VISIBLE:
        isHidden = false;
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
    }
  }

  const completionPercent =
    videoDurationMs > 0 ? Math.min(1, maxPositionMs / videoDurationMs) : 0;

  return {
    playCount, pauseCount, seekCount,
    bufferCount, errorCount, bufferTimeMs,
    durationWatchedMs, maxPositionMs, completionPercent,
  };
}
