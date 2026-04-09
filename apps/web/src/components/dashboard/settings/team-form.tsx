"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { teamSchema, type TeamInput } from "@/lib/schemas/team";
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

export interface TeamFormProps {
  initialValue?: Partial<TeamInput>;
  submitLabel?: string;
  onSubmit: (data: TeamInput) => Promise<void> | void;
  onCancel: () => void;
}

export function TeamForm({
  initialValue,
  submitLabel = "Создать",
  onSubmit,
  onCancel,
}: TeamFormProps) {
  const form = useForm<TeamInput>({
    resolver: zodResolver(teamSchema),
    mode: "onTouched",
    defaultValues: {
      name: initialValue?.name || "",
      description: initialValue?.description || "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Название команды</FormLabel>
              <FormControl>
                <Input placeholder="Поддержка" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Описание (опционально)</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="Команда операторов поддержки"
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
