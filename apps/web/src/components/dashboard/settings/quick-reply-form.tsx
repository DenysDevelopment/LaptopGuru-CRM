"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  quickReplySchema,
  type QuickReplyInput,
} from "@/lib/schemas/quick-reply";
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

export interface QuickReplyFormProps {
  initialValue?: Partial<QuickReplyInput>;
  submitLabel?: string;
  onSubmit: (data: QuickReplyInput) => Promise<void> | void;
  onCancel: () => void;
}

export function QuickReplyForm({
  initialValue,
  submitLabel = "Сохранить",
  onSubmit,
  onCancel,
}: QuickReplyFormProps) {
  const form = useForm<QuickReplyInput>({
    resolver: zodResolver(quickReplySchema),
    mode: "onTouched",
    defaultValues: {
      shortcut: initialValue?.shortcut || "",
      title: initialValue?.title || "",
      body: initialValue?.body || "",
    },
  });

  useEffect(() => {
    form.reset({
      shortcut: initialValue?.shortcut || "",
      title: initialValue?.title || "",
      body: initialValue?.body || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue?.shortcut, initialValue?.title, initialValue?.body]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="shortcut"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Сокращение (без /)</FormLabel>
              <FormControl>
                <Input
                  placeholder="привет"
                  {...field}
                  onChange={(e) =>
                    field.onChange(e.target.value.replace(/\s/g, ""))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Заголовок</FormLabel>
              <FormControl>
                <Input placeholder="Приветствие" {...field} />
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
              <FormLabel>Текст ответа</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="Здравствуйте! Чем могу помочь?"
                  {...field}
                />
              </FormControl>
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
