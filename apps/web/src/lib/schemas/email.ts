import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .max(500, "Слишком длинное значение")
  .optional()
  .or(z.literal(""));

export const editEmailSchema = z.object({
  customerName: optionalString,
  customerEmail: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Некорректный email",
    ),
  customerPhone: optionalString,
  productName: optionalString,
  productUrl: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^https?:\/\//i.test(v),
      "Ссылка должна начинаться с http:// или https://",
    ),
});

export type EditEmailInput = z.infer<typeof editEmailSchema>;

// Broader schema for server-side PATCH including status flags
export const patchEmailSchema = editEmailSchema
  .extend({
    archived: z.boolean().optional(),
    processed: z.boolean().optional(),
    category: z.string().optional(),
  })
  .partial();

export type PatchEmailInput = z.infer<typeof patchEmailSchema>;
