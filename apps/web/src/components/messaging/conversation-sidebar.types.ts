export interface ConversationDetail {
	id: string;
	status: string;
	priority: string;
	channelType: string;
	subject: string | null;
	createdAt: string;
	closedAt: string | null;
	contact: {
		id: string;
		name: string | null;
		email: string | null;
		phone: string | null;
		avatarUrl: string | null;
		company: string | null;
		channels: { type: string; externalId: string }[];
	} | null;
	assignee: {
		id: string;
		name: string | null;
		email: string | null;
	} | null;
	tags: { id: string; name: string; color: string }[];
}

export interface Note {
	id: string;
	body: string;
	createdAt: string;
	author: { id: string; name: string | null } | null;
}

export interface Tag {
	id: string;
	name: string;
	color: string;
}

export interface Team {
	id: string;
	name: string;
	members: { id: string; name: string | null; email: string }[];
}

export const STATUS_OPTIONS = [
	{ value: 'NEW', label: 'Новый', color: 'bg-blue-100 text-blue-700' },
	{ value: 'OPEN', label: 'Открыт', color: 'bg-green-100 text-green-700' },
	{ value: 'WAITING', label: 'Ожидание', color: 'bg-amber-100 text-amber-700' },
	{ value: 'CLOSED', label: 'Закрыт', color: 'bg-gray-100 text-gray-600' },
];

export const PRIORITY_OPTIONS = [
	{ value: 'LOW', label: 'Низкий' },
	{ value: 'NORMAL', label: 'Обычный' },
	{ value: 'HIGH', label: 'Высокий' },
	{ value: 'URGENT', label: 'Срочный' },
];
