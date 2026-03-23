"use client";

import { useState, useEffect, useCallback } from "react";
import { EditEmailModal } from "@/components/dashboard/edit-email-modal";

interface IncomingEmail {
  id: string;
  messageId: string;
  from: string;
  subject: string;
  body: string;
  productUrl: string | null;
  productName: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  receivedAt: string;
  processed: boolean;
  archived: boolean;
}

type Filter = "all" | "new" | "processed" | "archived";

const filterLabels: Record<Filter, string> = {
  all: "Все",
  new: "Новые",
  processed: "Обработанные",
  archived: "Архив",
};

export default function EmailsPage() {
  const [emails, setEmails] = useState<IncomingEmail[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingEmail, setEditingEmail] = useState<IncomingEmail | null>(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/emails?filter=${filter}&page=${page}`);
    const data = await res.json();
    setEmails(data.emails);
    setTotalPages(data.totalPages);
    setTotal(data.total);
    setLoading(false);
  }, [filter, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching pattern
    void fetchEmails();
    const interval = setInterval(() => void fetchEmails(), 60_000);
    return () => clearInterval(interval);
  }, [fetchEmails]);

  async function handleArchive(id: string) {
    await fetch(`/api/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    fetchEmails();
  }

  function handleSaved() {
    setEditingEmail(null);
    fetchEmails();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Входящие заявки</h1>
        <p className="mt-1 text-sm text-gray-500">
          {total} {total === 1 ? "заявка" : "заявок"}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {(Object.keys(filterLabels) as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filter === f
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {filterLabels[f]}
          </button>
        ))}
      </div>

      {/* Email list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      ) : emails.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">Заявок пока нет</p>
          <p className="text-gray-400 text-sm mt-1">
            Новые заявки появятся автоматически
          </p>
        </div>
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
                    {!email.processed && !email.archived && (
                      <span className="inline-block w-2 h-2 rounded-full bg-brand flex-shrink-0" />
                    )}
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {email.customerName || email.from}
                    </h3>
                    {email.processed && (
                      <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
                        Обработана
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 truncate">{email.subject}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                    {email.customerEmail && <span>{email.customerEmail}</span>}
                    {email.customerPhone && <span>{email.customerPhone}</span>}
                    {email.productUrl && (
                      <span className="truncate max-w-[200px]">{email.productUrl}</span>
                    )}
                    <span>{new Date(email.receivedAt).toLocaleDateString("ru-RU")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setEditingEmail(email)}
                    className="text-sm text-gray-500 hover:text-brand transition-colors px-2 py-1"
                  >
                    Редактировать
                  </button>
                  {!email.archived && (
                    <button
                      onClick={() => handleArchive(email.id)}
                      className="text-sm text-gray-400 hover:text-red-500 transition-colors px-2 py-1"
                    >
                      Архив
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
          >
            Назад
          </button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
          >
            Далее
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editingEmail && (
        <EditEmailModal
          email={editingEmail}
          onClose={() => setEditingEmail(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
