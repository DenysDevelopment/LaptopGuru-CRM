"use client";

import { useState } from "react";
import type { IncomingEmail } from "@/types";
import { useEmails } from "@/hooks/use-emails";
import { EmailFilters } from "@/components/dashboard/emails/email-filters";
import { EmailListItem } from "@/components/dashboard/emails/email-list-item";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { EditEmailModal } from "@/components/dashboard/edit-email-modal";

export default function EmailsPage() {
  const {
    emails, filter, category, page, totalPages, total, loading,
    setPage, setFilter, setCategory, fetchEmails, handleArchive,
  } = useEmails();
  const [editingEmail, setEditingEmail] = useState<IncomingEmail | null>(null);

  function onArchive(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    handleArchive(id);
  }

  function onEdit(e: React.MouseEvent, email: IncomingEmail) {
    e.preventDefault();
    e.stopPropagation();
    setEditingEmail(email);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Входящие заявки</h1>
        <p className="mt-1 text-sm text-gray-500">
          {total} {total === 1 ? "заявка" : "заявок"}
        </p>
      </div>

      <EmailFilters
        filter={filter}
        category={category}
        onFilterChange={setFilter}
        onCategoryChange={setCategory}
      />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      ) : emails.length === 0 ? (
        <EmptyState title="Заявок пока нет" subtitle="Новые заявки появятся автоматически" />
      ) : (
        <div className="space-y-3">
          {emails.map((email) => (
            <EmailListItem
              key={email.id}
              email={email}
              onEdit={onEdit}
              onArchive={onArchive}
            />
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {editingEmail && (
        <EditEmailModal
          email={editingEmail}
          onClose={() => setEditingEmail(null)}
          onSaved={() => { setEditingEmail(null); fetchEmails(); }}
        />
      )}
    </div>
  );
}
