"use client";

import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import type { QuickLink } from "@/types";
import { CreateQuickLinkForm } from "@/components/dashboard/quicklinks/create-form";
import { LinkCard } from "@/components/dashboard/quicklinks/link-card";
import { EmptyState } from "@/components/ui/empty-state";

export default function QuickLinksPage() {
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [loading, setLoading] = useState(true);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  function loadLinks() {
    fetch("/api/quicklinks")
      .then((r) => r.json())
      .then((d) => { setLinks(d); setLoading(false); });
  }

  useEffect(() => { loadLinks(); }, []);

  async function handleDelete(id: string) {
    if (!confirm("Удалить ссылку?")) return;
    await fetch("/api/quicklinks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadLinks();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Link2 className="w-6 h-6 text-brand" /> Короткие ссылки
        </h1>
        <CreateQuickLinkForm onCreated={loadLinks} />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      ) : links.length === 0 ? (
        <EmptyState
          title="Ссылок пока нет"
          subtitle='Нажмите «Новая ссылка» чтобы создать'
          icon={<Link2 className="w-12 h-12 text-gray-200" />}
        />
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <LinkCard key={link.id} link={link} appUrl={appUrl} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
