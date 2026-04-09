"use client";

import { useState } from "react";
import { CopyableLink } from "@/components/ui/copyable-link";
import type { SendMode } from "./mode-toggle";
import type { SendLanguage } from "@/lib/schemas/send";

interface SendResultProps {
  result: {
    shortLink: { url: string };
    landing: { url: string };
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
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [messageLanguage, setMessageLanguage] = useState<SendLanguage>(language);
  const [allegroMessage, setAllegroMessage] = useState(
    MESSAGE_BY_LANG[language] ?? MESSAGE_BY_LANG.pl,
  );

  function handleLanguageChange(lang: SendLanguage) {
    setMessageLanguage(lang);
    setAllegroMessage(MESSAGE_BY_LANG[lang] ?? MESSAGE_BY_LANG.pl);
  }

  function copyMessage() {
    navigator.clipboard.writeText(allegroMessage);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isAllegro ? "Ссылка готова" : "Отправлено!"}
      </h1>
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 max-w-lg space-y-4">
        {!isAllegro && result.sentEmail && (
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="text-lg font-bold text-green-800">
              {result.sentEmail.status === "sent" ? "Успешно отправлено!" : "Ошибка отправки"}
            </span>
          </div>
        )}

        {isAllegro && (
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="text-lg font-bold text-green-800">Ссылка сгенерирована</span>
          </div>
        )}

        <div>
          <p className="text-xs text-gray-400 mb-1">
            {isAllegro ? "Короткая ссылка" : "Ссылка с отслеживанием"}
          </p>
          <CopyableLink url={result.shortLink.url} />
        </div>

        {isAllegro && (
          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <p className="text-xs text-gray-400">Готовое сообщение для клиента</p>
              <select
                value={messageLanguage}
                onChange={(e) => handleLanguageChange(e.target.value as SendLanguage)}
                className="text-xs text-gray-600 bg-white border border-gray-200 rounded-md px-2 py-0.5 outline-none focus:border-brand focus:ring-1 focus:ring-brand-muted"
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
              <textarea
                value={allegroMessage}
                onChange={(e) => setAllegroMessage(e.target.value)}
                rows={3}
                className="w-full text-sm text-gray-700 bg-transparent border-0 outline-none resize-none focus:ring-0 p-0"
                placeholder="Текст сообщения..."
              />
              <button
                type="button"
                onClick={copyMessage}
                className="w-full text-xs font-medium text-brand hover:text-brand-hover border border-brand/30 hover:bg-brand-light rounded-md py-1.5 transition-colors"
              >
                {copiedMessage ? "Скопировано!" : "Скопировать текст"}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onReset}
          className="w-full mt-4 bg-brand hover:bg-brand-hover text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {isAllegro ? "Создать ещё" : "Отправить ещё"}
        </button>
      </div>
    </div>
  );
}
