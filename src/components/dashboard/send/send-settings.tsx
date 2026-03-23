"use client";

import type { IncomingEmail } from "@/types";

interface SendSettingsProps {
  selectedEmail: IncomingEmail | undefined;
  language: "pl" | "uk" | "ru" | "en";
  personalNote: string;
  buyButtonText: string;
  sending: boolean;
  onLanguageChange: (lang: "pl" | "uk" | "ru" | "en") => void;
  onNoteChange: (note: string) => void;
  onButtonTextChange: (text: string) => void;
  onSend: () => void;
}

export function SendSettings({
  selectedEmail, language, personalNote, buyButtonText, sending,
  onLanguageChange, onNoteChange, onButtonTextChange, onSend,
}: SendSettingsProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">3. Настройки</h2>

      {selectedEmail && (
        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
          <span className="font-medium">{selectedEmail.customerName || "Клиент"}</span>
          {" → "}
          <span>{selectedEmail.customerEmail}</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Язык письма и лендинга</label>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as "pl" | "uk" | "ru" | "en")}
          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-brand focus:ring-2 focus:ring-brand-muted outline-none transition-colors"
        >
          <option value="pl">Polski</option>
          <option value="uk">Українська</option>
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Персональная заметка (опционально)
        </label>
        <textarea
          value={personalNote}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:ring-2 focus:ring-brand-muted outline-none transition-colors resize-none"
          placeholder="Добавьте личное сообщение..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Текст кнопки</label>
        <input
          type="text"
          value={buyButtonText}
          onChange={(e) => onButtonTextChange(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-brand focus:ring-2 focus:ring-brand-muted outline-none transition-colors"
        />
      </div>

      <button
        onClick={onSend}
        disabled={sending}
        className="w-full bg-brand hover:bg-brand-hover text-white font-bold py-3 rounded-xl text-lg transition-colors disabled:opacity-50"
      >
        {sending ? "Отправка..." : "Отправить"}
      </button>
    </div>
  );
}
