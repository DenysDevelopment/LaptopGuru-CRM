import { EventCode, type EventTuple } from '@laptopguru-crm/shared';

export interface SecondDeltas {
  seconds: number[];
  views: number[];
  replays: number[];
  pauses: number[];
  seekAways: number[];
  uniqueSecondsWatched: number;
}

export function computeSecondDeltas(trace: EventTuple[], videoDurationMs: number): SecondDeltas {
  const videoSeconds = Math.floor(videoDurationMs / 1000);
  const watchCount = new Map<number, number>(); // total plays per second (views + replays)
  const pauses = new Map<number, number>();
  const seekAways = new Map<number, number>();

  let isPlaying = false;
  let lastPosMs = 0;

  const markSeconds = (fromMs: number, toMs: number) => {
    const from = Math.max(0, Math.floor(fromMs / 1000));
    const to = Math.min(videoSeconds - 1, Math.floor((toMs - 1) / 1000)); // inclusive end
    for (let s = from; s <= to; s++) {
      watchCount.set(s, (watchCount.get(s) ?? 0) + 1);
    }
  };

  for (const tup of trace) {
    const [, type, pos] = tup;
    switch (type as EventCode) {
      case EventCode.PLAY:
        isPlaying = true;
        lastPosMs = pos;
        break;
      case EventCode.TICK:
        if (isPlaying && pos > lastPosMs) {
          markSeconds(lastPosMs, pos);
        }
        lastPosMs = pos;
        break;
      case EventCode.PAUSE: {
        if (isPlaying && pos > lastPosMs) markSeconds(lastPosMs, pos);
        const s = Math.floor(pos / 1000);
        if (s >= 0 && s < videoSeconds) pauses.set(s, (pauses.get(s) ?? 0) + 1);
        isPlaying = false;
        lastPosMs = pos;
        break;
      }
      case EventCode.ENDED:
        if (isPlaying && pos > lastPosMs) markSeconds(lastPosMs, pos);
        isPlaying = false;
        lastPosMs = pos;
        break;
      case EventCode.SEEK: {
        const extra = tup[3] as { fromMs?: number } | undefined;
        const fromMs = typeof extra?.fromMs === 'number' ? extra.fromMs : lastPosMs;
        if (isPlaying && fromMs > lastPosMs) markSeconds(lastPosMs, fromMs);
        const s = Math.floor(fromMs / 1000);
        if (s >= 0 && s < videoSeconds) seekAways.set(s, (seekAways.get(s) ?? 0) + 1);
        lastPosMs = pos;
        break;
      }
      case EventCode.BUFFER_START:
      case EventCode.VISIBILITY_HIDDEN:
        isPlaying = false;
        lastPosMs = pos;
        break;
      case EventCode.BUFFER_END:
      case EventCode.VISIBILITY_VISIBLE:
        isPlaying = true;
        lastPosMs = pos;
        break;
      default:
        break;
    }
  }

  const seconds = [...new Set([...watchCount.keys(), ...pauses.keys(), ...seekAways.keys()])]
    .filter((s) => s >= 0 && s < videoSeconds)
    .sort((a, b) => a - b);
  const views: number[] = [];
  const replays: number[] = [];
  const pauseArr: number[] = [];
  const seekArr: number[] = [];
  for (const s of seconds) {
    const w = watchCount.get(s) ?? 0;
    views.push(w > 0 ? 1 : 0);
    replays.push(w > 1 ? w - 1 : 0);
    pauseArr.push(pauses.get(s) ?? 0);
    seekArr.push(seekAways.get(s) ?? 0);
  }

  return {
    seconds,
    views,
    replays,
    pauses: pauseArr,
    seekAways: seekArr,
    uniqueSecondsWatched: views.reduce((a, b) => a + b, 0),
  };
}
