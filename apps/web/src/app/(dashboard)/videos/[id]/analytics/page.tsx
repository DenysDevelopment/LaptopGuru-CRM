'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { VideoAnalyticsData } from '@laptopguru-crm/shared';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

type DateRange = '7d' | '30d' | '90d';

const RANGES: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
];

function getRangeDate(range: DateRange): Date {
  const now = new Date();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(now.getTime() - days * 86_400_000);
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}м ${sec}с` : `${sec}с`;
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function VideoAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [range, setRange] = useState<DateRange>('30d');
  const [data, setData] = useState<VideoAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = getRangeDate(range).toISOString();
      const to = new Date().toISOString();
      const res = await fetch(`/api/videos/${id}/analytics?from=${from}&to=${to}`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to load');
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [id, range]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-400">Загрузка аналитики...</div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <button onClick={() => router.push('/videos')} className="text-brand hover:underline">
          Назад к видео
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { overview, retention, viewsTimeSeries } = data;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push('/videos')}
            className="text-sm text-gray-400 hover:text-gray-600 mb-1"
          >
            &larr; Назад к видео
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Аналитика видео</h1>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                range === r.value
                  ? 'bg-brand text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Card label="Просмотры" value={overview.totalViews} />
        <Card label="Уникальные" value={overview.uniqueViewers} />
        <Card label="Время просмотра" value={formatSeconds(overview.totalWatchTime)} />
        <Card label="Ср. длительность" value={formatSeconds(overview.avgViewDuration)} />
        <Card label="Досмотры" value={formatPercent(overview.completionRate)} />
        <Card label="Play rate" value={formatPercent(overview.playRate)} />
      </div>

      {/* Retention Chart */}
      {retention.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Удержание аудитории</h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={retention}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="second"
                tickFormatter={(s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}
                fontSize={12}
              />
              <YAxis
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                domain={[0, 1]}
                fontSize={12}
              />
              <Tooltip
                formatter={(v: unknown) => [`${(Number(v) * 100).toFixed(1)}%`, 'Удержание']}
                labelFormatter={(s: unknown) => `${Math.floor(Number(s) / 60)}:${String(Number(s) % 60).padStart(2, '0')}`}
              />
              <Area
                type="monotone"
                dataKey="viewersPercent"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.1}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Views Time Series */}
      {viewsTimeSeries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Просмотры по дням</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={viewsTimeSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="views" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
