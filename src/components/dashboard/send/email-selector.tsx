"use client";

import type { IncomingEmail } from "@/types";

interface EmailSelectorProps {
  emails: IncomingEmail[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}

export function EmailSelector({ emails, loading, selectedId, onSelect }: EmailSelectorProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-900">1. Выберите заявку</h2>
        {emails.length > 0 && (
          <span className="bg-brand text-white text-xs px-2 py-0.5 rounded-full">{emails.length}</span>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-100 animate-pulse rounded-lg h-16" />
          ))}
        </div>
      ) : emails.length === 0 ? (
        <p className="text-sm text-gray-400">Нет новых заявок</p>
      ) : (
        <div className="space-y-2 max-h-[280px] overflow-y-auto">
          {emails.map((email) => (
            <button
              key={email.id}
              onClick={() => onSelect(email.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedId === email.id
                  ? "border-brand bg-brand-light ring-2 ring-brand/20"
                  : "border-gray-100 bg-white hover:border-gray-300"
              }`}
            >
              <p className="text-sm font-medium text-gray-900 truncate">
                {email.customerName || email.subject}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {email.customerEmail || "Нет email"} · {new Date(email.receivedAt).toLocaleDateString("ru-RU")}
              </p>
              {email.productName && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{email.productName}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
