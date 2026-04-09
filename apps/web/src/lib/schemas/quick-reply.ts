import { z } from "zod";

export const quickReplySchema = z.object({
  shortcut: z
    .string()
    .trim()
    .min(1, "Введите сокращение")
    .max(32, "Максимум 32 символа")
    .regex(/^\S+$/, "Без пробелов"),
  title: z
    .string()
    .trim()
    .min(1, "Введите заголовок")
    .max(100, "Максимум 100 символов"),
  body: z
    .string()
    .trim()
    .min(1, "Введите текст ответа")
    .max(2000, "Максимум 2000 символов"),
});

export type QuickReplyInput = z.infer<typeof quickReplySchema>;
