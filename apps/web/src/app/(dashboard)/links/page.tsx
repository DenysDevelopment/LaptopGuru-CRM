"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";

interface Landing {
  id: string;
  slug: string;
  title: string;
  views: number;
  clicks: number;
  createdAt: string;
  video: { title: string; thumbnail: string };
  shortLinks: { code: string; clicks: number }[];
  incomingEmail: { customerName: string | null; customerEmail: string | null } | null;
}

export default function LinksPage() {
  const [landings, setLandings] = useState<Landing[]>([]);
  const [loading, setLoading] = useState(true);
  const [customDomain, setCustomDomain] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/links")
      .then((r) => r.json())
      .then((d) => { setLandings(d); setLoading(false); });
    fetch("/api/company-settings")
      .then((r) => r.json())
      .then((d) => setCustomDomain(d?.customDomain ?? null))
      .catch(() => {});
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shortUrlBase = customDomain ? `https://${customDomain}` : origin;

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ссылки</h1>
        <p className="mt-1 text-sm text-gray-500">Лендинги и короткие ссылки</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      ) : landings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">Ссылок пока нет</p>
          <p className="text-gray-400 text-sm mt-1">Они появятся после отправки первого письма</p>
        </div>
      ) : (
        <div className="space-y-3">
          {landings.map((landing) => (
            <div
              key={landing.id}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">{landing.title}</h3>
                  {landing.incomingEmail && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {landing.incomingEmail.customerName} · {landing.incomingEmail.customerEmail}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {landing.shortLinks.map((sl) => (
                      <button
                        key={sl.code}
                        onClick={() => copyToClipboard(`${shortUrlBase}/${sl.code}`)}
                        className="text-xs text-brand hover:text-brand-hover transition-colors"
                      >
                        {(customDomain ?? origin.replace(/^https?:\/\//, "")) + "/" + sl.code} — копировать
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4 text-center flex-shrink-0">
                  <div>
                    <p className="text-lg font-bold text-gray-900">{landing.views}</p>
                    <p className="text-xs text-gray-400">просмотров</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">{landing.clicks}</p>
                    <p className="text-xs text-gray-400">кликов</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">
                      {landing.shortLinks.reduce((sum, sl) => sum + sl.clicks, 0)}
                    </p>
                    <p className="text-xs text-gray-400">переходов</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-400">
                  {new Date(landing.createdAt).toLocaleDateString("ru-RU")}
                </p>
                <Link
                  href={`/analytics/${landing.slug}`}
                  className="text-xs text-brand hover:text-brand-hover font-medium transition-colors"
                >
                  <span className="inline-flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5" /> Аналитика →</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
