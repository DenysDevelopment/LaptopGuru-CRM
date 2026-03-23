import type { TimelineItem } from "@/types";
import { formatDate, stripHtml } from "@/lib/utils/timeline";

const borderColors = {
  incoming: "border-l-blue-400",
  sent: "border-l-green-400",
  landing: "border-l-orange-400",
  reply: "border-l-purple-400",
};

const labelConfig = {
  incoming: { text: "Входящее", style: "bg-blue-50 text-blue-600" },
  sent: { text: "Отправлено", style: "bg-green-50 text-green-600" },
  landing: { text: "Лендинг", style: "bg-orange-50 text-orange-600" },
  reply: { text: "Ответ", style: "bg-purple-50 text-purple-600" },
};

export function TimelineItemCard({ item }: { item: TimelineItem }) {
  const border = borderColors[item.type];
  const label = labelConfig[item.type];

  return (
    <div className={`p-4 border-l-4 ${border}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs px-2 py-0.5 rounded-full ${label.style}`}>
          {label.text}
        </span>
        <span className="text-xs text-gray-400">{formatDate(item.date)}</span>
      </div>

      {item.type === "incoming" && (
        <>
          <p className="text-sm font-medium text-gray-900">{item.data.subject}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            от {item.data.customerName || item.data.from}
          </p>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            {stripHtml(item.data.body).slice(0, 200)}
          </p>
        </>
      )}

      {item.type === "sent" && (
        <>
          <p className="text-sm font-medium text-gray-900">
            Видео: {item.data.videoTitle}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">→ {item.data.to}</p>
          <span
            className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
              item.data.status === "sent"
                ? "bg-green-50 text-green-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {item.data.status === "sent" ? "Доставлено" : "Ошибка"}
          </span>
        </>
      )}

      {item.type === "landing" && (
        <>
          <p className="text-sm font-medium text-gray-900">{item.data.title}</p>
          <div className="flex gap-3 mt-1 text-xs text-gray-400">
            <span>/{item.data.slug}</span>
            <span>{item.data.views} просм.</span>
            <span>{item.data.clicks} клик.</span>
          </div>
        </>
      )}

      {item.type === "reply" && (
        <>
          <p className="text-sm font-medium text-gray-900">{item.data.subject}</p>
          <p className="text-xs text-gray-400 mt-0.5">→ {item.data.to}</p>
        </>
      )}
    </div>
  );
}
