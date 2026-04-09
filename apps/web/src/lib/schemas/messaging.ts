import { z } from "zod";
import { SEND_LANGUAGES } from "./send";

// Ввод сообщения в чате
export const sendMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Введите сообщение")
    .max(4000, "Максимум 4000 символов"),
  attachmentUrl: z.string().url().optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// Отправка видео-обзора из чата
export const sendVideoFromChatSchema = z.object({
  videoId: z.string().min(1, "Выберите видео"),
  language: z.enum(SEND_LANGUAGES),
  personalNote: z
    .string()
    .max(500, "Максимум 500 символов")
    .optional()
    .or(z.literal("")),
});
export type SendVideoFromChatInput = z.infer<typeof sendVideoFromChatSchema>;
