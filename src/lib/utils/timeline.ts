import type { ThreadData, TimelineItem } from "@/types";

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function buildTimeline(thread: ThreadData): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const email of thread.emails) {
    items.push({ type: "incoming", date: email.receivedAt, data: email });
  }

  for (const landing of thread.landings) {
    items.push({ type: "landing", date: landing.createdAt, data: landing });
    for (const sent of landing.sentEmails) {
      items.push({
        type: "sent",
        date: sent.sentAt,
        data: { ...sent, videoTitle: landing.video?.title || landing.title },
      });
    }
  }

  return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
