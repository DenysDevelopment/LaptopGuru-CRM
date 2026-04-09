"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  createQuickLinkSchema,
  type CreateQuickLinkInput,
} from "@/lib/schemas/quicklink";
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

interface CreateFormProps {
  onCreated: () => void;
}

export function CreateQuickLinkForm({ onCreated }: CreateFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [apiError, setApiError] = useState("");

  const form = useForm<CreateQuickLinkInput>({
    resolver: zodResolver(createQuickLinkSchema),
    mode: "onTouched",
    defaultValues: { slug: "", targetUrl: "", name: "" },
  });

  async function onSubmit(data: CreateQuickLinkInput) {
    setApiError("");
    const res = await fetch("/api/quicklinks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: data.slug,
        targetUrl: data.targetUrl,
        name: data.name || undefined,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setApiError(payload.error || "Ошибка создания");
    } else {
      form.reset();
      setShowForm(false);
      onCreated();
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setShowForm(!showForm)}
        className="bg-brand hover:bg-brand-hover text-white"
      >
        <Plus className="w-4 h-4" /> Новая ссылка
      </Button>

      {showForm && (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="bg-white rounded-xl border border-gray-100 p-5 mb-6 space-y-3"
          >
            {apiError && (
              <p className="text-red-500 text-sm">{apiError}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-gray-500">
                      Slug (латиница)
                    </FormLabel>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">/go/</span>
                      <FormControl>
                        <Input
                          placeholder="allegro"
                          {...field}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, ""),
                            )
                          }
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="targetUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-gray-500">
                      URL назначения
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://allegro.pl/..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-gray-500">
                      Название (опционально)
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Allegro MacBook" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="bg-brand hover:bg-brand-hover text-white"
            >
              {form.formState.isSubmitting ? "Создание..." : "Создать"}
            </Button>
          </form>
        </Form>
      )}
    </>
  );
}
