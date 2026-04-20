'use client';

import { EventCode, type VisitPlaybackSession, type SessionEndReason } from '@laptopguru-crm/shared';

const EVENT_LABELS: Record<EventCode, string> = {
  [EventCode.TICK]: 'пинг',
  [EventCode.PLAY]: 'запуск',
  [EventCode.PAUSE]: 'пауза',
  [EventCode.SEEK]: 'перемотка',
  [EventCode.ENDED]: 'конец',
  [EventCode.RATE]: 'скорость',
  [EventCode.VOLUME]: 'громкость',
  [EventCode.FULLSCREEN_ON]: 'fullscreen вкл.',
  [EventCode.FULLSCREEN_OFF]: 'fullscreen выкл.',
  [EventCode.BUFFER_START]: 'буферизация',
  [EventCode.BUFFER_END]: 'буфер готов',
  [EventCode.QUALITY]: 'качество',
  [EventCode.ERROR]: 'ошибка',
  [EventCode.VISIBILITY_HIDDEN]: 'вкладка скрыта',
  [EventCode.VISIBILITY_VISIBLE]: 'вкладка видна',
  [EventCode.VISITOR_RETURNED]: 'вернулся после ухода',
};

const END_REASON_LABELS: Record<SessionEndReason, string> = {
  ENDED: 'досмотрел',
  PAUSED_LONG: 'долгая пауза',
  CLOSED: 'закрыл вкладку',
  NAVIGATED: 'ушёл со страницы',
  ERROR: 'ошибка плеера',
  INCOMPLETE: 'не завершено',
};

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
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex justify-between text-sm">
        <span>{new Date(session.startedAt).toLocaleString('ru-RU')}</span>
        <span>
          {Math.round(session.durationWatchedMs / 1000)} с просмотрено ·{' '}
          {Math.round(session.completionPercent * 100)}% досмотра
          {session.endReason ? ` · ${END_REASON_LABELS[session.endReason]}` : ''}
        </span>
      </div>
      <Track
        title="Позиция в видео"
        hint="какие секунды видео смотрели и пересматривали"
        cells={videoPlayCount.map((c, s) => ({
          color: c === 0 ? '#e5e7eb' : c === 1 ? '#60a5fa' : '#1d4ed8',
          tooltip: `${formatSec(s)} — ${
            c === 0 ? 'не смотрел' : c === 1 ? 'посмотрел 1 раз' : `пересмотрел (${c} раз)`
          }`,
        }))}
        legend={[
          { color: '#e5e7eb', label: 'не смотрел' },
          { color: '#60a5fa', label: 'посмотрел 1 раз' },
          { color: '#1d4ed8', label: 'пересматривал' },
        ]}
      />
      <Track
        title="Реальное время"
        hint="как зритель проводил время с момента старта сессии"
        cells={wallTrack.map((s, i) => ({
          color: wallStateColor(s),
          tooltip: `+${formatSec(i)} — ${WALL_STATE_LABELS[s]}`,
        }))}
        legend={[
          { color: '#1f2937', label: 'играло' },
          { color: '#d1d5db', label: 'на паузе' },
          { color: '#ef4444', label: 'буферизация' },
          { color: '#9ca3af', label: 'вкладка скрыта' },
        ]}
      />
      <details className="text-xs">
        <summary className="cursor-pointer select-none">
          События ({session.events.length})
        </summary>
        <ul className="mt-2 font-mono space-y-0.5">
          {session.events.slice(0, 200).map((e, i) => (
            <li key={i}>
              +{(e.tMs / 1000).toFixed(2)} с · {EVENT_LABELS[e.type] ?? EventCode[e.type]} · поз {(e.posMs / 1000).toFixed(2)} с
            </li>
          ))}
          {session.events.length > 200 && (
            <li className="text-muted-foreground">
              … и ещё {session.events.length - 200} событий
            </li>
          )}
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

type WallStateType = 'play' | 'pause' | 'buffer' | 'hidden';

const WALL_STATE_LABELS: Record<WallStateType, string> = {
  play: 'играло',
  pause: 'пауза',
  buffer: 'буферизация',
  hidden: 'вкладка скрыта',
};

function wallStateColor(s: WallStateType) {
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

function formatSec(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function Track({
  title,
  hint,
  cells,
  legend,
}: {
  title: string;
  hint: string;
  cells: { color: string; tooltip: string }[];
  legend: { color: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="flex h-5 w-full gap-[1px] rounded overflow-hidden">
        {cells.map((c, i) => (
          <div
            key={i}
            style={{ background: c.color, flex: 1 }}
            title={c.tooltip}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-black/10"
              style={{ background: l.color }}
            />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
