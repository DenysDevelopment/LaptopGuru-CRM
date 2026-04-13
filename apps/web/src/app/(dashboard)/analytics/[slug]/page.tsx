"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  Eye, User, ShoppingCart, TrendingUp, Clock,
  ScrollText, Play, Pause, Clapperboard, Hourglass,
  Globe, Building2, Smartphone, Globe2, Monitor,
  Link2, Megaphone, Settings, Wifi, Palette,
  BarChart3, Key, SkipForward, CheckCircle, AlertCircle, Gauge, Film,
} from "lucide-react";

interface VideoAnalytics {
  overview: {
    totalViews: number;
    uniqueViewers: number;
    totalWatchTime: number;
    avgViewDuration: number;
    completionRate: number;
    playRate: number;
  };
  durationSeconds: number;
  retention: { second: number; viewers: number; viewersPercent: number }[];
  viewsTimeSeries: { date: string; views: number }[];
  replayHeatmap: { second: number; intensity: number }[];
  sessionStrips: {
    sessionId: string;
    startedAt: string;
    country: string | null;
    device: string | null;
    segments: boolean[];
  }[];
  recentWatches: {
    sessionId: string;
    startedAt: string;
    duration: number;
    completed: boolean;
    country: string | null;
    device: string | null;
    browser: string | null;
  }[];
}

interface VisitVideoAnalytics {
  segments: boolean[];
  durationSeconds: number;
  watchPercentage: number;
  events: {
    eventType: string;
    position: number;
    seekFrom: number | null;
    seekTo: number | null;
    playbackRate: number;
    clientTimestamp: string;
  }[];
}

interface Analytics {
  landing: {
    id: string;
    slug: string;
    title: string;
    views: number;
    clicks: number;
    createdAt: string;
    customerName: string | null;
    customerEmail: string | null;
    videoTitle: string;
    videoId: string;
    videoSource: string;
    videoDurationSeconds: number | null;
  };
  summary: {
    totalVisits: number;
    uniqueVisitors: number;
    buyClicks: number;
    conversionRate: number;
    avgTimeOnPage: number;
    avgScrollDepth: number;
    videoPlays: number;
    videoPlayRate: number;
    videoCompleted: number;
    avgVideoWatch: number;
  };
  breakdown: {
    devices: [string, number][];
    browsers: [string, number][];
    oses: [string, number][];
    countries: [string, number][];
    cities: [string, number][];
    referrers: [string, number][];
    utmSources: [string, number][];
  };
  pagination: { page: number; limit: number; totalCount: number };
  visits: {
    id: string;
    visitedAt: string;
    ip: string | null;
    country: string | null;
    city: string | null;
    browser: string | null;
    browserVersion: string | null;
    os: string | null;
    deviceType: string | null;
    screenWidth: number | null;
    screenHeight: number | null;
    referrerDomain: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    timeOnPage: number | null;
    maxScrollDepth: number | null;
    buyButtonClicked: boolean;
    videoPlayed: boolean;
    videoWatchTime: number | null;
    videoTimeToPlay: number | null;
    videoBufferCount: number | null;
    videoBufferTime: number | null;
    videoDroppedFrames: number | null;
    totalClicks: number | null;
    tabSwitches: number | null;
    browserLang: string | null;
    connectionType: string | null;
    touchSupport: boolean | null;
  }[];
}

function formatTime(sec: number): string {
  if (sec < 60) return `${sec}с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}м ${s}с` : `${m}м`;
}

