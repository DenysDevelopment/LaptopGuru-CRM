import { EventCode, EventTuple } from '@laptopguru-crm/shared';

export interface SecondDeltas {
  seconds: number[];
  views: number[];
  replays: number[];
  pauseCount: number[];
  seekAwayCount: number[];
  uniqueSecondsWatched: number;
}

export function computeSecondDeltas(trace: EventTuple[], videoDurationMs: number): SecondDeltas {
  const maxSecond = Math.max(0, Math.floor(videoDurationMs / 1000) - 1);
  const watched = new Map<number, number>(); // second → play count within this session
  const pauses = new Map<number, number>();
  const seekAways = new Map<number, number>();

  const markRange = (startMs: number, endMs: number) => {
    if (endMs <= startMs) return;
    const startSec = Math.max(0, Math.floor(startMs / 1000));
    const endSec = Math.min(maxSecond, Math.floor((endMs - 1) / 1000));
    for (let s = startSec; s <= endSec; s++) {
      watched.set(s, (watched.get(s) ?? 0) + 1);
    }
  };

  let isPlaying = false;
  let isHidden = false;
  let lastPlayTime = 0, lastPlayPos = 0;

  const commit = (tMs: number, pos: number) => {
    if (!isPlaying || isHidden) return;
    const realDelta = tMs - lastPlayTime;
    const posDelta = pos - lastPlayPos;
    const effective = Math.max(0, Math.min(realDelta, posDelta));
    if (effective > 0) markRange(lastPlayPos, lastPlayPos + effective);
    lastPlayTime = tMs;
    lastPlayPos = pos;
  };

  for (const tuple of trace) {
    const [tMs, type, pos, extra] = tuple as [number, number, number, Record<string, unknown>?];

    switch (type) {
      case EventCode.PLAY:
        isPlaying = true;
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
      case EventCode.PAUSE: {
        commit(tMs, pos);
        // attribute pause to the last completed second (pos - 1 avoids boundary second inflation)
        const pausePos = pos > 0 ? pos - 1 : 0;
        const sec = Math.min(maxSecond, Math.max(0, Math.floor(pausePos / 1000)));
        pauses.set(sec, (pauses.get(sec) ?? 0) + 1);
        isPlaying = false;
        break;
      }
      case EventCode.ENDED:
        commit(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.TICK:
        commit(tMs, pos);
        break;
      case EventCode.SEEK: {
        const from = typeof extra?.fromMs === 'number' ? (extra.fromMs as number) : pos;
        commit(tMs, from);  // commit using the origin position
        // only record seekAway for forward seeks (skipping content); backward seeks are replays
        if (pos > from) {
          const sec = Math.min(maxSecond, Math.max(0, Math.floor(from / 1000)));
          seekAways.set(sec, (seekAways.get(sec) ?? 0) + 1);
        }
        lastPlayTime = tMs;
        lastPlayPos = pos;  // rebase to destination
        break;
      }
      case EventCode.BUFFER_START:
        commit(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.BUFFER_END:
        isPlaying = true;
        lastPlayTime = tMs;
        lastPlayPos = pos;
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

  const allSeconds = new Set<number>([...watched.keys(), ...pauses.keys(), ...seekAways.keys()]);
  const seconds = [...allSeconds].sort((a, b) => a - b);
  const views: number[] = [];
  const replays: number[] = [];
  const pauseCountArr: number[] = [];
  const seekAwayArr: number[] = [];
  for (const s of seconds) {
    const w = watched.get(s) ?? 0;
    views.push(w > 0 ? 1 : 0);
    replays.push(Math.max(0, w - 1));
    pauseCountArr.push(pauses.get(s) ?? 0);
    seekAwayArr.push(seekAways.get(s) ?? 0);
  }

  return {
    seconds,
    views,
    replays,
    pauseCount: pauseCountArr,
    seekAwayCount: seekAwayArr,
    uniqueSecondsWatched: watched.size,
  };
}
