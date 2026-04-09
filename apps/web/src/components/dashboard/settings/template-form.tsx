"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { templateSchema, type TemplateInput } from "@/lib/schemas/template";
import { CHANNEL_TYPES } from "@/lib/schemas/channel";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface TemplateFormProps {
  initialValue?: Partial<TemplateInput>;
  submitLabel?: string;
  onSubmit: (data: TemplateInput) => Promise<void> | void;
  onCancel: () => void;
}

const NULL_CHANNEL = "__NULL__";

export function TemplateForm({
  initialValue,
  submitLabel = "Сохранить",
  onSubmit,
  onCancel,
}: TemplateFormProps) {
  const form = useForm<TemplateInput>({
    resolver: zodResolver(templateSchema),
    mode: "onTouched",
    defaultValues: {
      name: initialValue?.name || "",
      body: initialValue?.body || "",
      channelType: initialValue?.channelType ?? null,
    },
  });

  useEffect(() => {
    form.reset({
      name: initialValue?.name || "",
      body: initialValue?.body || "",
      channelType: initialValue?.channelType ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue?.name, initialValue?.body, initialValue?.channelType]);

  const body = form.watch("body");
  const variables = [
    ...new Set((body.match(/\{\{(\w+)\}\}/g) || []).map((m) => m.replace(/[{}]/g, ""))),
  ];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Название шаблона</FormLabel>
              <FormControl>
                <Input placeholder="Приветственное сообщение" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Текст шаблона{" "}
                <span className="text-xs text-gray-400">
                  (используйте {"{{name}}"} для переменных)
                </span>
              </FormLabel>
              <FormControl>
                <Textarea
                  rows={6}
                  placeholder="Здравствуйте, {{name}}!"
                  {...field}
                />
              </FormControl>
              {variables.length > 0 && (
                <p className="text-xs text-gray-500">
                  Переменные: {variables.map((v) => `{{${v}}}`).join(", ")}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="channelType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Тип канала (опционально)</FormLabel>
              <Select
                value={field.value ?? NULL_CHANNEL}
                onValueChange={(v) =>
                  field.onChange(v === NULL_CHANNEL ? null : v)
                }
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NULL_CHANNEL}>Любой</SelectItem>
                  {CHANNEL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="flex-1"
          >
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="flex-1 bg-brand hover:bg-brand-hover text-white"
          >
            {form.formState.isSubmitting ? "Сохранение..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