function formatTimecode(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function DeviceIcon({ type }: { type: string | null }) {
  if (type === "mobile" || type === "tablet") return <Smartphone className="w-4 h-4 inline text-gray-400" />;
  return <Monitor className="w-4 h-4 inline text-gray-400" />;
}

export default function AnalyticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "visits">("overview");

  const [videoAnalytics, setVideoAnalytics] = useState<VideoAnalytics | null>(null);
  const [error, setError] = useState("");
  const [visitsPage, setVisitsPage] = useState(1);
  const [loadingVisits, setLoadingVisits] = useState(false);

  useEffect(() => {
    fetch(`/api/landings/${slug}/analytics`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
        // Fetch detailed video analytics for S3 videos (scoped to this landing)
        if (d.landing.videoSource === "S3" && d.landing.videoId) {
          fetch(`/api/videos/${d.landing.videoId}/analytics?landingId=${d.landing.id}`)
            .then((r) => r.ok ? r.json() : null)
            .then((va) => { if (va) setVideoAnalytics(va); })
            .catch(() => {});
        }
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [slug]);

  if (loading) return <div className="text-center py-12 text-gray-400">Загрузка аналитики...</div>;
  if (!data) return <div className="text-center py-12 text-red-400">Не удалось загрузить данные{error && `: ${error}`}</div>;

  const { landing, summary: s, breakdown: b } = data;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/links" className="text-xs text-brand hover:text-brand-hover transition-colors mb-2 inline-block">
          ← Назад к ссылкам
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="w-6 h-6 text-brand" /> Аналитика</h1>
        <p className="text-sm text-gray-500 mt-1">{landing.title}</p>
        {landing.customerName && (
          <p className="text-xs text-gray-400 mt-0.5">{landing.customerName} · {landing.customerEmail}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
        <button
          onClick={() => setTab("overview")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "overview" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          Обзор
        </button>
        <button
          onClick={() => setTab("visits")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "visits" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          Визиты ({data.pagination.totalCount})
        </button>
      </div>

      {tab === "overview" ? (
        <>
          {/* Main KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
            <KPI label="Визиты" value={s.totalVisits} icon={<Eye className="w-4 h-4 text-gray-500" />} />
            <KPI label="Уникальные" value={s.uniqueVisitors} icon={<User className="w-4 h-4 text-gray-500" />} />
            <KPI label="Клики «Купить»" value={s.buyClicks} icon={<ShoppingCart className="w-4 h-4 text-brand" />} accent />
            <KPI label="Конверсия" value={`${s.conversionRate}%`} icon={<TrendingUp className="w-4 h-4 text-brand" />} accent />
            <KPI label="Ø время на стр." value={formatTime(s.avgTimeOnPage)} icon={<Clock className="w-4 h-4 text-gray-500" />} />
          </div>

          {/* Engagement KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
            <KPI label="Ø скролл" value={`${s.avgScrollDepth}%`} icon={<ScrollText className="w-4 h-4 text-gray-500" />} />
            <KPI label="Смотрели видео" value={s.videoPlays} icon={<Play className="w-4 h-4 text-gray-500" />} />
            <KPI label="% запуска видео" value={`${s.videoPlayRate}%`} icon={<Clapperboard className="w-4 h-4 text-gray-500" />} />
            <KPI label="Досмотрели" value={s.videoCompleted ?? 0} icon={<TrendingUp className="w-4 h-4 text-gray-500" />} />
            <KPI label="Ø просмотр видео" value={formatTime(s.avgVideoWatch)} icon={<Hourglass className="w-4 h-4 text-gray-500" />} />
          </div>

          {/* Video Analytics (S3) */}
          {videoAnalytics && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                <Clapperboard className="w-4 h-4 text-brand" /> Аналитика видео
              </h2>

              {/* Video KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <KPI label="Просмотры" value={videoAnalytics.overview.totalViews} icon={<Eye className="w-4 h-4 text-gray-500" />} />
                <KPI label="Уникальные" value={videoAnalytics.overview.uniqueViewers} icon={<User className="w-4 h-4 text-gray-500" />} />
                <KPI label="Время просмотра" value={formatTime(videoAnalytics.overview.totalWatchTime)} icon={<Clock className="w-4 h-4 text-gray-500" />} />
                <KPI label="Ø длительность" value={formatTime(videoAnalytics.overview.avgViewDuration)} icon={<Hourglass className="w-4 h-4 text-gray-500" />} />
                <KPI label="Досмотрели" value={`${Math.round(videoAnalytics.overview.completionRate * 100)}%`} icon={<TrendingUp className="w-4 h-4 text-brand" />} accent />
                <KPI label="% запуска" value={`${Math.round(videoAnalytics.overview.playRate * 100)}%`} icon={<Play className="w-4 h-4 text-gray-500" />} />
              </div>

              {/* Watch Heatmap */}
              {videoAnalytics.replayHeatmap && videoAnalytics.replayHeatmap.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5 mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Тепловая карта</h3>
                  <p className="text-xs text-gray-400 mb-3">Яркие сегменты — смотрели чаще, тёмные — пропускали</p>
                  <div className="flex gap-px h-10 rounded-lg overflow-hidden">
                    {videoAnalytics.replayHeatmap.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 relative group cursor-default"
                        style={{
                          backgroundColor: h.intensity > 0
                            ? `rgba(99, 102, 241, ${0.15 + h.intensity * 0.85})`
                            : '#f3f4f6',
                        }}
                      >
                        <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                          {formatTimecode(h.second)} — {Math.round(h.intensity * 100)}%
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>0:00</span>
                    <span>{formatTimecode(videoAnalytics.durationSeconds)}</span>
                  </div>
                </div>
              )}

              {/* Per-session watch strips */}
              {videoAnalytics.sessionStrips && videoAnalytics.sessionStrips.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5 mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Что смотрел каждый зритель</h3>
                  <p className="text-xs text-gray-400 mb-3">Цветные сегменты — смотрел, серые — пропустил</p>
                  <div className="space-y-1.5">
                    {videoAnalytics.sessionStrips.map((strip) => (
                      <div key={strip.sessionId} className="flex items-center gap-2">
                        <div className="text-[10px] text-gray-400 w-20 flex-shrink-0 truncate" title={[strip.country, strip.device].filter(Boolean).join(' · ')}>
                          {strip.startedAt ? new Date(strip.startedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : ''}
                          {' '}
                          {strip.country || ''}
                        </div>
                        <div className="flex gap-px flex-1 h-5 rounded overflow-hidden">
                          {strip.segments.map((watched, i) => (
                            <div
                              key={i}
                              className={`flex-1 ${watched ? 'bg-indigo-500' : 'bg-gray-200'}`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1 pl-[88px]">
                    <span>0:00</span>
                    <span>{formatTimecode(videoAnalytics.durationSeconds)}</span>
                  </div>
                </div>
              )}

              {/* Retention chart */}
              {videoAnalytics.retention.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5 mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Удержание</h3>
                  <div className="flex items-end gap-px h-32">
                    {videoAnalytics.retention.map((r, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-brand/70 hover:bg-brand rounded-t transition-colors relative group"
                        style={{ height: `${Math.max(r.viewersPercent * 100, 2)}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                          {formatTimecode(r.second)} — {r.viewers} ({Math.round(r.viewersPercent * 100)}%)
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>0:00</span>
                    <span>{formatTimecode(videoAnalytics.retention[videoAnalytics.retention.length - 1]?.second ?? 0)}</span>
                  </div>
                </div>
              )}

              {/* Recent watches */}
              {videoAnalytics.recentWatches && videoAnalytics.recentWatches.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Последние просмотры видео</h3>
                  <div className="space-y-2">
                    {videoAnalytics.recentWatches.map((w) => (
                      <div key={w.sessionId} className="flex items-center gap-3 text-xs py-2 border-b border-gray-50 last:border-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${w.completed ? 'bg-green-500' : 'bg-yellow-400'}`} />
                        <span className="text-gray-500 w-28 flex-shrink-0">
                          {new Date(w.startedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-gray-700 font-medium w-16">{formatTime(w.duration)}</span>
                        <span className="text-gray-400">{[w.country, w.device, w.browser].filter(Boolean).join(' · ') || '—'}</span>
                        {w.completed && <span className="text-green-600 ml-auto">Досмотрел</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Breakdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <BreakdownCard title="Страны" icon={<Globe className="w-4 h-4 text-gray-500" />} data={b.countries} total={s.totalVisits} />
            <BreakdownCard title="Города" icon={<Building2 className="w-4 h-4 text-gray-500" />} data={b.cities} total={s.totalVisits} />
            <BreakdownCard title="Устройства" icon={<Smartphone className="w-4 h-4 text-gray-500" />} data={b.devices} total={s.totalVisits} />
            <BreakdownCard title="Браузеры" icon={<Globe2 className="w-4 h-4 text-gray-500" />} data={b.browsers} total={s.totalVisits} />
            <BreakdownCard title="ОС" icon={<Monitor className="w-4 h-4 text-gray-500" />} data={b.oses} total={s.totalVisits} />
            <BreakdownCard title="Источники" icon={<Link2 className="w-4 h-4 text-gray-500" />} data={b.referrers.length > 0 ? b.referrers : [["Прямой переход", s.totalVisits]]} total={s.totalVisits} />
            {b.utmSources.length > 0 && (
              <BreakdownCard title="UTM Source" icon={<Megaphone className="w-4 h-4 text-gray-500" />} data={b.utmSources} total={s.totalVisits} />
            )}
          </div>
        </>
      ) : (
        /* Visits — expandable cards with pagination */
        <div className="space-y-3">
          {data.visits.length === 0 && (
            <p className="text-center py-8 text-gray-400">Визитов пока нет</p>
          )}
          {data.visits.map((v) => (
            <VisitCard
              key={v.id}
              v={v}
              slug={slug}
              videoDurationSeconds={data.landing.videoDurationSeconds}
              isS3Video={data.landing.videoSource === "S3"}
            />
          ))}
          {/* Pagination */}
          {data.pagination.totalCount > data.pagination.limit && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                disabled={visitsPage <= 1 || loadingVisits}
                onClick={() => {
                  const p = visitsPage - 1;
                  setVisitsPage(p);
                  setLoadingVisits(true);
                  fetch(`/api/landings/${slug}/analytics?page=${p}&limit=${data.pagination.limit}`)
                    .then(r => r.json())
                    .then(d => { setData((prev) => prev ? { ...prev, visits: d.visits, pagination: d.pagination } : prev); })
                    .finally(() => setLoadingVisits(false));
                }}
                className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Назад
              </button>
              <span className="text-sm text-gray-500">
                {visitsPage} / {Math.ceil(data.pagination.totalCount / data.pagination.limit)}
              </span>
              <button
                disabled={visitsPage >= Math.ceil(data.pagination.totalCount / data.pagination.limit) || loadingVisits}
                onClick={() => {
                  const p = visitsPage + 1;
                  setVisitsPage(p);
                  setLoadingVisits(true);
                  fetch(`/api/landings/${slug}/analytics?page=${p}&limit=${data.pagination.limit}`)
                    .then(r => r.json())
                    .then(d => { setData((prev) => prev ? { ...prev, visits: d.visits, pagination: d.pagination } : prev); })
                    .finally(() => setLoadingVisits(false));
                }}
                className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Вперёд →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, icon, accent }: { label: string; value: number | string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "bg-brand-light border-brand/20" : "bg-white border-gray-100"}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${accent ? "text-brand" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function VisitCard({ v, slug, videoDurationSeconds, isS3Video }: { v: any; slug: string; videoDurationSeconds: number | null; isS3Video: boolean }) {
  const [open, setOpen] = useState(false);
  const [videoData, setVideoData] = useState<VisitVideoAnalytics | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);

  useEffect(() => {
    if (open && v.videoPlayed && !videoData && !videoLoading && isS3Video) {
      let cancelled = false;
      setVideoLoading(true);
      fetch(`/api/landings/${slug}/visits/${v.id}/video-events`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d) setVideoData(d); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setVideoLoading(false); });
      return () => { cancelled = true; };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, v.videoPlayed, v.id, slug, isS3Video]);

  // Compute video watch percentage from basic data when detailed data not yet loaded
  const basicWatchPct = v.videoPlayed && videoDurationSeconds && videoDurationSeconds > 0 && v.videoWatchTime
    ? Math.min(100, Math.round((v.videoWatchTime / videoDurationSeconds) * 100))
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Summary row — always visible */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
      >
        {/* Status badges */}
        <div className="flex gap-1.5 flex-shrink-0">
          {v.buyButtonClicked && <span className="w-2 h-2 rounded-full bg-green-500" title="Нажал Купить" />}
          {v.videoPlayed && <span className="w-2 h-2 rounded-full bg-blue-500" title="Смотрел видео" />}
          {!v.buyButtonClicked && !v.videoPlayed && <span className="w-2 h-2 rounded-full bg-gray-300" />}
        </div>

        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="font-medium text-gray-900 whitespace-nowrap">
            {new Date(v.visitedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="text-gray-500">{v.city && v.country ? `${v.city}, ${v.country}` : v.country || "—"}</span>
          <span className="text-gray-400 flex items-center gap-1"><DeviceIcon type={v.deviceType} /> {v.browser || "?"} / {v.os || "?"}</span>
          {v.timeOnPage && <span className="text-gray-400">{formatTime(v.timeOnPage)}</span>}
          {v.maxScrollDepth != null && (
            <span className={v.maxScrollDepth >= 80 ? "text-green-600 font-semibold" : v.maxScrollDepth >= 40 ? "text-yellow-600" : "text-gray-400"}>
              ↓{v.maxScrollDepth}%
            </span>
          )}
          {v.videoPlayed && basicWatchPct != null && (
            <span className={basicWatchPct >= 80 ? "text-indigo-600 font-semibold" : basicWatchPct >= 40 ? "text-indigo-400" : "text-gray-400"}>
              ▶{basicWatchPct}%
            </span>
          )}
        </div>

        <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Expanded details — ALL data */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-4 text-xs space-y-4">

          {/* Video analytics section — full width above the grid */}
          {v.videoPlayed && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                <Film className="w-4 h-4 text-indigo-500" /> Видео-просмотр
              </p>

              {/* Basic stats */}
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <DataRow label="Время просмотра" value={v.videoWatchTime ? formatTime(v.videoWatchTime) : "—"} />
                <DataRow label="Просмотрено" value={videoData ? `${videoData.watchPercentage}%` : basicWatchPct != null ? `${basicWatchPct}%` : "—"} />
                <DataRow label="Досмотрел" value={v.videoCompleted ? "Да" : "Нет"} />
                {v.videoTimeToPlay != null && <DataRow label="До воспроизв." value={`${(v.videoTimeToPlay / 1000).toFixed(1)}с`} />}
                {v.videoBufferCount != null && v.videoBufferCount > 0 && (
                  <DataRow label="Буферизаций" value={`${v.videoBufferCount} (${((v.videoBufferTime ?? 0) / 1000).toFixed(1)}с)`} />
                )}
                {v.videoDroppedFrames != null && v.videoDroppedFrames > 0 && (
                  <DataRow label="Dropped frames" value={String(v.videoDroppedFrames)} />
                )}
              </div>

              {/* Segment strip */}
              {videoLoading && (
                <p className="text-gray-400 text-[11px]">Загрузка...</p>
              )}
              {videoData && videoData.segments.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Какие части видео смотрел</p>
                  <div className="flex gap-px h-5 rounded overflow-hidden">
                    {videoData.segments.map((watched, i) => (
                      <div
                        key={i}
                        className={`flex-1 ${watched ? "bg-indigo-500" : "bg-gray-200"}`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>0:00</span>
                    <span>{formatTimecode(videoData.durationSeconds)}</span>
                  </div>
                </div>
              )}

              {/* Event timeline */}
              {videoData && videoData.events.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">События</p>
                  <div className="max-h-40 overflow-y-auto space-y-0">
                    {videoData.events.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] py-1 border-b border-gray-100 last:border-0">
                        <VideoEventIcon type={e.eventType} />
                        <span className="text-gray-500 w-14 flex-shrink-0">{formatTimecode(Math.round(e.position))}</span>
                        <span className="text-gray-700">{videoEventLabel(e)}</span>
                        <span className="text-gray-400 ml-auto flex-shrink-0">
                          {new Date(e.clientTimestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Grid of data sections */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Geo */}
            <DataSection title="Гео и сеть" icon={<Globe className="w-4 h-4 text-gray-500" />}>
              <DataRow label="IP" value={v.ip} />
              <DataRow label="Страна" value={v.country} extra={v.countryCode} />
              <DataRow label="Город" value={v.city} />
              <DataRow label="Регион" value={v.region} />
              <DataRow label="Таймзона" value={v.timezone} />
              <DataRow label="Координаты" value={v.lat && v.lon ? `${v.lat}, ${v.lon}` : null} />
              <DataRow label="ISP" value={v.isp} />
              <DataRow label="Организация" value={v.org} />
              <DataRow label="AS" value={v.asNumber} />
            </DataSection>

            {/* Device */}
            <DataSection title="Устройство" icon={<Smartphone className="w-4 h-4 text-gray-500" />}>
              <DataRow label="Тип" value={v.deviceType} />
              <DataRow label="Браузер" value={v.browser} extra={v.browserVersion} />
              <DataRow label="ОС" value={v.os} extra={v.osVersion} />
              <DataRow label="Экран" value={v.screenWidth && v.screenHeight ? `${v.screenWidth}×${v.screenHeight}` : null} />
              <DataRow label="Viewport" value={v.viewportWidth && v.viewportHeight ? `${v.viewportWidth}×${v.viewportHeight}` : null} />
              <DataRow label="Pixel Ratio" value={v.pixelRatio} />
              <DataRow label="Тач" value={v.touchSupport != null ? (v.touchSupport ? `Да (${v.maxTouchPoints || 0} точек)` : "Нет") : null} />
            </DataSection>

            {/* Hardware */}
            <DataSection title="Железо" icon={<Settings className="w-4 h-4 text-gray-500" />}>
              <DataRow label="CPU ядра" value={v.cpuCores} />
              <DataRow label="RAM" value={v.deviceMemory ? `${v.deviceMemory} GB` : null} />
              <DataRow label="GPU" value={v.gpuRenderer} />
              <DataRow label="GPU вендор" value={v.gpuVendor} />
              <DataRow label="Батарея" value={v.batteryLevel != null ? `${Math.round(v.batteryLevel * 100)}%` : null} extra={v.batteryCharging ? "заряжается" : v.batteryCharging === false ? "разряжается" : null} />
            </DataSection>

            {/* Connection */}
            <DataSection title="Соединение" icon={<Wifi className="w-4 h-4 text-gray-500" />}>
              <DataRow label="Тип" value={v.connectionType} />
              <DataRow label="Скорость" value={v.downlink ? `${v.downlink} Mbps` : null} />
              <DataRow label="RTT" value={v.rtt ? `${v.rtt} ms` : null} />
              <DataRow label="Экономия данных" value={v.saveData != null ? (v.saveData ? "Да" : "Нет") : null} />
            </DataSection>

            {/* Preferences */}
            <DataSection title="Настройки" icon={<Palette className="w-4 h-4 text-gray-500" />}>
              <DataRow label="Тёмная тема" value={v.darkMode != null ? (v.darkMode ? "Да" : "Нет") : null} />
              <DataRow label="Reduced Motion" value={v.reducedMotion != null ? (v.reducedMotion ? "Да" : "Нет") : null} />
              <DataRow label="Cookies" value={v.cookiesEnabled != null ? (v.cookiesEnabled ? "Да" : "Нет") : null} />
              <DataRow label="Do Not Track" value={v.doNotTrack != null ? (v.doNotTrack ? "Да" : "Нет") : null} />
              <DataRow label="Adblock" value={v.adBlocker != null ? (v.adBlocker ? "Да" : "Нет") : null} />
              <DataRow label="Язык" value={v.browserLang} />
              <DataRow label="Все языки" value={v.browserLangs} />
            </DataSection>

            {/* Engagement */}
            <DataSection title="Вовлечённость" icon={<BarChart3 className="w-4 h-4 text-gray-500" />}>
              <DataRow label="Время на стр." value={v.timeOnPage ? formatTime(v.timeOnPage) : null} />
              <DataRow label="Скролл" value={v.maxScrollDepth != null ? `${v.maxScrollDepth}%` : null} />
              <DataRow label="Клики" value={v.totalClicks} />
              <DataRow label="Переключ. табов" value={v.tabSwitches} />
              <DataRow label="Купить" value={v.buyButtonClicked ? "Да" : "Нет"} />
            </DataSection>

            {/* Source */}
            <DataSection title="Источник" icon={<Link2 className="w-4 h-4 text-gray-500" />}>
              <DataRow label="Referrer" value={v.referrer} />
              <DataRow label="Домен" value={v.referrerDomain} />
              <DataRow label="UTM source" value={v.utmSource} />
              <DataRow label="UTM medium" value={v.utmMedium} />
              <DataRow label="UTM campaign" value={v.utmCampaign} />
              <DataRow label="UTM term" value={v.utmTerm} />
              <DataRow label="UTM content" value={v.utmContent} />
            </DataSection>

            {/* Fingerprint */}
            <DataSection title="Fingerprint" icon={<Key className="w-4 h-4 text-gray-500" />}>
              <DataRow label="Canvas hash" value={v.canvasHash} />
              <DataRow label="WebGL hash" value={v.webglHash} />
            </DataSection>

          </div>

          {/* Extended data — all exotic fingerprinting */}
          {v.extendedData && typeof v.extendedData === "object" && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-brand" /> Расширенные данные
              </p>
              <ExtendedDataView data={v.extendedData as Record<string, unknown>} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VideoEventIcon({ type }: { type: string }) {
  switch (type) {
    case "PLAY": return <Play className="w-3 h-3 text-green-500 flex-shrink-0" />;
    case "PAUSE": return <Pause className="w-3 h-3 text-yellow-500 flex-shrink-0" />;
    case "SEEK": return <SkipForward className="w-3 h-3 text-gray-400 flex-shrink-0" />;
    case "ENDED": return <CheckCircle className="w-3 h-3 text-green-600 flex-shrink-0" />;
    case "RATE_CHANGE": return <Gauge className="w-3 h-3 text-gray-400 flex-shrink-0" />;
    case "ERROR": return <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />;
    default: return <Play className="w-3 h-3 text-gray-300 flex-shrink-0" />;
  }
}

function videoEventLabel(e: { eventType: string; seekFrom: number | null; seekTo: number | null; playbackRate: number }): string {
  switch (e.eventType) {
    case "PLAY": return "Воспроизведение";
    case "PAUSE": return "Пауза";
    case "SEEK": return `Перемотка ${e.seekFrom != null ? formatTimecode(Math.round(e.seekFrom)) : "?"} → ${e.seekTo != null ? formatTimecode(Math.round(e.seekTo)) : "?"}`;
    case "ENDED": return "Конец видео";
    case "RATE_CHANGE": return `Скорость ×${e.playbackRate}`;
    case "QUALITY_CHANGE": return "Смена качества";
    case "FULLSCREEN": return "Полный экран";
    case "ERROR": return "Ошибка";
    default: return e.eventType;
  }
}

function DataSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-gray-900 mb-2 flex items-center gap-1.5">{icon}{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function DataRow({ label, value, extra }: { label: string; value: unknown; extra?: string | null }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-gray-700 text-right truncate">
        {String(value)}
        {extra && <span className="text-gray-400 ml-1">{extra}</span>}
      </span>
    </div>
  );
}

function ExtendedDataView({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Object.entries(data).map(([key, value]) => {
        if (value === null || value === undefined) return null;
        if (typeof value === "object" && !Array.isArray(value)) {
          return (
            <div key={key}>
              <p className="text-[10px] text-brand font-semibold uppercase tracking-wider mb-1">{key}</p>
              <div className="space-y-0.5">
                {Object.entries(value as Record<string, unknown>).map(([k, v]) => {
                  if (v === null || v === undefined) return null;
                  const display = typeof v === "object" ? JSON.stringify(v) : String(v);
                  return (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="text-gray-400 truncate">{k}</span>
                      <span className="text-gray-700 text-right truncate max-w-[200px]" title={display}>{display}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }
        if (Array.isArray(value)) {
          return (
            <div key={key}>
              <p className="text-[10px] text-brand font-semibold uppercase tracking-wider mb-1">{key}</p>
              <p className="text-gray-700 text-[10px] break-all">{value.length > 10 ? `[${value.length} items] ${value.slice(0, 5).join(", ")}...` : value.join(", ")}</p>
            </div>
          );
        }
        return (
          <div key={key} className="flex justify-between gap-2">
            <span className="text-gray-400">{key}</span>
            <span className="text-gray-700 text-right truncate max-w-[200px]" title={String(value)}>{String(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function BreakdownCard({ title, icon, data, total }: { title: string; icon?: React.ReactNode; data: [string, number][]; total: number }) {
  if (data.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">{icon}{title}</h3>
      <div className="space-y-2">
        {data.map(([name, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={name}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-700 truncate mr-2">{name}</span>
                <span className="text-gray-400 flex-shrink-0">{count} ({pct}%)</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
