import { z } from "zod";

export const teamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Введите название команды")
    .max(100, "Максимум 100 символов"),
  description: z
    .string()
    .trim()
    .max(500, "Максимум 500 символов")
    .optional()
    .or(z.literal("")),
});

export type TeamInput = z.infer<typeof teamSchema>;
