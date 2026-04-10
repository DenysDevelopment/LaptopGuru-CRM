'use client';

const statusConfig: Record<string, { label: string; className: string }> = {
  UPLOADING: { label: 'Загрузка...', className: 'bg-blue-100 text-blue-700' },
  PROCESSING: { label: 'Обработка...', className: 'bg-yellow-100 text-yellow-700' },
  READY: { label: 'Готово', className: 'bg-green-100 text-green-700' },
  FAILED: { label: 'Ошибка', className: 'bg-red-100 text-red-700' },
};

export function VideoStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.READY;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
