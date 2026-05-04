'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChannelIcon, getChannelLabel } from '@/components/messaging/channel-icon';
import { ContactAvatar } from '@/components/messaging/contact-avatar';
import { decodeEntities } from '@/lib/decode-entities';

interface MessagingStats {
	openCount: number;
	newTodayCount: number;
	resolvedTodayCount: number;
	urgentCount: number;
	assignedToMeCount: number;
}

interface ChannelRow {
	id: string;
	name: string;
	type: string;
	openCount: number;
}

interface RecentConversation {
	id: string;
	status: string;
	subject: string | null;
	lastMessageAt: string | null;
	lastMessagePreview: string | null;
	channel: { id: string; name: string; type: string };
	contact: { id: string; name: string | null; avatarUrl: string | null } | null;
}

interface RecentLanding {
	id: string;
	slug: string;
	title: string;
	language: string;
	createdAt: string;
	clicks: number;
	views: number;
	thumbnail: string;
	videoTitle: string;
}

interface Overview {
	messaging: MessagingStats;
	channels: ChannelRow[];
	recentConversations: RecentConversation[];
	landings: {
		recent: RecentLanding[];
		weekTotals: { count: number; clicks: number; visits: number };
	};
}

const STATUS_COLORS: Record<string, string> = {
	NEW: 'bg-blue-100 text-blue-700',
	OPEN: 'bg-amber-100 text-amber-700',
	WAITING_REPLY: 'bg-purple-100 text-purple-700',
	RESOLVED: 'bg-gray-100 text-gray-500',
	CLOSED: 'bg-gray-100 text-gray-500',
	SPAM: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
	NEW: 'Новый',
	OPEN: 'Открыт',
	WAITING_REPLY: 'В работе',
	RESOLVED: 'Завершён',
	CLOSED: 'Закрыт',
	SPAM: 'Спам',
};

function relTime(iso: string | null): string {
	if (!iso) return '';
	const ms = Date.now() - new Date(iso).getTime();
	const min = Math.floor(ms / 60000);
	if (min < 1) return 'только что';
	if (min < 60) return `${min} мин`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr} ч`;
	const day = Math.floor(hr / 24);
	if (day < 30) return `${day} д`;
	return `${Math.floor(day / 30)} мес`;
}

export default function DashboardPage() {
	const [data, setData] = useState<Overview | null>(null);
	const [forbidden, setForbidden] = useState(false);

	useEffect(() => {
		fetch('/api/dashboard/overview')
			.then((r) => {
				if (r.status === 403) {
					setForbidden(true);
					return null;
				}
				return r.json();
			})
			.then((d) => {
				if (d) setData(d);
			});
	}, []);

	if (forbidden) {
		return (
			<div>
				<h1 className='text-2xl font-bold text-gray-900 mb-6'>Главная</h1>
				<div className='text-center py-16 bg-white rounded-xl border border-gray-100'>
					<p className='text-gray-400'>Нет доступа к статистике.</p>
				</div>
			</div>
		);
	}

	if (!data) {
		return <div className='text-center py-12 text-gray-400'>Загрузка...</div>;
	}

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div>
				<h1 className='text-2xl font-bold text-gray-900'>Главная</h1>
			</div>

			{/* Quick actions */}
			<div className='flex flex-wrap gap-2'>
				<Link
					href='/send'
					className='inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors shadow-sm'>
					<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z' />
					</svg>
					Отправить видео
				</Link>
				<Link
					href='/messaging'
					className='inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg border border-gray-200 text-sm transition-colors'>
					Все диалоги
				</Link>
			</div>

			{/* Two-column: recent chats + channel breakdown */}
			<div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
				{/* Recent chats */}
				<div className='lg:col-span-2 bg-white rounded-xl border border-gray-100'>
					<div className='px-4 py-3 border-b border-gray-100 flex items-center justify-between'>
						<h2 className='text-sm font-semibold text-gray-900'>Свежие диалоги</h2>
						<Link href='/messaging' className='text-xs text-brand hover:text-brand-hover'>
							Все →
						</Link>
					</div>
					{data.recentConversations.length === 0 ? (
						<p className='text-sm text-gray-400 px-4 py-8 text-center'>
							Диалогов пока нет
						</p>
					) : (
						<ul className='divide-y divide-gray-100'>
							{data.recentConversations.map((c) => {
								const targetPath = c.channel.type === 'ALLEGRO' ? '/allegro' : '/messaging';
								return (
									<li key={c.id}>
										<Link
											href={`${targetPath}/conversations/${c.id}`}
											className='flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors'>
											<ContactAvatar
												name={c.contact?.name || 'Без имени'}
												seed={c.contact?.id || c.id}
												avatarUrl={c.contact?.avatarUrl}
												size={36}
											/>
											<div className='flex-1 min-w-0'>
												<div className='flex items-center gap-2 min-w-0'>
													<p className='text-sm font-semibold text-gray-900 truncate'>
														{c.contact?.name || 'Без имени'}
													</p>
													<ChannelIcon channel={c.channel.type} size={12} />
													<span className='text-[10px] text-gray-400'>
														{getChannelLabel(c.channel.type)}
													</span>
												</div>
												<p className='text-xs text-gray-500 truncate mt-0.5'>
													{c.lastMessagePreview
														? decodeEntities(c.lastMessagePreview)
														: c.subject || 'Нет сообщений'}
												</p>
											</div>
											<div className='flex flex-col items-end gap-1 flex-shrink-0'>
												<span
													className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
														STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-500'
													}`}>
													{STATUS_LABELS[c.status] ?? c.status}
												</span>
												<span className='text-[10px] text-gray-400'>
													{relTime(c.lastMessageAt)}
												</span>
											</div>
										</Link>
									</li>
								);
							})}
						</ul>
					)}
				</div>

				{/* Channel breakdown */}
				<div className='bg-white rounded-xl border border-gray-100'>
					<div className='px-4 py-3 border-b border-gray-100'>
						<h2 className='text-sm font-semibold text-gray-900'>По каналам</h2>
					</div>
					{data.channels.length === 0 ? (
						<p className='text-sm text-gray-400 px-4 py-8 text-center'>
							Каналы не подключены
						</p>
					) : (
						<ul className='divide-y divide-gray-100'>
							{data.channels.map((ch) => (
								<li key={ch.id}>
									<Link
										href={`/messaging?channel=${ch.id}`}
										className='flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors'>
										<ChannelIcon channel={ch.type} size={18} />
										<div className='flex-1 min-w-0'>
											<p className='text-sm font-medium text-gray-900 truncate'>
												{ch.name}
											</p>
											<p className='text-[10px] text-gray-400 uppercase tracking-wide'>
												{getChannelLabel(ch.type)}
											</p>
										</div>
										<span
											className={`text-xs font-semibold ${
												ch.openCount > 0 ? 'text-brand' : 'text-gray-300'
											}`}>
											{ch.openCount}
										</span>
									</Link>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

		</div>
	);
}

