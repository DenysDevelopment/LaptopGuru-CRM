'use client';

import { EventCode, type VisitPlaybackSession } from '@laptopguru-crm/shared';

export function SessionTimeline({ session }: { session: VisitPlaybackSession }) {
  const videoSeconds = Math.max(1, Math.floor(session.videoDurationMs / 1000));
  const wallMs = session.endedAt
    ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()
    : session.videoDurationMs;
  const wallSeconds = Math.max(1, Math.floor(wallMs / 1000));

  // Per-second play counts in this session
  const videoPlayCount = new Array(videoSeconds).fill(0);
  let isPlaying = false;
  let lastPos = 0;
  for (const ev of session.events) {
    switch (ev.type) {
      case EventCode.PLAY:
        isPlaying = true;
        lastPos = ev.posMs;
        break;
      case EventCode.PAUSE:
      case EventCode.ENDED:
      case EventCode.BUFFER_START:
      case EventCode.VISIBILITY_HIDDEN:
        if (isPlaying && ev.posMs > lastPos) markRange(videoPlayCount, lastPos, ev.posMs);
        isPlaying = false;
        lastPos = ev.posMs;
        break;
      case EventCode.TICK:
        if (isPlaying && ev.posMs > lastPos) markRange(videoPlayCount, lastPos, ev.posMs);
        lastPos = ev.posMs;
        break;
      case EventCode.SEEK:
        lastPos = ev.posMs;
        break;
      case EventCode.BUFFER_END:
      case EventCode.VISIBILITY_VISIBLE:
        isPlaying = true;
        lastPos = ev.posMs;
        break;
    }
  }

  type WallState = 'play' | 'pause' | 'buffer' | 'hidden';
  const wallTrack = new Array<WallState>(wallSeconds).fill('pause');
  let cur: WallState = 'pause';
  let lastT = 0;
  for (const ev of session.events) {
    const t = Math.floor(ev.tMs / 1000);
    for (let i = lastT; i < Math.min(wallSeconds, t); i++) wallTrack[i] = cur;
    switch (ev.type) {
      case EventCode.PLAY:
        cur = 'play';
        break;
      case EventCode.PAUSE:
      case EventCode.ENDED:
        cur = 'pause';
        break;
      case EventCode.BUFFER_START:
        cur = 'buffer';
        break;
      case EventCode.BUFFER_END:
        cur = 'play';
        break;
      case EventCode.VISIBILITY_HIDDEN:
        cur = 'hidden';
        break;
      case EventCode.VISIBILITY_VISIBLE:
        cur = 'play';
        break;
    }
    lastT = t;
  }
  for (let i = lastT; i < wallSeconds; i++) wallTrack[i] = cur;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex justify-between text-sm">
        <span>{new Date(session.startedAt).toLocaleString()}</span>
        <span>
          {Math.round(session.durationWatchedMs / 1000)}s watched /{' '}
          {Math.round(session.completionPercent * 100)}%
        </span>
      </div>
      <Track
        title="Video position"
        cells={videoPlayCount.map((c) => ({
          color: c === 0 ? '#e5e7eb' : c === 1 ? '#60a5fa' : '#1d4ed8',
        }))}
      />
      <Track title="Wall clock" cells={wallTrack.map((s) => ({ color: wallStateColor(s) }))} />
      <details className="text-xs">
        <summary className="cursor-pointer">Events ({session.events.length})</summary>
        <ul className="mt-2 font-mono">
          {session.events.slice(0, 200).map((e, i) => (
            <li key={i}>
              +{(e.tMs / 1000).toFixed(2)}s · {EventCode[e.type]} · pos {(e.posMs / 1000).toFixed(2)}s
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function markRange(arr: number[], fromMs: number, toMs: number) {
  const f = Math.max(0, Math.floor(fromMs / 1000));
  const t = Math.min(arr.length - 1, Math.floor((toMs - 1) / 1000));
  for (let i = f; i <= t; i++) arr[i]++;
}

function wallStateColor(s: 'play' | 'pause' | 'buffer' | 'hidden') {
  switch (s) {
    case 'play':
      return '#1f2937';
    case 'pause':
      return '#d1d5db';
    case 'buffer':
      return '#ef4444';
    case 'hidden':
      return '#9ca3af';
  }
}

function Track({ title, cells }: { title: string; cells: { color: string }[] }) {
  return (
    <div>
      <div className="text-xs mb-1">{title}</div>
      <div className="flex h-4 w-full gap-[1px]">
        {cells.map((c, i) => (
          <div key={i} style={{ background: c.color, flex: 1 }} title={`s ${i}`} />
        ))}
      </div>
    </div>
  );
}
