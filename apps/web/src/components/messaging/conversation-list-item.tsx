'use client';

import Link from 'next/link';
import { ChannelIcon } from './channel-icon';

interface Conversation {
	id: string;
	status: string;
	priority: string;
	channelType: string;
	lastMessageAt: string | null;
	lastMessagePreview: string | null;
	unreadCount: number;
	contact: {
		id: string;
		name: string | null;
		email: string | null;
		phone: string | null;
		avatarUrl: string | null;
	} | null;
	assignee: {
		id: string;
		name: string | null;
	} | null;
}

function formatRelativeTime(dateStr: string): string {
	const now = Date.now();
	const date = new Date(dateStr).getTime();
	const diff = now - date;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) return 'только что';
	if (minutes < 60) return `${minutes}м назад`;
	if (hours < 24) return `${hours}ч назад`;
	if (days === 1) return 'вчера';
	if (days < 7) return `${days}д назад`;
	return new Date(dateStr).toLocaleDateString('ru-RU', {
		day: 'numeric',
		month: 'short',
	});
}

function getInitials(name: string | null | undefined): string {
	if (!name) return '?';
	return name
		.split(' ')
		.map((w) => w[0])
		.join('')
		.toUpperCase()
		.slice(0, 2);
}

const PRIORITY_DOT: Record<string, string> = {
	URGENT: 'bg-red-500',
	HIGH: 'bg-orange-500',
	NORMAL: '',
	LOW: '',
};

export function ConversationListItem({
	conversation,
	isActive,
}: {
	conversation: Conversation;
	isActive: boolean;
}) {
	const contact = conversation.contact;
	const contactName = contact?.name || contact?.email || contact?.phone || 'Без имени';

	return (
		<Link
			href={`/messaging/conversations/${conversation.id}`}
			className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 transition-colors ${
				isActive
					? 'bg-brand-light'
					: 'hover:bg-gray-50'
			}`}>
			{/* Avatar */}
			<div className='relative flex-shrink-0'>
				{contact?.avatarUrl ? (
					<img
						src={contact.avatarUrl}
						alt={contactName}
						className='w-10 h-10 rounded-full object-cover'
					/>
				) : (
					<div className='w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600'>
						{getInitials(contactName)}
					</div>
				)}
				{/* Channel icon badge */}
				<div className='absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center'>
					<ChannelIcon channel={conversation.channelType} size={10} />
				</div>
			</div>

			{/* Content */}
			<div className='flex-1 min-w-0'>
				<div className='flex items-center justify-between gap-2'>
					<div className='flex items-center gap-1.5 min-w-0'>
						{conversation.unreadCount > 0 && (
							<span className='w-2 h-2 rounded-full bg-brand flex-shrink-0' />
						)}
						{PRIORITY_DOT[conversation.priority] && (
							<span
								className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[conversation.priority]}`}
							/>
						)}
						<span
							className={`text-sm truncate ${
								conversation.unreadCount > 0
									? 'font-semibold text-gray-900'
									: 'font-medium text-gray-700'
							}`}>
							{contactName}
						</span>
					</div>
					<span className='text-xs text-gray-400 flex-shrink-0'>
						{conversation.lastMessageAt
							? formatRelativeTime(conversation.lastMessageAt)
							: ''}
					</span>
				</div>
				{contact?.email && (
					<p className='text-[10px] text-gray-400 truncate'>
						{contact.email}
					</p>
				)}
				<p className='text-xs text-gray-500 truncate mt-0.5'>
					{conversation.lastMessagePreview || 'Нет сообщений'}
				</p>
				{/* Status badge — primary 4-status workflow */}
				{(() => {
					const labels: Record<string, { text: string; cls: string }> = {
						NEW: { text: 'Новый', cls: 'text-blue-700 bg-blue-50' },
						OPEN: { text: 'Открыт', cls: 'text-amber-700 bg-amber-50' },
						WAITING_REPLY: { text: 'В работе', cls: 'text-purple-700 bg-purple-50' },
						RESOLVED: { text: 'Завершён', cls: 'text-gray-500 bg-gray-100' },
						CLOSED: { text: 'Закрыт', cls: 'text-gray-500 bg-gray-100' },
						SPAM: { text: 'Спам', cls: 'text-red-700 bg-red-50' },
					};
					const badge = labels[conversation.status];
					if (!badge) return null;
					return (
						<span
							className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
							{badge.text}
						</span>
					);
				})()}
			</div>

			{/* Unread badge */}
			{conversation.unreadCount > 0 && (
				<span className='flex-shrink-0 mt-1 min-w-[20px] h-5 flex items-center justify-center bg-brand text-white text-xs font-medium rounded-full px-1.5'>
					{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
				</span>
			)}
		</Link>
	);
}

export type { Conversation };
