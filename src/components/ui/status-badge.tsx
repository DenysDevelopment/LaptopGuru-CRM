interface StatusBadgeProps {
  variant: "lead" | "other" | "processed" | "archived" | "sent" | "error";
  children: React.ReactNode;
}

const variantStyles: Record<StatusBadgeProps["variant"], string> = {
  lead: "bg-green-50 text-green-600",
  other: "bg-gray-100 text-gray-500",
  processed: "bg-green-50 text-green-600",
  archived: "bg-gray-100 text-gray-500",
  sent: "bg-green-50 text-green-600",
  error: "bg-red-50 text-red-600",
};

export function StatusBadge({ variant, children }: StatusBadgeProps) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${variantStyles[variant]}`}>
      {children}
    </span>
  );
}
