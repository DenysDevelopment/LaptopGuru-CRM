"use client";

import { Check } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import type { Video } from "@/types";
import { AddVideoModal } from "./add-video-modal";

interface VideoSelectorProps {
  videos: Video[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  /** Called when a brand-new video has been created via the "+" modal. */
  onVideoCreated?: (videoId: string) => void;
}

function formatVideoDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Сегодня";
  if (sameDay(d, yesterday)) return "Вчера";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === today.getFullYear() ? undefined : "2-digit",
  });
}

export function VideoSelector({
  videos,
  loading,
  selectedId,
  onSelect,
  onVideoCreated,
}: VideoSelectorProps) {
  const [modalOpen, setModalOpen] = useState(false);

  // API already orders by createdAt desc, but be defensive — re-sort here so
  // any stale cache or upstream reorder doesn't leave the user confused.
  const sortedVideos = useMemo(
    () =>
      [...videos].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      }),
    [videos],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">2. Выберите видео</h2>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand/80 rounded-md px-2 py-1 hover:bg-brand/5 transition-colors"
          aria-label="Добавить новое видео"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Добавить
        </button>
      </div>
      <AddVideoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(videoId) => {
          onVideoCreated?.(videoId);
        }}
      />
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-gray-100 animate-pulse rounded-lg aspect-[9/16]" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <p className="text-sm text-gray-400">Добавьте видео в библиотеку</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[420px] overflow-y-auto">
          {sortedVideos.map((video) => {
            const used = (video.landingsCount ?? 0) > 0;
            const dateLabel = formatVideoDate(video.createdAt);
            return (
              <button
                key={video.id}
                type="button"
                onClick={() => onSelect(video.id)}
                className={`text-left rounded-lg overflow-hidden border transition-colors ${
                  selectedId === video.id
                    ? "ring-2 ring-brand border-brand"
                    : "border-gray-100 hover:border-gray-300"
                } ${used ? "" : "ring-1 ring-amber-300/60"}`}
              >
                <div className="relative aspect-[9/16] bg-black">
                  {video.thumbnail ? (
                    <Image
                      src={video.thumbnail}
                      alt={video.title}
                      fill
                      className={`object-cover ${used ? "opacity-90" : ""}`}
                      sizes="(max-width: 1024px) 50vw, 25vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">Нет превью</div>
                  )}
                  {used ? (
                    <span
                      className="absolute top-1 left-1 inline-flex items-center gap-0.5 bg-emerald-500/95 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded shadow"
                      title={`Использовано в ${video.landingsCount} лендинге(ах)`}
                    >
                      <Check className="w-2.5 h-2.5" strokeWidth={3} />
                      {video.landingsCount}
                    </span>
                  ) : (
                    <span
                      className="absolute top-1 left-1 bg-amber-400/95 text-amber-950 text-[10px] font-semibold px-1.5 py-0.5 rounded shadow"
                      title="Видео ещё не использовалось"
                    >
                      NEW
                    </span>
                  )}
                  {video.duration && (
                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                      {video.duration}
                    </span>
                  )}
                </div>
                <div className="px-2 py-1.5 min-h-[2.5rem]">
                  <p
                    className="text-xs font-medium text-gray-900 line-clamp-2 leading-tight"
                    title={video.title}
                  >
                    {video.title}
                  </p>
                  {dateLabel && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{dateLabel}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
