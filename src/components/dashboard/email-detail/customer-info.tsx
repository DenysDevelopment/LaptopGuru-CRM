"use client";

import { InfoCard } from "@/components/ui/info-card";
import { InfoRow } from "@/components/ui/info-row";

interface CustomerInfoProps {
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  onEdit: () => void;
}

export function CustomerInfo({ customerName, customerEmail, customerPhone, onEdit }: CustomerInfoProps) {
  return (
    <InfoCard
      title="Клиент"
      action={
        <button onClick={onEdit} className="text-xs text-brand hover:text-brand/80">
          Изменить
        </button>
      }
    >
      <div className="space-y-2">
        <InfoRow label="Имя" value={customerName} />
        <InfoRow label="Email" value={customerEmail} />
        <InfoRow label="Телефон" value={customerPhone} />
      </div>
    </InfoCard>
  );
}
