import type { EmailLanguage } from "@/lib/email-template";

export const VALID_LANGUAGES: EmailLanguage[] = ["pl", "uk", "ru", "en", "lt", "et", "lv"];

export const SUBJECT_BY_LANG: Record<EmailLanguage, (name?: string, product?: string) => string> = {
  pl: (name, product) => [name, product ? `recenzja wideo: ${product}` : "recenzja wideo dla Ciebie"].filter(Boolean).join(" — "),
  uk: (name, product) => [name, product ? `відеоогляд: ${product}` : "відеоогляд для вас"].filter(Boolean).join(" — "),
  ru: (name, product) => [name, product ? `видеообзор: ${product}` : "видеообзор для вас"].filter(Boolean).join(" — "),
  en: (name, product) => [name, product ? `video review: ${product}` : "video review for you"].filter(Boolean).join(" — "),
  lt: (name, product) => [name, product ? `vaizdo apžvalga: ${product}` : "vaizdo apžvalga jums"].filter(Boolean).join(" — "),
  et: (name, product) => [name, product ? `videoülevaade: ${product}` : "videoülevaade teile"].filter(Boolean).join(" — "),
  lv: (name, product) => [name, product ? `video apskats: ${product}` : "video apskats jums"].filter(Boolean).join(" — "),
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

export const BUY_BUTTON_BY_LANG: Record<EmailLanguage, string> = {
  pl: "Sprawdź ofertę",
  uk: "Переглянути пропозицію",
  ru: "Смотреть предложение",
  en: "View offer",
  lt: "Peržiūrėti pasiūlymą",
  et: "Vaata pakkumist",
  lv: "Skatīt piedāvājumu",
};
