"use client";

import { useMemo } from "react";
import type { IncomingEmail, Video } from "@/types";
import { buildEmailHtml } from "@/lib/email-template";
import type { EmailLanguage } from "@/lib/email-template";
import { FALLBACK_NAME } from "@/lib/constants/languages";

interface EmailPreviewProps {
  email: IncomingEmail | undefined;
  video: Video | undefined;
  language: EmailLanguage;
  personalNote: string;
}

export function EmailPreview({ email, video, language, personalNote }: EmailPreviewProps) {
  const html = useMemo(() => {
    if (!email || !video) return null;
    return buildEmailHtml({
      customerName: email.customerName || FALLBACK_NAME[language],
      videoTitle: video.title,
      thumbnail: video.thumbnail,
      landingUrl: "#",
      personalNote: personalNote || undefined,
      language,
    });
  }, [email, video, language, personalNote]);

  if (!html) {
    return (
      <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
        <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </svg>
        <p className="text-gray-400 text-sm">Выберите заявку и видео для предварительного просмотра</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 shadow-lg overflow-hidden bg-white">
      <div className="bg-gray-100 h-8 flex items-center px-3 gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <span className="ml-2 text-[10px] text-gray-400 truncate">laptop guru</span>
      </div>
      <iframe
        srcDoc={html}
        className="w-full border-0"
        style={{ height: "100vh", maxHeight: 1200 }}
        title="Email preview"
      />
    </div>
  );
}
