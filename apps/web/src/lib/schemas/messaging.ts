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

// Отправка лендинга с видео-обзором из чата (любой канал)
export const sendVideoFromChatSchema = z.object({
  videoId: z.string().min(1, "Выберите видео"),
  language: z.enum(SEND_LANGUAGES),
  personalNote: z
    .string()
    .max(500, "Максимум 500 символов")
    .optional()
    .or(z.literal("")),
  // Текст, который уйдёт клиенту в чат вместе со ссылкой на лендинг.
  // Поддерживает плейсхолдеры {url}, {name}, {productName}. Если поле пустое
  // или не содержит {url}, ссылка добавится автоматически в конец.
  messageBody: z
    .string()
    .max(2000, "Максимум 2000 символов")
    .optional()
    .or(z.literal("")),
  // Куда вести "Купить" на лендинге. Обязательное поле — без него
  // лендинг бесполезен (CTA-кнопка не будет вести никуда).
  productUrl: z
    .string()
    .min(1, "Укажите ссылку на товар")
    .url("Некорректный URL"),
});
export type SendVideoFromChatInput = z.infer<typeof sendVideoFromChatSchema>;
