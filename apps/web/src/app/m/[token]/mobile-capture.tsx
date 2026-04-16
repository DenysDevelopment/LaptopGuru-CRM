"use client";

import { useCallback, useRef, useState } from "react";

interface Props {
  token: string;
  title: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "picked"; file: File; previewUrl: string }
  | { kind: "uploading"; pct: number }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function MobileCapture({ token, title }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastPctReportedAt = useRef(0);

  const handlePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setPhase({ kind: "error", message: "Выбран не видеофайл" });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPhase({ kind: "picked", file, previewUrl });
  }, []);

  const reportProgress = useCallback(
    (pct: number) => {
      const nowTs = Date.now();
      if (nowTs - lastPctReportedAt.current < 500 && pct < 100) return;
      lastPctReportedAt.current = nowTs;
      fetch(`/api/videos/mobile-upload/${token}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pct }),
        keepalive: true,
      }).catch(() => {});
    },
    [token],
  );

  const startUpload = useCallback(async () => {
    if (phase.kind !== "picked") return;
    const file = phase.file;
    setPhase({ kind: "uploading", pct: 0 });

    try {
      const initRes = await fetch(`/api/videos/mobile-upload/${token}/upload-init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileSize: file.size, mimeType: file.type }),
      });
      if (!initRes.ok) {
        const data = await initRes.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось инициализировать");
      }
      const { putUrl } = await initRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", putUrl, true);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setPhase({ kind: "uploading", pct });
            reportProgress(pct);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`S3 upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Сеть оборвалась"));
        xhr.send(file);
      });

      const completeRes = await fetch(`/api/videos/mobile-upload/${token}/upload-complete`, {
        method: "POST",
      });
      if (!completeRes.ok) {
        const data = await completeRes.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось завершить");
      }

      setPhase({ kind: "done" });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Ошибка загрузки",
      });
    }
  }, [phase, token, reportProgress]);

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="px-5 pt-6 pb-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white font-bold text-sm">
          LG
        </div>
        <div>
          <p className="text-xs text-gray-500">LaptopGuru CRM</p>
          <h1 className="text-sm font-semibold text-gray-900 -mt-0.5">
            Добавить видео
          </h1>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1.5">
              Название
            </p>
            <p className="text-base font-medium text-gray-900 break-words">
              {title}
            </p>
          </div>

          {phase.kind === "idle" && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 rounded-2xl bg-brand text-white font-semibold text-base shadow-sm hover:brightness-95 active:scale-[0.99] transition"
              >
                🎥 Снять видео
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                onChange={handlePick}
                className="hidden"
              />
              <p className="mt-3 text-center text-xs text-gray-500">
                Откроется камера телефона.
              </p>
            </>
          )}

          {phase.kind === "picked" && (
            <>
              { }
              <video
                src={phase.previewUrl}
                controls
                playsInline
                className="w-full rounded-2xl bg-black aspect-video"
              />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(phase.previewUrl);
                    setPhase({ kind: "idle" });
                  }}
                  className="py-3 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm"
                >
                  Переснять
                </button>
                <button
                  type="button"
                  onClick={startUpload}
                  className="py-3 rounded-xl bg-brand text-white font-semibold text-sm"
                >
                  Отправить
                </button>
              </div>
            </>
          )}

          {phase.kind === "uploading" && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
              <div className="text-3xl font-semibold text-gray-900">
                {phase.pct}%
              </div>
              <p className="text-xs text-gray-500 mt-1 mb-4">
                Загружается на сервер…
              </p>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-brand h-2 rounded-full transition-all"
                  style={{ width: `${phase.pct}%` }}
                />
              </div>
            </div>
          )}

          {phase.kind === "done" && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-3">
                <svg
                  className="w-7 h-7 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-900">Готово</p>
              <p className="mt-1 text-sm text-gray-600">
                Можете закрыть вкладку — видео уже в CRM.
              </p>
            </div>
          )}

          {phase.kind === "error" && (
            <div className="bg-white rounded-2xl border border-red-100 p-5 text-center">
              <p className="text-sm text-red-600 font-medium">{phase.message}</p>
              <button
                type="button"
                onClick={() => setPhase({ kind: "idle" })}
                className="mt-4 py-2.5 px-5 rounded-lg bg-gray-900 text-white text-sm"
              >
                Попробовать снова
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
