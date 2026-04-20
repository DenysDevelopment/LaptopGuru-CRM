'use client';

import { useEffect, useState, use } from 'react';
import type { VideoAnalyticsData, SessionEndReason } from '@laptopguru-crm/shared';

const END_REASON_LABELS: Record<SessionEndReason, string> = {
  ENDED: 'Досмотрел до конца',
  PAUSED_LONG: 'Долгая пауза',
  CLOSED: 'Закрыл вкладку',
  NAVIGATED: 'Ушёл со страницы',
  ERROR: 'Ошибка плеера',
  INCOMPLETE: 'Не завершено',
};

export default function VideoAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<VideoAnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/videos/${id}/analytics`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: VideoAnalyticsData) => setData(d))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <div className="p-6 text-red-600">Ошибка: {error}</div>;
  if (!data) return <div className="p-6">Загрузка...</div>;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Аналитика видео</h1>
        <p className="text-sm text-muted-foreground">
          Длительность: {data.durationSeconds} с
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Сессий" value={data.overview.totalViews} />
        <Kpi label="Уникальных зрителей" value={data.overview.uniqueViewers} />
        <Kpi label="Средний просмотр (с)" value={data.overview.avgViewDuration} />
        <Kpi label="Досмотр" value={`${Math.round(data.overview.completionRate * 100)}%`} />
        <Kpi label="Конверсия в play" value={`${Math.round(data.overview.playRate * 100)}%`} />
        <Kpi label="Всего просмотрено (с)" value={data.overview.totalWatchTime} />
        <Kpi label="Ошибок" value={data.overview.errorCount} />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Удержание</h2>
        <RetentionChart
          retention={data.retention}
          pauses={data.topPauseSeconds}
          seeks={data.topSeekAwaySeconds}
        />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Последние сессии</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th>Когда</th>
              <th>Просмотрено</th>
              <th>Досмотр</th>
              <th>Завершение</th>
              <th>Устройство</th>
            </tr>
          </thead>
          <tbody>
            {data.recentSessions.map((s) => (
              <tr key={s.sessionId} className="border-b">
                <td>{new Date(s.startedAt).toLocaleString('ru-RU')}</td>
                <td>{Math.round(s.durationWatchedMs / 1000)} с</td>
                <td>{Math.round(s.completionPercent * 100)}%</td>
                <td>{s.endReason ? END_REASON_LABELS[s.endReason] : '—'}</td>
                <td>{s.device ?? '—'}</td>
              </tr>
            ))}
            {data.recentSessions.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted-foreground">
                  Пока нет сессий.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/40">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function RetentionChart({
  retention,
  pauses,
  seeks,
}: {
  retention: VideoAnalyticsData['retention'];
  pauses: VideoAnalyticsData['topPauseSeconds'];
  seeks: VideoAnalyticsData['topSeekAwaySeconds'];
}) {
  if (retention.length === 0)
    return <div className="text-sm text-muted-foreground">Пока нет данных.</div>;
  const max = Math.max(1, ...retention.map((r) => r.views));
  const w = 800;
  const h = 180;
  const stepX = w / retention.length;
  const path = retention
    .map((r, i) =>
      `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${(h - (r.views / max) * h).toFixed(1)}`,
    )
    .join(' ');
  const pauseSet = new Set(pauses.map((p) => p.second));
  const seekSet = new Set(seeks.map((s) => s.second));
  return (
    <div>
      <svg width={w} height={h} className="bg-muted/20 rounded">
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />
        {retention.map((r, i) => {
          const x = i * stepX;
          return (
            <g key={r.second}>
              {pauseSet.has(r.second) && (
                <circle cx={x} cy={h - (r.views / max) * h} r={3} fill="#fb7830" />
              )}
              {seekSet.has(r.second) && (
                <rect x={x - 1} y={0} width={2} height={h} fill="#ef4444" opacity={0.3} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#fb7830] inline-block" /> частые паузы
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-[3px] bg-[#ef4444]/60 inline-block" /> частые перемотки
        </span>
      </div>
    </div>
  );
}
