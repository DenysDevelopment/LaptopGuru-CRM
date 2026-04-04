"use client";

import { useEffect, useRef } from "react";

const EMAIL_SYNC_INTERVAL = 60_000; // 60 секунд
const VIDEO_SYNC_INTERVAL = 300_000; // 5 минут
// Email sync to messaging (Почта) disabled — emails go only to Заявки и Видео

export function AutoSync() {
  const emailTimer = useRef<ReturnType<typeof setInterval>>(null);
  const videoTimer = useRef<ReturnType<typeof setInterval>>(null);
  useEffect(() => {
    async function syncEmails() {
      try {
        await fetch("/api/emails/sync", { method: "POST" });
      } catch {
        // тихо игнорируем ошибки
      }
    }

    async function syncVideos() {
      try {
        await fetch("/api/videos/sync", { method: "POST" });
      } catch {
        // тихо игнорируем ошибки
      }
    }

    // Сразу при загрузке
    syncEmails();
    syncVideos();

    // Повторять по интервалу
    emailTimer.current = setInterval(syncEmails, EMAIL_SYNC_INTERVAL);
    videoTimer.current = setInterval(syncVideos, VIDEO_SYNC_INTERVAL);

    return () => {
      if (emailTimer.current) clearInterval(emailTimer.current);
      if (videoTimer.current) clearInterval(videoTimer.current);
    };
  }, []);

  return null;
}
