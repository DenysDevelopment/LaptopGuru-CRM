import { Monitor, Smartphone } from "lucide-react";
import type { QuickLinkVisit } from "@/types";

interface VisitsTableProps {
  visits: QuickLinkVisit[];
}

export function VisitsTable({ visits }: VisitsTableProps) {
  if (visits.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">Переходов пока нет</p>;
  }

  return (
    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
      {visits.map((v) => (
        <div
          key={v.id}
          className="flex items-center gap-3 text-xs text-gray-600 py-1.5 border-b border-gray-50 last:border-0"
        >
          <span className="text-gray-400 whitespace-nowrap w-24">
            {new Date(v.visitedAt).toLocaleString("ru-RU", {
              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
            })}
          </span>
          <span className="w-28 truncate">
            {v.city && v.country ? `${v.city}, ${v.country}` : v.ip || "—"}
          </span>
          <span className="flex items-center gap-1 w-20">
            {v.deviceType === "mobile" || v.deviceType === "tablet" ? (
              <Smartphone className="w-3 h-3 text-gray-400" />
            ) : (
              <Monitor className="w-3 h-3 text-gray-400" />
            )}
            {v.browser || "—"}
          </span>
          <span className="text-gray-400 w-16">{v.os || "—"}</span>
          <span className="text-gray-300 truncate">{v.referrerDomain || "прямой"}</span>
        </div>
      ))}
    </div>
  );
}
