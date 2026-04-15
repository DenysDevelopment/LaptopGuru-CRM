import { describe, it, expect } from 'vitest';
import { computeAggregates } from './compute-aggregates';
import { EventCode, EventTuple } from '@laptopguru-crm/shared';

describe('computeAggregates', () => {
  const dur = 300_000;

  it('returns zeros for empty trace', () => {
    const r = computeAggregates([], dur);
    expect(r).toEqual({
      playCount: 0, pauseCount: 0, seekCount: 0,
      bufferCount: 0, errorCount: 0, bufferTimeMs: 0,
      durationWatchedMs: 0, maxPositionMs: 0, completionPercent: 0,
    });
  });

  it('counts durationWatchedMs for a pure play→tick→pause sequence', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.TICK, 1000],
      [2000, EventCode.TICK, 2000],
      [3000, EventCode.PAUSE, 3000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.playCount).toBe(1);
    expect(r.pauseCount).toBe(1);
    expect(r.durationWatchedMs).toBe(3000);
    expect(r.maxPositionMs).toBe(3000);
  });

  it('excludes paused time from durationWatchedMs', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.PAUSE, 1000],
      [6000, EventCode.PLAY, 1000],
      [7000, EventCode.PAUSE, 2000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.durationWatchedMs).toBe(2000); // 1s + 1s
  });

  it('excludes forward seek from durationWatchedMs', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.TICK, 1000],
      [1000, EventCode.SEEK, 60_000, { fromMs: 1000 }],
      [2000, EventCode.TICK, 61_000],
      [3000, EventCode.PAUSE, 62_000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.durationWatchedMs).toBe(1000 + 2000); // before seek + after seek
    expect(r.maxPositionMs).toBe(62_000);
  });

  it('excludes buffering time from durationWatchedMs and grows bufferTimeMs', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [500, EventCode.BUFFER_START, 500],
      [2500, EventCode.BUFFER_END, 500, { durationMs: 2000 }],
      [3500, EventCode.TICK, 1500],
      [4500, EventCode.PAUSE, 2500],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.bufferCount).toBe(1);
    expect(r.bufferTimeMs).toBe(2000);
  });

  it('handles rate 2.0 — posDelta reflects faster advance, duration stays accurate', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [0, EventCode.RATE, 0, { playbackRate: 2.0 }],
      [1000, EventCode.TICK, 2000], // 1s wall clock, 2s video
      [2000, EventCode.PAUSE, 4000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.durationWatchedMs).toBe(2000); // min(realDelta, posDelta)
    expect(r.maxPositionMs).toBe(4000);
  });

  it('treats ENDED as pause for duration accounting', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.ENDED, 5000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.durationWatchedMs).toBe(5000);
  });

  it('clips completionPercent to [0, 1]', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.TICK, dur + 500],
      [2000, EventCode.ENDED, dur],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.completionPercent).toBeLessThanOrEqual(1);
    expect(r.completionPercent).toBeGreaterThanOrEqual(0.99);
  });

  it('counts multiple play/pause cycles', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.PAUSE, 1000],
      [2000, EventCode.PLAY, 1000],
      [3000, EventCode.PAUSE, 2000],
      [4000, EventCode.PLAY, 2000],
      [5000, EventCode.ENDED, 3000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.playCount).toBe(3);
    expect(r.pauseCount).toBe(2);
  });

  it('treats VISIBILITY_HIDDEN → _VISIBLE as pause (no duration grows while hidden)', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.TICK, 1000],
      [1000, EventCode.VISIBILITY_HIDDEN, 1000],
      [6000, EventCode.VISIBILITY_VISIBLE, 1000],
      [7000, EventCode.TICK, 2000],
      [8000, EventCode.PAUSE, 3000],
    ];
    const r = computeAggregates(trace, dur);
    // 1s (before hidden) + 1s (1000→2000) + 1s (2000→3000) = 3s
    expect(r.durationWatchedMs).toBe(3000);
  });

  it('counts errors', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [500, EventCode.ERROR, 500, { message: 'boom' }],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.errorCount).toBe(1);
  });
});
