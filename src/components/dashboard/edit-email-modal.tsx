"use client";

import { useState } from "react";
import type { IncomingEmail } from "@/types";

interface Props {
  email: Pick<IncomingEmail, "id" | "customerName" | "customerEmail" | "customerPhone" | "productUrl" | "productName">;
  onClose: () => void;
  onSaved: () => void;
}

export function EditEmailModal({ email, onClose, onSaved }: Props) {
  const [customerName, setCustomerName] = useState(email.customerName || "");
  const [customerEmail, setCustomerEmail] = useState(email.customerEmail || "");
  const [customerPhone, setCustomerPhone] = useState(email.customerPhone || "");
  const [productUrl, setProductUrl] = useState(email.productUrl || "");
  const [productName, setProductName] = useState(email.productName || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    await fetch(`/api/emails/${email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: customerName || null,
        customerEmail: customerEmail || null,
        customerPhone: customerPhone || null,
        productUrl: productUrl || null,
        productName: productName || null,
      }),
    });

    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Редактировать заявку</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Имя клиента" value={customerName} onChange={setCustomerName} />
          <Field label="Email клиента" value={customerEmail} onChange={setCustomerEmail} type="email" />
          <Field label="Телефон" value={customerPhone} onChange={setCustomerPhone} type="tel" />
          <Field label="Название товара" value={productName} onChange={setProductName} />
          <Field label="Ссылка на товар" value={productUrl} onChange={setProductUrl} type="url" />

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Отменить
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-brand hover:bg-brand-hover rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:ring-2 focus:ring-brand-muted outline-none transition-colors"
      />
    </div>
  );
}
