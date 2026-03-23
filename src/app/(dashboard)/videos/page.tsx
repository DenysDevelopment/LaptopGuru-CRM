"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { Video } from "@/types";
import { EmptyState } from "@/components/ui/empty-state";

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const fetchVideos = useCallback(async () => {
    const res = await fetch("/api/videos");
    const data = await res.json();
    setVideos(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching pattern
    void fetchVideos();
    const interval = setInterval(() => void fetchVideos(), 300_000);
    return () => clearInterval(interval);
  }, [fetchVideos]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setAdding(true);

    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error);
      else { setUrl(""); fetchVideos(); }
    } catch {
      setError("Ошибка соединения");
    }

    setAdding(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить это видео из библиотеки?")) return;
    await fetch(`/api/videos/${id}`, { method: "DELETE" });
    fetchVideos();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Видео</h1>
      </div>

      <form onSubmit={handleAdd} className="mb-8">
        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Ссылка на YouTube видео..."
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:ring-2 focus:ring-brand-muted outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={adding || !url.trim()}
            className="bg-brand hover:bg-brand-hover text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {adding ? "Добавление..." : "Добавить"}
          </button>
        </div>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </form>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      ) : videos.length === 0 ? (
        <EmptyState title="Видео пока нет" subtitle="Добавьте первое видео, вставив ссылку выше" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <div
              key={video.id}
              className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-gray-200 transition-colors group"
            >
              <div className="relative aspect-video bg-gray-100">
                <Image
                  src={video.thumbnail}
                  alt={video.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                {video.duration && (
                  <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                    {video.duration}
                  </span>
                )}
              </div>
              <div className="p-3">
                <h3 className="text-sm font-medium text-gray-900 line-clamp-2">{video.title}</h3>
                {video.channelTitle && (
                  <p className="text-xs text-gray-400 mt-1">{video.channelTitle}</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-400">
                    {video.createdAt ? new Date(video.createdAt).toLocaleDateString("ru-RU") : ""}
                  </span>
                  <button
                    onClick={() => handleDelete(video.id)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
