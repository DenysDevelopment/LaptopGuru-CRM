"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { EmailDetail, ThreadData } from "@/types";
import { EmailBodyViewer } from "@/components/dashboard/email-detail/email-body-viewer";
import { ConversationTimeline } from "@/components/dashboard/email-detail/conversation-timeline";
import { EditEmailModal } from "@/components/dashboard/edit-email-modal";
import { CustomerInfo } from "@/components/dashboard/email-detail/customer-info";
import { ProductInfo } from "@/components/dashboard/email-detail/product-info";
import { EmailActions } from "@/components/dashboard/email-detail/email-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoCard } from "@/components/ui/info-card";

export default function EmailDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const fetchEmail = useCallback(async () => {
    const res = await fetch(`/api/emails/${id}`);
    if (!res.ok) {
      router.push("/emails");
      return;
    }
    const data = await res.json();
    setEmail(data.email);
    setThread(data.thread);
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching pattern
    void fetchEmail();
  }, [fetchEmail]);

  async function handleArchive() {
    await fetch(`/api/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    router.push("/emails");
  }

  async function handleToggleProcessed() {
    if (!email) return;
    await fetch(`/api/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processed: !email.processed }),
    });
    fetchEmail();
  }

  if (loading) {
    return <div className="text-center py-20 text-gray-400">Загрузка...</div>;
  }

  if (!email) return null;

  return (
    <div>
      <Link
        href="/emails"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        ← Назад к заявкам
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4">
          {/* Email Header */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge variant={email.category === "lead" ? "lead" : "other"}>
                {email.category === "lead" ? "Заявка" : "Прочее"}
              </StatusBadge>
              {email.processed && <StatusBadge variant="processed">Обработана</StatusBadge>}
              {email.archived && <StatusBadge variant="archived">В архиве</StatusBadge>}
            </div>
            <h1 className="text-lg font-semibold text-gray-900">{email.subject}</h1>
            <div className="flex gap-4 mt-2 text-sm text-gray-500">
              <span>От: {email.from}</span>
              <span>
                {new Date(email.receivedAt).toLocaleString("ru-RU", {
                  day: "numeric", month: "long", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          <EmailBodyViewer html={email.body} />
          <ConversationTimeline thread={thread} />
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          <CustomerInfo
            customerName={email.customerName}
            customerEmail={email.customerEmail}
            customerPhone={email.customerPhone}
            onEdit={() => setEditing(true)}
          />

          <ProductInfo
            productName={email.productName}
            productUrl={email.productUrl}
          />

          {email.landings.length > 0 && (
            <InfoCard title={`Лендинги (${email.landings.length})`}>
              <div className="space-y-2">
                {email.landings.map((l) => (
                  <Link
                    key={l.id}
                    href={`/analytics/${l.slug}`}
                    className="block text-sm text-brand hover:underline"
                  >
                    /{l.slug} — {l.views} просм., {l.clicks} клик.
                  </Link>
                ))}
              </div>
            </InfoCard>
          )}

          <EmailActions
            processed={email.processed}
            archived={email.archived}
            onToggleProcessed={handleToggleProcessed}
            onArchive={handleArchive}
          />
        </div>
      </div>

      {editing && email && (
        <EditEmailModal
          email={email}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); fetchEmail(); }}
        />
      )}
    </div>
  );
}
