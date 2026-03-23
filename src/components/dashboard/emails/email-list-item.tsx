import Link from "next/link";
import type { IncomingEmail } from "@/types";
import { StatusBadge } from "@/components/ui/status-badge";

interface EmailListItemProps {
  email: IncomingEmail;
  onEdit: (e: React.MouseEvent, email: IncomingEmail) => void;
  onArchive: (e: React.MouseEvent, id: string) => void;
}

export function EmailListItem({ email, onEdit, onArchive }: EmailListItemProps) {
  return (
    <Link
      href={`/emails/${email.id}`}
      className="block bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors"
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
            <StatusBadge variant={email.category === "lead" ? "lead" : "other"}>
              {email.category === "lead" ? "Заявка" : "Прочее"}
            </StatusBadge>
            {email.processed && (
              <StatusBadge variant="processed">Обработана</StatusBadge>
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
            onClick={(e) => onEdit(e, email)}
            className="text-sm text-gray-500 hover:text-brand transition-colors px-2 py-1"
          >
            Редактировать
          </button>
          {!email.archived && (
            <button
              onClick={(e) => onArchive(e, email.id)}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors px-2 py-1"
            >
              Архив
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}
