import { describe, it, expect } from 'vitest';
import { computeAggregates } from './compute-aggregates';
import { EventCode, type EventTuple } from '@laptopguru-crm/shared';

const DUR = 10_000; // 10 s video

describe('computeAggregates', () => {
  it('returns zeros for empty trace', () => {
    const agg = computeAggregates([], DUR);
    expect(agg.durationWatchedMs).toBe(0);
    expect(agg.playCount).toBe(0);
    expect(agg.completionPercent).toBe(0);
  });

  it('play then pause counts watched time as min(real, pos)', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.PAUSE, 5000],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.durationWatchedMs).toBe(5000);
    expect(agg.playCount).toBe(1);
    expect(agg.pauseCount).toBe(1);
    expect(agg.maxPositionMs).toBe(5000);
    expect(agg.completionPercent).toBeCloseTo(0.5);
  });

  it('forward seek does not inflate durationWatched', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [2000, EventCode.TICK, 2000],
      [2100, EventCode.SEEK, 8000, { fromMs: 2000 }],
      [4100, EventCode.PAUSE, 10000],
    ];
    const agg = computeAggregates(trace, DUR);
    // 0→2000 = 2000ms real, then from 8000 to 10000 = 2000ms real → 4000ms total watched
    expect(agg.durationWatchedMs).toBe(4000);
    expect(agg.maxPositionMs).toBe(10000);
    expect(agg.seekCount).toBe(1);
  });

  it('paused time is not counted as watched', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [3000, EventCode.PAUSE, 3000],
      // 30s gap of paused time (wall-clock advances, pos does not)
      [33000, EventCode.PLAY, 3000],
      [36000, EventCode.PAUSE, 6000],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.durationWatchedMs).toBe(6000);
    expect(agg.pauseCount).toBe(2);
    expect(agg.playCount).toBe(2);
  });

  it('buffer time accumulates and does not count as watched', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [2000, EventCode.TICK, 2000],
      [2100, EventCode.BUFFER_START, 2000],
      [5100, EventCode.BUFFER_END, 2000, { durationMs: 3000 }],
      [7100, EventCode.PAUSE, 4000],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.bufferCount).toBe(1);
    expect(agg.bufferTimeMs).toBe(3000);
    expect(agg.durationWatchedMs).toBeLessThanOrEqual(4000);
  });

  it('ENDED behaves as pause for duration accounting', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [10000, EventCode.ENDED, 10000],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.durationWatchedMs).toBe(10000);
    expect(agg.completionPercent).toBe(1);
    expect(agg.pauseCount).toBe(0);
  });

  it('completionPercent clipped to [0, 1]', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [10500, EventCode.PAUSE, 10500],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.completionPercent).toBe(1);
  });

  it('error events counted', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.ERROR, 1000, { message: 'x' }],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.errorCount).toBe(1);
  });
});
