import type { EmailLanguage } from '@/lib/email-template';

export const VALID_LANGUAGES: EmailLanguage[] = [
	'pl',
	'uk',
	'ru',
	'en',
	'lt',
	'et',
	'lv',
];

export const SUBJECT_BY_LANG: Record<
	EmailLanguage,
	(name?: string, product?: string) => string
> = {
	pl: (name, product) =>
		[name, product ? `recenzja wideo: ${product}` : 'recenzja wideo dla Ciebie']
			.filter(Boolean)
			.join(' — '),
	uk: (name, product) =>
		[name, product ? `відеоогляд: ${product}` : 'відеоогляд для вас']
			.filter(Boolean)
			.join(' — '),
	ru: (name, product) =>
		[name, product ? `видеообзор: ${product}` : 'видеообзор для вас']
			.filter(Boolean)
			.join(' — '),
	en: (name, product) =>
		[name, product ? `video review: ${product}` : 'video review for you']
			.filter(Boolean)
			.join(' — '),
	lt: (name, product) =>
		[name, product ? `vaizdo apžvalga: ${product}` : 'vaizdo apžvalga jums']
			.filter(Boolean)
			.join(' — '),
	et: (name, product) =>
		[name, product ? `videoülevaade: ${product}` : 'videoülevaade teile']
			.filter(Boolean)
			.join(' — '),
	lv: (name, product) =>
		[name, product ? `video apskats: ${product}` : 'video apskats jums']
			.filter(Boolean)
			.join(' — '),
};

export const TITLE_BY_LANG: Record<EmailLanguage, (title: string) => string> = {
	pl: title => `Recenzja wideo: ${title}`,
	uk: title => `Відеоогляд: ${title}`,
	ru: title => `Видеообзор: ${title}`,
	en: title => `Video review: ${title}`,
	lt: title => `Vaizdo apžvalga: ${title}`,
	et: title => `Videoülevaade: ${title}`,
	lv: title => `Video apskats: ${title}`,
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

// Default body for the chat message that goes into the conversation alongside
// the landing's short link. The agent can edit it in the modal; placeholders
// {url}, {name}, {productName} are interpolated server-side.
export const CHAT_TEMPLATE_BY_LANG: Record<EmailLanguage, string> = {
	pl: 'Dzień dobry, poniżej link do filmu z naszą recenzją laptopa:\n{url}',
	uk: 'Добрий день, нижче — посилання на відеоогляд ноутбука:\n{url}',
	ru: 'Добрый день, ниже ссылка на видеообзор ноутбука:\n{url}',
	en: 'Hello, below is the link to our video review of the laptop:\n{url}',
	lt: 'Sveiki, žemiau – nuoroda į mūsų nešiojamojo kompiuterio vaizdo apžvalgą:\n{url}',
	et: 'Tere, allpool on link meie sülearvuti videoülevaatele:\n{url}',
	lv: 'Sveiki, zemāk ir saite uz mūsu klēpjdatora video apskatu:\n{url}',
};

/**
 * Splits a chat template into the textual lead-in and the bare short URL so
 * channel adapters can deliver them as two separate messages — the customer
 * can long-tap the URL message to copy it without dragging the text.
 *
 * - Replaces {name} and {productName} inline.
 * - Strips the {url} placeholder (and trailing whitespace/blank lines) from
 *   the text; the URL is returned separately.
 * - Falls back to the bare URL when the agent's text would otherwise be empty.
 */
export function applyChatTemplate(
	template: string,
	vars: { url: string; name?: string | null; productName?: string | null },
): { text: string; url: string } {
	const filled = template
		.replace(/\{name\}/g, vars.name ?? '')
		.replace(/\{productName\}/g, vars.productName ?? '');
	const stripped = filled
		.replace(/\{url\}/g, '')
		// Collapse any blank lines left behind by the placeholder removal.
		.replace(/\n[ \t]*\n+/g, '\n')
		.trim();
	return { text: stripped, url: vars.url };
}

/** Convenience: re-joins the split into a single string for archival/EMAIL. */
export function joinChatBody(parts: { text: string; url: string }): string {
	return parts.text ? `${parts.text}\n${parts.url}` : parts.url;
}

export const BUY_BUTTON_BY_LANG: Record<EmailLanguage, string> = {
	pl: 'Przejdź do oferty na Allegro',
	uk: 'Перейти до пропозиції на Allegro',
	ru: 'Перейти к предложению на Allegro',
	en: 'Go to Allegro offer',
	lt: 'Eiti į Allegro pasiūlymą',
	et: 'Mine Allegro pakkumisele',
	lv: 'Doties uz Allegro piedāvājumu',
};
