export interface Channel {
	id: string;
	type: string;
	name: string;
	status: string;
	enabled: boolean;
	config: Record<string, string>;
	createdAt: string;
}

export const CHANNEL_TYPES = [
	{ value: 'EMAIL', label: 'Email' },
	{ value: 'SMS', label: 'SMS' },
	{ value: 'WHATSAPP', label: 'WhatsApp' },
	{ value: 'TELEGRAM', label: 'Telegram' },
];

export const EMAIL_DEFAULTS: Record<string, string> = {
	imap_host: 'imap.hostinger.com',
	imap_port: '993',
	smtp_host: 'smtp.hostinger.com',
	smtp_port: '465',
};

export const CONFIG_FIELDS: Record<
	string,
	{ key: string; label: string; type: string }[]
> = {
	EMAIL: [
		{ key: 'smtp_display_name', label: 'Имя отправителя', type: 'text' },
		{ key: 'imap_host', label: 'IMAP Хост', type: 'text' },
		{ key: 'imap_port', label: 'IMAP Порт', type: 'text' },
		{ key: 'smtp_host', label: 'SMTP Хост', type: 'text' },
		{ key: 'smtp_port', label: 'SMTP Порт', type: 'text' },
		{ key: 'imap_user', label: 'Логин', type: 'text' },
		{ key: 'imap_password', label: 'Пароль', type: 'password' },
	],
	TELEGRAM: [
		{ key: 'bot_token', label: 'Bot Token (от @BotFather)', type: 'password' },
	],
	WHATSAPP: [
		{ key: 'apiKey', label: 'API Key', type: 'password' },
		{ key: 'phoneNumberId', label: 'Phone Number ID', type: 'text' },
		{ key: 'businessAccountId', label: 'Business Account ID', type: 'text' },
	],
	SMS: [
		{ key: 'provider', label: 'Провайдер', type: 'text' },
		{ key: 'apiKey', label: 'API Key', type: 'password' },
		{ key: 'senderId', label: 'Sender ID', type: 'text' },
	],
	FACEBOOK: [
		{ key: 'pageAccessToken', label: 'Page Access Token', type: 'password' },
		{ key: 'pageId', label: 'Page ID', type: 'text' },
	],
	INSTAGRAM: [
		{ key: 'accessToken', label: 'Access Token', type: 'password' },
		{ key: 'igUserId', label: 'IG User ID', type: 'text' },
	],
	WEBCHAT: [
		{ key: 'widgetColor', label: 'Цвет виджета', type: 'text' },
		{ key: 'welcomeMessage', label: 'Приветственное сообщение', type: 'text' },
	],
};
