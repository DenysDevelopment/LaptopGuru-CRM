export interface ConversationDetail {
	id: string;
	status: string;
	priority: string;
	channelType: string;
	subject: string | null;
	createdAt: string;
	closedAt: string | null;
	lastStatusChangedAt?: string | null;
	lastStatusChangedBy?: {
		id: string;
		name: string | null;
		email: string;
	} | null;
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

import { STATUS_DICTIONARY } from '@/lib/messaging/status';
import type { ConversationStatus } from '@/generated/prisma/client';

// Sidebar dropdown — only the 4 primary workflow statuses. CLOSED and SPAM
// were removed at the user's request: SPAM is reachable via a separate
// action and CLOSED is an internal/legacy state, so neither belongs in the
// everyday status switcher.
const STATUS_ORDER: ConversationStatus[] = [
	'NEW',
	'OPEN',
	'WAITING_REPLY',
	'RESOLVED',
];

export const STATUS_OPTIONS = STATUS_ORDER.map((value) => ({
	value,
	label: STATUS_DICTIONARY[value].label,
}));

export const PRIORITY_OPTIONS = [
	{ value: 'LOW', label: 'Низкий' },
	{ value: 'NORMAL', label: 'Обычный' },
	{ value: 'HIGH', label: 'Высокий' },
	{ value: 'URGENT', label: 'Срочный' },
];
