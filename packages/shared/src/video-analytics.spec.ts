import { describe, it, expect } from 'vitest';
import {
  EventCode,
  encodeEvent,
  decodeTrace,
  DecodedEvent,
  EventTuple,
} from './video-analytics';

describe('EventCode', () => {
  it('has stable numeric codes used on the wire', () => {
    expect(EventCode.TICK).toBe(0);
    expect(EventCode.PLAY).toBe(1);
    expect(EventCode.PAUSE).toBe(2);
    expect(EventCode.SEEK).toBe(3);
    expect(EventCode.ENDED).toBe(4);
    expect(EventCode.RATE).toBe(5);
    expect(EventCode.VOLUME).toBe(6);
    expect(EventCode.FULLSCREEN_ON).toBe(7);
    expect(EventCode.FULLSCREEN_OFF).toBe(8);
    expect(EventCode.BUFFER_START).toBe(9);
    expect(EventCode.BUFFER_END).toBe(10);
    expect(EventCode.QUALITY).toBe(11);
    expect(EventCode.ERROR).toBe(12);
    expect(EventCode.VISIBILITY_HIDDEN).toBe(13);
    expect(EventCode.VISIBILITY_VISIBLE).toBe(14);
  });
});

describe('decodeTrace', () => {
  it('decodes an empty trace', () => {
    expect(decodeTrace([])).toEqual([]);
  });

  it('decodes a single tick tuple', () => {
    const trace: EventTuple[] = [[0, EventCode.TICK, 0]];
    const decoded: DecodedEvent[] = decodeTrace(trace);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toMatchObject({
      tMs: 0,
      type: 'TICK',
      posMs: 0,
    });
  });

  it('decodes SEEK with fromMs extra', () => {
    const trace: EventTuple[] = [[1200, EventCode.SEEK, 4000, { fromMs: 20000 }]];
    const [ev] = decodeTrace(trace);
    expect(ev.type).toBe('SEEK');
    expect(ev.fromMs).toBe(20000);
  });

  it('decodes BUFFER_END with durationMs extra', () => {
    const trace: EventTuple[] = [[500, EventCode.BUFFER_END, 1200, { durationMs: 750 }]];
    const [ev] = decodeTrace(trace);
    expect(ev.type).toBe('BUFFER_END');
    expect(ev.bufferDurationMs).toBe(750);
  });

  it('decodes VOLUME with volume + muted extra', () => {
    const trace: EventTuple[] = [[200, EventCode.VOLUME, 0, { volume: 0.8, muted: false }]];
    const [ev] = decodeTrace(trace);
    expect(ev.type).toBe('VOLUME');
    expect(ev.volume).toBe(0.8);
    expect(ev.muted).toBe(false);
  });

  it('decodes ERROR with message extra truncated upstream', () => {
    const trace: EventTuple[] = [[900, EventCode.ERROR, 3000, { message: 'MEDIA_ERR_NETWORK' }]];
    const [ev] = decodeTrace(trace);
    expect(ev.type).toBe('ERROR');
    expect(ev.message).toBe('MEDIA_ERR_NETWORK');
  });

  it('tolerates unknown numeric codes by emitting type="UNKNOWN"', () => {
    const trace = [[0, 99, 0]] as unknown as EventTuple[];
    const [ev] = decodeTrace(trace);
    expect(ev.type).toBe('UNKNOWN');
  });

  it('tolerates unexpected extra fields without throwing', () => {
    const trace = [[0, EventCode.PLAY, 0, { garbage: true }]] as unknown as EventTuple[];
    expect(() => decodeTrace(trace)).not.toThrow();
  });
});

describe('encodeEvent / decodeTrace round trip', () => {
  it('round-trips every EventCode value', () => {
    for (const key of Object.keys(EventCode)) {
      const code = EventCode[key as keyof typeof EventCode];
      if (typeof code !== 'number') continue;
      const encoded = encodeEvent(100, code, 500);
      const [decoded] = decodeTrace([encoded]);
      expect(decoded.tMs).toBe(100);
      expect(decoded.posMs).toBe(500);
      expect(decoded.type).not.toBe('UNKNOWN');
    }
  });
});
