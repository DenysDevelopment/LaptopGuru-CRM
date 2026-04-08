"use client";

import { useState, useEffect } from "react";
import type { IncomingEmail, Video } from "@/types";
import { VALID_LANGUAGES } from "@/lib/constants/languages";
import type { EmailLanguage } from "@/lib/email-template";
import { EmailSelector } from "@/components/dashboard/send/email-selector";
import { VideoSelector } from "@/components/dashboard/send/video-selector";
import { SendSettings } from "@/components/dashboard/send/send-settings";
import { EmailPreview } from "@/components/dashboard/send/email-preview";
import { SendResult } from "@/components/dashboard/send/send-result";

export default function SendPage() {
  const [emails, setEmails] = useState<IncomingEmail[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [selectedVideo, setSelectedVideo] = useState("");
  const [personalNote, setPersonalNote] = useState("");
  const [language, setLanguage] = useState<EmailLanguage>("pl");

  function handleSelectEmail(id: string) {
    setSelectedEmail(id);
    const email = emails.find((e) => e.id === id);
    if (email?.customerLang && VALID_LANGUAGES.includes(email.customerLang as EmailLanguage)) {
      setLanguage(email.customerLang as EmailLanguage);
    }
  }
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ shortLink: { url: string }; landing: { url: string }; sentEmail: { status: string } } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/emails?filter=new&page=1")
      .then((r) => r.ok ? r.json() : { emails: [] })
      .then((d) => { setEmails(d.emails || []); setLoadingEmails(false); })
      .catch(() => setLoadingEmails(false));

    fetch("/api/videos")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setVideos(Array.isArray(d) ? d : []); setLoadingVideos(false); })
      .catch(() => setLoadingVideos(false));

    // Sync in background — no need to block UI
    fetch("/api/emails/sync", { method: "POST" }).catch(() => {});
    fetch("/api/videos/sync", { method: "POST" }).catch(() => {});
  }, []);

  const selectedEmailData = emails.find((e) => e.id === selectedEmail);
  const selectedVideoData = videos.find((v) => v.id === selectedVideo);

  async function handleSend() {
    if (!selectedEmail || !selectedVideo) return;
    if (!confirm("Отправить email клиенту?")) return;

    setError("");
    setSending(true);
    setResult(null);

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId: selectedEmail,
          videoId: selectedVideo,
          personalNote: personalNote || undefined,
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error);
      else setResult(data);
    } catch {
      setError("Ошибка соединения");
    }

    setSending(false);
  }

  if (result) {
    return (
      <SendResult
        result={result}
        onReset={() => {
          setResult(null);
          setSelectedEmail("");
          setSelectedVideo("");
          setPersonalNote("");
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Отправить письмо</h1>
        <p className="mt-1 text-sm text-gray-500">Выберите заявку и видео для отправки</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <EmailSelector
            emails={emails}
            loading={loadingEmails}
            selectedId={selectedEmail}
            onSelect={handleSelectEmail}
          />
          <VideoSelector
            videos={videos}
            loading={loadingVideos}
            selectedId={selectedVideo}
            onSelect={setSelectedVideo}
          />
          {selectedEmail && selectedVideo && (
            <SendSettings
              selectedEmail={selectedEmailData}
              language={language}
              personalNote={personalNote}
              sending={sending}
              onLanguageChange={setLanguage}
              onNoteChange={setPersonalNote}
              onSend={handleSend}
            />
          )}
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-8">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Предпросмотр</p>
            <EmailPreview
              email={selectedEmailData}
              video={selectedVideoData}
              language={language}
              personalNote={personalNote}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
