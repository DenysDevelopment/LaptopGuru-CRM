"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import type { IncomingEmail } from "@/types";
import { editEmailSchema, type EditEmailInput } from "@/lib/schemas/email";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  email: Pick<
    IncomingEmail,
    "id" | "customerName" | "customerEmail" | "customerPhone" | "productUrl" | "productName"
  >;
  onClose: () => void;
  onSaved: () => void;
}

export function EditEmailModal({ email, onClose, onSaved }: Props) {
  const [apiError, setApiError] = useState("");

  const form = useForm<EditEmailInput>({
    resolver: zodResolver(editEmailSchema),
    mode: "onTouched",
    defaultValues: {
      customerName: email.customerName || "",
      customerEmail: email.customerEmail || "",
      customerPhone: email.customerPhone || "",
      productName: email.productName || "",
      productUrl: email.productUrl || "",
    },
  });

  async function onSubmit(data: EditEmailInput) {
    setApiError("");
    // Convert empty strings to null for the API
    const payload = {
      customerName: data.customerName || null,
      customerEmail: data.customerEmail || null,
      customerPhone: data.customerPhone || null,
      productName: data.productName || null,
      productUrl: data.productUrl || null,
    };
    const res = await fetch(`/api/emails/${email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setApiError(body.error || "Ошибка сохранения");
      return;
    }

    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Редактировать заявку
        </h2>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {apiError && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">
                {apiError}
              </div>
            )}

            <FormField
              control={form.control}
              name="customerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Имя клиента</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="customerEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email клиента</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="customerPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Телефон</FormLabel>
                  <FormControl>
                    <Input type="tel" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="productName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Название товара</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="productUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ссылка на товар</FormLabel>
                  <FormControl>
                    <Input type="url" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                className="flex-1"
              >
                Отменить
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="flex-1 bg-brand hover:bg-brand-hover text-white"
              >
                {form.formState.isSubmitting ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
