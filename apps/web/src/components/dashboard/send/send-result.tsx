"use client";

import { CopyableLink } from "@/components/ui/copyable-link";

interface SendResultProps {
  result: {
    shortLink: { url: string };
    landing: { url: string };
    sentEmail: { status: string };
  };
  onReset: () => void;
}

export function SendResult({ result, onReset }: SendResultProps) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Отправлено!</h1>
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 max-w-lg space-y-4">
        <div className="flex items-center gap-3">
          <svg className="w-8 h-8 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span className="text-lg font-bold text-green-800">
            {result.sentEmail.status === "sent" ? "Успешно отправлено!" : "Ошибка отправки"}
          </span>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-1">Лендинг</p>
          <CopyableLink url={result.landing.url} />
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-1">Ссылка для отслеживания перехода</p>
          <CopyableLink url={result.shortLink.url} />
        </div>

        <button
          onClick={onReset}
          className="w-full mt-4 bg-brand hover:bg-brand-hover text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          Отправить ещё
        </button>
      </div>
    </div>
  );
}
