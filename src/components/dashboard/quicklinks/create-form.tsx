"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

interface CreateFormProps {
  onCreated: () => void;
}

export function CreateQuickLinkForm({ onCreated }: CreateFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [slug, setSlug] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!slug || !targetUrl) return;
    setCreating(true);
    setError("");

    const res = await fetch("/api/quicklinks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, targetUrl, name: name || undefined }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Ошибка");
    } else {
      setSlug("");
      setTargetUrl("");
      setName("");
      setShowForm(false);
      onCreated();
    }
    setCreating(false);
  }

  return (
    <>
      <button
        onClick={() => setShowForm(!showForm)}
        className="cursor-pointer flex items-center gap-2 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2.5 rounded-lg transition-colors text-sm"
      >
        <Plus className="w-4 h-4" /> Новая ссылка
      </button>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6 space-y-3">
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Slug (латиница)</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">/go/</span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="allegro"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand-muted outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">URL назначения</label>
              <input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://allegro.pl/..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand-muted outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Название (опционально)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Allegro MacBook"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand-muted outline-none"
              />
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !slug || !targetUrl}
            className="cursor-pointer bg-brand hover:bg-brand-hover text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm disabled:opacity-50"
          >
            {creating ? "Создание..." : "Создать"}
          </button>
        </div>
      )}
    </>
  );
}
