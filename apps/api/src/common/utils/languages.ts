import type { EmailLanguage } from './email-template';

export const VALID_LANGUAGES: EmailLanguage[] = ['pl', 'uk', 'ru', 'en', 'lt', 'et', 'lv'];

export const SUBJECT_BY_LANG: Record<EmailLanguage, string> = {
  pl: 'Recenzja wideo przygotowana specjalnie dla Ciebie',
  uk: 'Відеоогляд підготовлений спеціально для вас',
  ru: 'Видеообзор подготовлен специально для вас',
  en: 'A video review prepared especially for you',
  lt: 'Vaizdo apžvalga paruošta specialiai jums',
  et: 'Videoülevaade koostatud spetsiaalselt teile',
  lv: 'Video apskats sagatavots speciāli jums',
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
  pl: 'Kliencie',
  uk: 'Клієнте',
  ru: 'Клиент',
  en: 'Customer',
  lt: 'Kliente',
  et: 'Klient',
  lv: 'Klient',
};
