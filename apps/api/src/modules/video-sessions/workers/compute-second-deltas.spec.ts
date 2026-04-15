import { describe, it, expect } from 'vitest';
import { computeSecondDeltas } from './compute-second-deltas';
import { EventCode, EventTuple } from '@laptopguru-crm/shared';

describe('computeSecondDeltas', () => {
  const dur = 300_000;

  it('returns empty arrays for empty trace', () => {
    const r = computeSecondDeltas([], dur);
    expect(r.seconds).toEqual([]);
    expect(r.views).toEqual([]);
    expect(r.replays).toEqual([]);
    expect(r.pauseCount).toEqual([]);
    expect(r.seekAwayCount).toEqual([]);
    expect(r.uniqueSecondsWatched).toBe(0);
  });

  it('linear play 0→10s → views=1 seconds 0..9, replays=0', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [10_000, EventCode.PAUSE, 10_000],
    ];
    const r = computeSecondDeltas(trace, dur);
    expect(r.seconds).toEqual([0,1,2,3,4,5,6,7,8,9]);
    expect(r.views).toEqual([1,1,1,1,1,1,1,1,1,1]);
    expect(r.replays).toEqual([0,0,0,0,0,0,0,0,0,0]);
    expect(r.uniqueSecondsWatched).toBe(10);
  });

  it('play 0→5, seek back to 2, play 2→5 → replays=1 for seconds 2,3,4', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.SEEK, 2000, { fromMs: 5000 }],
      [5000, EventCode.PLAY, 2000],
      [8000, EventCode.PAUSE, 5000],
    ];
    const r = computeSecondDeltas(trace, dur);
    expect(r.views).toEqual([1,1,1,1,1]);                 // seconds 0..4 viewed at least once
    // seconds 2,3,4 get replayed once (play 2→5 after the first play 0→5)
    expect(r.replays[r.seconds.indexOf(2)]).toBe(1);
    expect(r.replays[r.seconds.indexOf(3)]).toBe(1);
    expect(r.replays[r.seconds.indexOf(4)]).toBe(1);
    expect(r.replays[r.seconds.indexOf(0)]).toBe(0);
  });

  it('pause at second 3 → pauseCount[3]=1', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [3500, EventCode.PAUSE, 3500],
    ];
    const r = computeSecondDeltas(trace, dur);
    expect(r.pauseCount[r.seconds.indexOf(3)]).toBe(1);
  });

  it('seek away from second 5 → seekAwayCount[5]=1', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.SEEK, 10_000, { fromMs: 5000 }],
      [6000, EventCode.PAUSE, 11_000],
    ];
    const r = computeSecondDeltas(trace, dur);
    expect(r.seekAwayCount[r.seconds.indexOf(5)]).toBe(1);
  });

  it('pos > videoDurationMs (rounding slack) writes nothing out of range', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, dur - 500],
      [500, EventCode.TICK, dur + 200],
      [600, EventCode.PAUSE, dur + 200],
    ];
    const r = computeSecondDeltas(trace, dur);
    for (const s of r.seconds) expect(s).toBeLessThan(dur / 1000);
  });

  it('forward seek does not add views to skipped seconds', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [2000, EventCode.SEEK, 10_000, { fromMs: 2000 }],
      [3000, EventCode.PAUSE, 11_000],
    ];
    const r = computeSecondDeltas(trace, dur);
    // only seconds 0..1 and 10 should appear as viewed
    expect(r.seconds).toContain(0);
    expect(r.seconds).toContain(1);
    expect(r.seconds).toContain(10);
    expect(r.seconds).not.toContain(5);
  });
});
