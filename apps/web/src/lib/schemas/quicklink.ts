import { z } from "zod";

export const createQuickLinkSchema = z.object({
  slug: z
    .string()
    .min(1, "Введите slug")
    .max(50, "Максимум 50 символов")
    .regex(/^[a-z0-9-]+$/, "Только латинские буквы, цифры и дефис"),
  targetUrl: z
    .string()
    .min(1, "Введите URL назначения")
    .url("Некорректный URL"),
  name: z
    .string()
    .max(100, "Максимум 100 символов")
    .optional()
    .or(z.literal("")),
});

export type CreateQuickLinkInput = z.infer<typeof createQuickLinkSchema>;
