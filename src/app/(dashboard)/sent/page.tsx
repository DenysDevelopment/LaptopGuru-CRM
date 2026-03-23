"use client";

import { useState, useEffect } from "react";
import type { SentEmailWithDetails } from "@/types";
import { EmptyState } from "@/components/ui/empty-state";

export default function SentPage() {
  const [emails, setEmails] = useState<SentEmailWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sent")
      .then((r) => r.json())
      .then((d) => { setEmails(d); setLoading(false); });
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">История отправок</h1>
        <p className="mt-1 text-sm text-gray-500">{emails.length} отправленных писем</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      ) : emails.length === 0 ? (
        <EmptyState title="Ещё ничего не отправлено" />
      ) : (
        <div className="space-y-3">
          {emails.map((email) => (
            <div
              key={email.id}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        email.status === "sent" ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{email.to}</h3>
                  </div>
                  <p className="text-sm text-gray-600 truncate">{email.subject}</p>
                  <p className="text-xs text-gray-400 mt-1">{email.landing.video.title}</p>
                  {email.errorMessage && (
                    <p className="text-xs text-red-500 mt-1">{email.errorMessage}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">
                    {new Date(email.sentAt).toLocaleDateString("ru-RU")}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(email.sentAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
