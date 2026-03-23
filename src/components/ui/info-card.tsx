interface InfoCardProps {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function InfoCard({ title, action, children, className = "" }: InfoCardProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="text-sm font-medium text-gray-500">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
