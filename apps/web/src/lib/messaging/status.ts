import { ConversationStatus } from '@/generated/prisma/client';

export const STATUS_DICTIONARY: Record<
	ConversationStatus,
	{ label: string; description: string; color: string; pillClass: string }
> = {
	NEW: {
		label: 'Новый',
		description: 'Только что прилетел, никто не открывал',
		color: '#2563eb', // blue-600
		pillClass: 'bg-blue-100 text-blue-700 ring-blue-200',
	},
	OPEN: {
		label: 'Открыт',
		description:
			'Админ читал, но ещё не ответил, либо клиент только что прислал ответ — мяч на нашей стороне',
		color: '#d97706', // amber-600
		pillClass: 'bg-amber-100 text-amber-700 ring-amber-200',
	},
	WAITING_REPLY: {
		label: 'В работе',
		description: 'Мы ответили, ждём реакцию клиента',
		color: '#9333ea', // purple-600
		pillClass: 'bg-purple-100 text-purple-700 ring-purple-200',
	},
	RESOLVED: {
		label: 'Завершён',
		description: 'Закрыт, действий не требуется',
		color: '#6b7280', // gray-500
		pillClass: 'bg-gray-100 text-gray-700 ring-gray-200',
	},
	CLOSED: {
		label: 'Закрыт',
		description: 'Закрыт окончательно (не основной workflow)',
		color: '#374151',
		pillClass: 'bg-gray-200 text-gray-700 ring-gray-300',
	},
	SPAM: {
		label: 'Спам',
		description: 'Помечен как спам',
		color: '#dc2626',
		pillClass: 'bg-red-100 text-red-700 ring-red-200',
	},
};

/** Statuses that participate in the main 4-status workflow, in order. */
export const PRIMARY_STATUSES: ConversationStatus[] = [
	'NEW',
	'OPEN',
	'WAITING_REPLY',
	'RESOLVED',
];

export function statusLabel(status: ConversationStatus): string {
	return STATUS_DICTIONARY[status]?.label ?? status;
}
