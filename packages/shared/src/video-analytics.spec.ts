import { describe, it, expect } from 'vitest';
import {
  EventCode,
  encodeTrace,
  decodeTrace,
  type DecodedEvent,
  type EventTuple,
} from './video-analytics';

describe('decodeTrace / encodeTrace', () => {
  it('round-trips every event code', () => {
    const events: DecodedEvent[] = [
      { tMs: 0, type: EventCode.PLAY, posMs: 0 },
      { tMs: 250, type: EventCode.TICK, posMs: 250 },
      { tMs: 500, type: EventCode.PAUSE, posMs: 500 },
      { tMs: 600, type: EventCode.SEEK, posMs: 0, fromMs: 500 },
      { tMs: 700, type: EventCode.RATE, posMs: 0, playbackRate: 1.5 },
      { tMs: 800, type: EventCode.VOLUME, posMs: 0, volume: 0.5, muted: false },
      { tMs: 900, type: EventCode.FULLSCREEN_ON, posMs: 0 },
      { tMs: 950, type: EventCode.FULLSCREEN_OFF, posMs: 0 },
      { tMs: 1000, type: EventCode.BUFFER_START, posMs: 0 },
      { tMs: 1200, type: EventCode.BUFFER_END, posMs: 0, durationMs: 200 },
      { tMs: 1300, type: EventCode.QUALITY, posMs: 0, label: '1080p' },
      { tMs: 1400, type: EventCode.ERROR, posMs: 0, message: 'decode error' },
      { tMs: 1500, type: EventCode.VISIBILITY_HIDDEN, posMs: 0 },
      { tMs: 1600, type: EventCode.VISIBILITY_VISIBLE, posMs: 0 },
      { tMs: 2000, type: EventCode.ENDED, posMs: 1999 },
    ];
    const tuples = encodeTrace(events);
    const decoded = decodeTrace(tuples);
    expect(decoded).toEqual(events);
  });

  it('decoder tolerates unknown type codes', () => {
    const tuples: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [100, 99 as unknown as EventCode, 100], // future code
      [200, EventCode.PAUSE, 200],
    ];
    const decoded = decodeTrace(tuples);
    expect(decoded.map((e) => e.type)).toEqual([EventCode.PLAY, EventCode.PAUSE]);
  });

  it('decoder tolerates missing extras', () => {
    const tuples: EventTuple[] = [
      [0, EventCode.SEEK, 100], // no extra
      [100, EventCode.RATE, 0], // no extra
      [200, EventCode.ERROR, 0], // no extra
    ];
    const decoded = decodeTrace(tuples);
    expect((decoded[0] as { fromMs: number }).fromMs).toBe(100); // falls back to posMs
    expect((decoded[1] as { playbackRate: number }).playbackRate).toBe(1);
    expect((decoded[2] as { message: string }).message).toBe('');
  });
});
