import { z } from "zod";

export const createCompanySchema = z.object({
  name: z
    .string()
    .min(1, "Введите название компании")
    .max(100, "Максимум 100 символов"),
  slug: z
    .string()
    .min(1, "Введите slug")
    .max(50, "Максимум 50 символов")
    .regex(/^[a-z0-9-]+$/, "Только латинские буквы, цифры и дефис"),
  adminEmail: z
    .string()
    .min(1, "Введите email админа")
    .email("Некорректный email"),
  adminName: z
    .string()
    .max(100, "Максимум 100 символов")
    .optional()
    .or(z.literal("")),
  adminPassword: z
    .string()
    .min(8, "Минимум 8 символов")
    .max(100, "Максимум 100 символов"),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
