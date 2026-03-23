"use client";

import { useState } from "react";
import { ChevronDown, Copy, ExternalLink, Trash2 } from "lucide-react";
import type { QuickLink } from "@/types";
import { VisitsTable } from "./visits-table";

interface LinkCardProps {
  link: QuickLink;
  appUrl: string;
  onDelete: (id: string) => void;
}

export function LinkCard({ link, appUrl, onDelete }: LinkCardProps) {
  const [expanded, setExpanded] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(`${appUrl}/go/${link.slug}`);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {link.name && (
              <span className="text-sm font-semibold text-gray-900">{link.name}</span>
            )}
            <button
              onClick={copyLink}
              className="cursor-pointer flex items-center gap-1 text-xs text-brand hover:text-brand-hover transition-colors"
            >
              <Copy className="w-3 h-3" />
              /go/{link.slug}
            </button>
          </div>
          <a
            href={link.targetUrl}
            target="_blank"
            rel="noopener"
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 truncate"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            {link.targetUrl}
          </a>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-center">
            <p className="text-2xl font-bold text-brand">{link.clicks}</p>
            <p className="text-[10px] text-gray-400">переходов</p>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="cursor-pointer p-2 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>

          <button
            onClick={() => onDelete(link.id)}
            className="cursor-pointer p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-300 hover:text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          <VisitsTable visits={link.visits} />
        </div>
      )}
    </div>
  );
}
