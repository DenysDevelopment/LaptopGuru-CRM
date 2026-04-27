"use client";

import { Check, CheckCircle2, Copy, Eye } from "lucide-react";
import { useState } from "react";
import type { SendMode } from "./mode-toggle";
import type { SendLanguage } from "@/lib/schemas/send";

interface SendResultProps {
  result: {
    shortLink: { url: string };
    landing: { url: string; previewToken?: string };
    sentEmail?: { status: string };
  };
  mode?: SendMode;
  language?: SendLanguage;
  onReset: () => void;
}

const MESSAGE_BY_LANG: Record<SendLanguage, string> = {
  pl: "Dzień dobry, poniżej przesyłam link do wideo recenzji, w której mogą Państwo zapoznać się ze wszystkimi szczegółami.",
  uk: "Доброго дня, нижче надсилаю посилання на відеоогляд, у якому Ви можете ознайомитися з усіма деталями.",
  ru: "Добрый день, ниже отправляю ссылку на видеообзор, в котором Вы можете ознакомиться со всеми деталями.",
  en: "Good day, below I am sending a link to the video review, where you can find all the details.",
  lt: "Laba diena, žemiau siunčiu nuorodą į vaizdo apžvalgą, kurioje galite susipažinti su visomis detalėmis.",
  et: "Tere päevast, allpool saadan lingi videoülevaatele, kus saate tutvuda kõigi üksikasjadega.",
  lv: "Labdien, zemāk nosūtu saiti uz video apskatu, kurā varat iepazīties ar visām detaļām.",
};

const LANGUAGE_OPTIONS: { value: SendLanguage; label: string }[] = [
  { value: "pl", label: "Polski" },
  { value: "uk", label: "Українська" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "lt", label: "Lietuvių" },
  { value: "et", label: "Eesti" },
  { value: "lv", label: "Latviešu" },
];

export function SendResult({
  result,
  mode = "email",
  language = "pl",
  onReset,
}: SendResultProps) {
  const isAllegro = mode === "allegro";
  const [copiedShort, setCopiedShort] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [messageLanguage, setMessageLanguage] = useState<SendLanguage>(language);
  const [allegroMessage, setAllegroMessage] = useState(
    MESSAGE_BY_LANG[language] ?? MESSAGE_BY_LANG.pl,
  );

  function handleLanguageChange(lang: SendLanguage) {
    setMessageLanguage(lang);
    setAllegroMessage(MESSAGE_BY_LANG[lang] ?? MESSAGE_BY_LANG.pl);
  }

  function copyShortLink() {
    navigator.clipboard.writeText(result.shortLink.url);
    setCopiedShort(true);
    setTimeout(() => setCopiedShort(false), 2000);
  }

  function copyMessage() {
    navigator.clipboard.writeText(allegroMessage);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  }

  const headline = isAllegro
    ? "Ссылка сгенерирована"
    : result.sentEmail?.status === "sent"
      ? "Успешно отправлено"
      : result.sentEmail
        ? "Ошибка отправки"
        : "Готово";

  const previewHref = result.landing.previewToken
    ? `${result.landing.url}?preview=${result.landing.previewToken}`
    : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isAllegro ? "Ссылка готова" : "Отправлено!"}
      </h1>
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 max-w-lg space-y-4">
        {/* Header — status + preview action aligned in one row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" strokeWidth={2.2} />
            <span className="text-base font-semibold text-emerald-800 truncate">{headline}</span>
          </div>
          {previewHref && (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800/80 hover:text-emerald-900 transition-colors flex-shrink-0"
              title="Открыть превью без трекинга"
            >
              <Eye className="w-3.5 h-3.5" />
              Превью
            </a>
          )}
        </div>

        {/* Section: short link */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500">
            {isAllegro ? "Короткая ссылка" : "Ссылка с отслеживанием"}
          </p>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 min-w-0 text-sm text-gray-900 font-mono bg-white border border-gray-200 rounded-lg px-3 py-2 truncate">
              {result.shortLink.url}
            </code>
            <button
              type="button"
              onClick={copyShortLink}
              className={`inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 transition-colors flex-shrink-0 ${
                copiedShort
                  ? "bg-emerald-500 text-white"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
              title="Скопировать ссылку"
            >
              {copiedShort ? (
                <Check className="w-4 h-4" strokeWidth={2.5} />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{copiedShort ? "OK" : "Копировать"}</span>
            </button>
          </div>
        </div>

        {/* Section: message (Allegro only) */}
        {isAllegro && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-gray-500">Сообщение для клиента</p>
              <select
                value={messageLanguage}
                onChange={(e) => handleLanguageChange(e.target.value as SendLanguage)}
                className="text-xs text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-0.5 outline-none focus:border-brand focus:ring-1 focus:ring-brand-muted"
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={allegroMessage}
              onChange={(e) => setAllegroMessage(e.target.value)}
              rows={3}
              className="w-full text-sm text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none resize-none focus:border-brand focus:ring-1 focus:ring-brand-muted"
              placeholder="Текст сообщения…"
            />
            <button
              type="button"
              onClick={copyMessage}
              className={`w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-lg py-2 transition-colors ${
                copiedMessage
                  ? "bg-emerald-500 text-white"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {copiedMessage ? (
                <>
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                  Скопировано
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Скопировать текст
                </>
              )}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onReset}
          className="w-full bg-brand hover:bg-brand-hover text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          {isAllegro ? "Создать ещё" : "Отправить ещё"}
        </button>
      </div>
    </div>
  );
}
