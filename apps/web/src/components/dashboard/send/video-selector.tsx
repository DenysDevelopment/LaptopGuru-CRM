"use client";

import Image from "next/image";
import { useState } from "react";
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

export function VideoSelector({
  videos,
  loading,
  selectedId,
  onSelect,
  onVideoCreated,
}: VideoSelectorProps) {
  const [modalOpen, setModalOpen] = useState(false);

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
              <div className="relative aspect-[9/16] bg-black">
                {video.thumbnail ? (
                  <Image
                    src={video.thumbnail}
                    alt={video.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">Нет превью</div>
                )}
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
