interface InfoRowProps {
  label: string;
  value: string | null;
}

export function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div>
      <span className="text-xs text-gray-400">{label}</span>
      <p className="text-sm text-gray-900">{value || "—"}</p>
    </div>
  );
}
