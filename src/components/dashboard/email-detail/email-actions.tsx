"use client";

import { InfoCard } from "@/components/ui/info-card";

interface EmailActionsProps {
  processed: boolean;
  archived: boolean;
  onToggleProcessed: () => void;
  onArchive: () => void;
}

export function EmailActions({ processed, archived, onToggleProcessed, onArchive }: EmailActionsProps) {
  return (
    <InfoCard title="Действия" className="space-y-2">
      <button
        onClick={onToggleProcessed}
        className="w-full text-sm text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
      >
        {processed ? "↩ Снять обработку" : "✓ Отметить обработанной"}
      </button>
      {!archived && (
        <button
          onClick={onArchive}
          className="w-full text-sm text-left px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
        >
          Архивировать
        </button>
      )}
    </InfoCard>
  );
}
