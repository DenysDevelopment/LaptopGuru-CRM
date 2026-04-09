"use client";

import Image from "next/image";
import type { Video } from "@/types";

interface VideoSelectorProps {
  videos: Video[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}

export function VideoSelector({ videos, loading, selectedId, onSelect }: VideoSelectorProps) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-3">2. Выберите видео</h2>
      {loading ? (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-100 animate-pulse rounded-lg aspect-video" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <p className="text-sm text-gray-400">Добавьте видео в библиотеку</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto">
          {videos.map((video) => (
            <button
              key={video.id}
              type="button"
              onClick={() => onSelect(video.id)}
              className={`text-left rounded-lg overflow-hidden border transition-colors ${
                selectedId === video.id
                  ? "ring-2 ring-brand border-brand"
                  : "border-gray-100 hover:border-gray-300"
              }`}
            >
              <div className="relative aspect-video bg-gray-100">
                <Image
                  src={video.thumbnail}
                  alt={video.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 50vw, 25vw"
                />
                {video.duration && (
                  <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                    {video.duration}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-gray-900 line-clamp-1 p-1.5">{video.title}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
