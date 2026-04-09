import { z } from "zod";

export const SEND_LANGUAGES = ["pl", "uk", "ru", "en", "lt", "et", "lv"] as const;
export type SendLanguage = (typeof SEND_LANGUAGES)[number];

const languageSchema = z.enum(SEND_LANGUAGES);

export const sendEmailSchema = z.object({
  mode: z.literal("email"),
  emailId: z.string().min(1, "Выберите заявку"),
  videoId: z.string().min(1, "Выберите видео"),
  language: languageSchema,
  personalNote: z
    .string()
    .max(500, "Максимум 500 символов")
    .optional()
    .or(z.literal("")),
});

export const sendAllegroSchema = z.object({
  mode: z.literal("allegro"),
  productUrl: z
    .string()
    .min(1, "Введите ссылку на товар Allegro")
    .url("Некорректный URL")
    .refine(
      (v) => /^https:\/\/(www\.)?allegro\.pl\//i.test(v),
      "Ссылка должна быть на allegro.pl",
    ),
  videoId: z.string().min(1, "Выберите видео"),
  language: languageSchema,
});

export const sendSchema = z.discriminatedUnion("mode", [
  sendEmailSchema,
  sendAllegroSchema,
]);

export type SendEmailInput = z.infer<typeof sendEmailSchema>;
export type SendAllegroInput = z.infer<typeof sendAllegroSchema>;
export type SendInput = z.infer<typeof sendSchema>;
