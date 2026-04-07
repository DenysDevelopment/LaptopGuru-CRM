import type { EmailLanguage } from "@/lib/email-template";

export const VALID_LANGUAGES: EmailLanguage[] = ["pl", "uk", "ru", "en", "lt", "et", "lv"];

export const SUBJECT_BY_LANG: Record<EmailLanguage, (title: string) => string> = {
  pl: (title) => `Recenzja wideo dla Ciebie — ${title}`,
  uk: (title) => `Відеоогляд для вас — ${title}`,
  ru: (title) => `Видеообзор для вас — ${title}`,
  en: (title) => `Video review for you — ${title}`,
  lt: (title) => `Vaizdo apžvalga jums — ${title}`,
  et: (title) => `Videoülevaade teile — ${title}`,
  lv: (title) => `Video apskats jums — ${title}`,
};

export const TITLE_BY_LANG: Record<EmailLanguage, (title: string) => string> = {
  pl: (title) => `Recenzja wideo: ${title}`,
  uk: (title) => `Відеоогляд: ${title}`,
  ru: (title) => `Видеообзор: ${title}`,
  en: (title) => `Video review: ${title}`,
  lt: (title) => `Vaizdo apžvalga: ${title}`,
  et: (title) => `Videoülevaade: ${title}`,
  lv: (title) => `Video apskats: ${title}`,
};

export const FALLBACK_NAME: Record<EmailLanguage, string> = {
  pl: "Kliencie",
  uk: "Клієнте",
  ru: "Клиент",
  en: "Customer",
  lt: "Kliente",
  et: "Klient",
  lv: "Klient",
};
