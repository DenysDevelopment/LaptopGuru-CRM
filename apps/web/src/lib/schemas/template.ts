import { z } from "zod";
import { CHANNEL_TYPES } from "./channel";

export const templateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Введите название")
    .max(100, "Максимум 100 символов"),
  body: z
    .string()
    .trim()
    .min(1, "Введите текст шаблона")
    .max(5000, "Максимум 5000 символов"),
  channelType: z
    .enum(CHANNEL_TYPES)
    .nullable()
    .optional(),
});

export type TemplateInput = z.infer<typeof templateSchema>;
