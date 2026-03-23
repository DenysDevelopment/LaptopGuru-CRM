"use client";

import type { ThreadData } from "@/types";
import { buildTimeline } from "@/lib/utils/timeline";
import { TimelineItemCard } from "./timeline-item";

export function ConversationTimeline({ thread }: { thread: ThreadData | null }) {
  if (!thread || (thread.emails.length === 0 && thread.landings.length === 0)) {
    return null;
  }

  const items = buildTimeline(thread);
  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-medium text-gray-500">
          Лента переписки ({items.length})
        </h3>
      </div>
      <div className="divide-y divide-gray-50">
        {items.map((item, i) => (
          <TimelineItemCard key={`${item.type}-${i}`} item={item} />
        ))}
      </div>
      {/* TODO: future — add reply button here */}
    </div>
  );
}
