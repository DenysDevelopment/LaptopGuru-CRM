import { describe, it, expect } from 'vitest';
import { computeSecondDeltas } from './compute-second-deltas';
import { EventCode, type EventTuple } from '@laptopguru-crm/shared';

const DUR = 10_000;

describe('computeSecondDeltas', () => {
  it('empty trace returns empty arrays', () => {
    const d = computeSecondDeltas([], DUR);
    expect(d.seconds).toEqual([]);
    expect(d.views).toEqual([]);
    expect(d.replays).toEqual([]);
  });

  it('linear play 0→10s sets views=1 for seconds 0..9, replays=0', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [10000, EventCode.ENDED, 10000],
    ];
    const d = computeSecondDeltas(trace, DUR);
    expect(d.seconds).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(d.views).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(d.replays).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(d.uniqueSecondsWatched).toBe(10);
  });

  it('seek backward produces replays on revisited seconds', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.TICK, 5000],
      [5100, EventCode.SEEK, 2000, { fromMs: 5000 }],
      [8100, EventCode.ENDED, 5000],
    ];
    const d = computeSecondDeltas(trace, DUR);
    // Seconds 0-4 played once, then 2-4 played again; second 5 appears because of seekAway.
    expect(d.seconds.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    const bySecond = Object.fromEntries(
      d.seconds.map((s, i) => [s, { v: d.views[i], r: d.replays[i], sa: d.seekAways[i] }]),
    );
    expect(bySecond[0]).toEqual({ v: 1, r: 0, sa: 0 });
    expect(bySecond[1]).toEqual({ v: 1, r: 0, sa: 0 });
    expect(bySecond[2]).toEqual({ v: 1, r: 1, sa: 0 });
    expect(bySecond[4]).toEqual({ v: 1, r: 1, sa: 0 });
    expect(bySecond[5]).toEqual({ v: 0, r: 0, sa: 1 });
  });

  it('seek forward skips seconds (no views for skipped range)', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [2000, EventCode.SEEK, 7000, { fromMs: 2000 }],
      [5000, EventCode.ENDED, 10000],
    ];
    const d = computeSecondDeltas(trace, DUR);
    const watched = new Set(d.seconds);
    expect(watched.has(3)).toBe(false);
    expect(watched.has(5)).toBe(false);
    expect(watched.has(0)).toBe(true);
    expect(watched.has(7)).toBe(true);
  });

  it('pause at second N increments pauseCount[N]', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [3500, EventCode.PAUSE, 3500],
    ];
    const d = computeSecondDeltas(trace, DUR);
    const idx = d.seconds.indexOf(3);
    expect(d.pauses[idx]).toBe(1);
  });

  it('seek away from second N (fromMs) increments seekAways[N]', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.SEEK, 1000, { fromMs: 5000 }],
      [6000, EventCode.ENDED, 2000],
    ];
    const d = computeSecondDeltas(trace, DUR);
    const idx = d.seconds.indexOf(5);
    expect(d.seekAways[idx]).toBe(1);
  });

  it('positions slightly beyond duration are clamped (no out-of-range writes)', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [10500, EventCode.ENDED, 10500],
    ];
    const d = computeSecondDeltas(trace, DUR);
    expect(Math.max(...d.seconds)).toBeLessThanOrEqual(9);
  });
});
