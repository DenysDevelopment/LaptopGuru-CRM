'use client';

import {
	Eye,
	PlayCircle,
	ShoppingBag,
	CheckCircle2,
	Clock,
} from 'lucide-react';
import Image from 'next/image';
import { STATUS_DICTIONARY } from '@/lib/messaging/status';
import type { ConversationStatus } from '@/generated/prisma/client';

export interface LandingStats {
	views: number;
	clicks: number;
	firstVisitAt: string | null;
	videoPlays: number;
	bestCompletionPercent: number | null;
}

export interface TimelineEvent {
	id: string;
	type:
		| 'STATUS_CHANGED'
		| 'LANDING_SENT'
		| 'ASSIGNED'
		| 'CONVERSATION_CREATED'
		| 'READ_BY_AGENT';
	actor: { id: string; name: string | null; email: string } | null;
	payload: Record<string, unknown>;
	createdAt: string;
	/** Optional related message body to show in expanded LANDING_SENT card. */
	relatedMessageBody?: string | null;
	/** Stats for LANDING_SENT events; null on other event types. */
	landingStats?: LandingStats | null;
}

function actorName(
	actor: TimelineEvent['actor'],
	systemFallback = 'Система',
): string {
	if (!actor) return systemFallback;
	return actor.name ?? actor.email;
}

function formatTime(iso: string): string {
	return new Date(iso).toLocaleTimeString('ru-RU', {
		hour: '2-digit',
		minute: '2-digit',
	});
}

function StatusChangedRow({ event }: { event: TimelineEvent }) {
	const from = event.payload.from as ConversationStatus | undefined;
	const to = event.payload.to as ConversationStatus | undefined;
	const fromLabel = from ? STATUS_DICTIONARY[from]?.label ?? from : '?';
	const toLabel = to ? STATUS_DICTIONARY[to]?.label ?? to : '?';
	const reason = event.payload.reason as string | undefined;

	let actionText: string;
	if (!event.actor && reason === 'inbound-message') {
		actionText = 'Покупатель снова написал — тикет переоткрыт';
	} else if (reason === 'viewed-by-admin') {
		actionText = `${actorName(event.actor)} открыл тикет`;
	} else if (reason === 'outbound-reply' || reason === 'landing-sent') {
		actionText = `${actorName(event.actor)} взял в работу`;
	} else if (to === 'RESOLVED') {
		actionText = `${actorName(event.actor)} завершил тикет`;
	} else {
		actionText = `${actorName(event.actor)}: ${fromLabel} → ${toLabel}`;
	}

	return (
		<div className='flex items-center gap-3 px-4 py-3'>
			<div className='flex-1 h-px bg-gray-100' />
			<span className='text-[11px] text-gray-400 whitespace-nowrap'>
				{actionText} · {formatTime(event.createdAt)}
			</span>
			<div className='flex-1 h-px bg-gray-100' />
		</div>
	);
}

function relativeTime(iso: string): string {
	const ms = Date.now() - new Date(iso).getTime();
	const min = Math.floor(ms / 60000);
	if (min < 1) return 'только что';
	if (min < 60) return `${min} мин назад`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr} ч назад`;
	const day = Math.floor(hr / 24);
	if (day < 30) return `${day} д назад`;
	const month = Math.floor(day / 30);
	return `${month} мес назад`;
}

function StatChip({
	icon,
	label,
	value,
	tone,
	title,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	tone: 'muted' | 'active';
	title?: string;
}) {
	const cls =
		tone === 'active'
			? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
			: 'bg-gray-50 text-gray-500 ring-gray-200';
	return (
		<span
			title={title}
			className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium ring-1 ring-inset ${cls}`}>
			<span className='inline-flex items-center'>{icon}</span>
			<span className='whitespace-nowrap'>
				<span className='font-semibold'>{value}</span>{' '}
				<span className='text-[10px] opacity-80'>{label}</span>
			</span>
		</span>
	);
}

function LandingSentCard({ event }: { event: TimelineEvent }) {
	const slug = event.payload.slug as string;
	const videoTitle = event.payload.videoTitle as string;
	const videoThumbnail = event.payload.videoThumbnail as string | undefined;
	const shortUrl = event.payload.shortUrl as string;
	const previewToken = event.payload.previewToken as string | undefined;
	const stats = event.landingStats ?? null;

	const previewHref = previewToken
		? `${shortUrl}?preview=${previewToken}`
		: `/l/${slug}`;

	return (
		<div className='px-4 py-3 flex justify-center'>
			<div className='w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden'>
				<div className='px-4 py-2 bg-gradient-to-r from-brand/10 to-orange-100 text-xs font-medium text-brand flex items-center justify-between'>
					<span className='inline-flex items-center gap-1.5'>
						<PlayCircle className='w-3.5 h-3.5' />
						{actorName(event.actor)} отправил лендинг
					</span>
					<span className='text-gray-400'>{formatTime(event.createdAt)}</span>
				</div>
				<div className='flex items-stretch gap-3 p-3'>
					{videoThumbnail ? (
						<div className='relative w-20 aspect-[9/16] flex-shrink-0 rounded-md overflow-hidden bg-gray-100'>
							<Image
								src={videoThumbnail}
								alt={videoTitle}
								fill
								className='object-cover'
								sizes='80px'
							/>
						</div>
					) : (
						<div className='w-20 aspect-[9/16] flex-shrink-0 rounded-md bg-gray-100 flex items-center justify-center text-gray-300'>
							<PlayCircle className='w-8 h-8' />
						</div>
					)}
					<div className='flex-1 min-w-0 flex flex-col gap-1.5'>
						<p className='text-sm font-medium text-gray-900 line-clamp-2' title={videoTitle}>
							{videoTitle}
						</p>
						<p className='text-xs text-gray-400 truncate' title={shortUrl}>
							{shortUrl}
						</p>
						{event.relatedMessageBody && (
							<div className='text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-md px-2.5 py-1.5 whitespace-pre-wrap break-words'>
								{event.relatedMessageBody}
							</div>
						)}
						<div className='flex items-center gap-3 text-xs mt-auto pt-1'>
							<a
								href={previewHref}
								target='_blank'
								rel='noopener noreferrer'
								className='inline-flex items-center gap-1 text-brand hover:text-brand-hover font-medium'>
								<Eye className='w-3.5 h-3.5' />
								Превью
							</a>
						</div>
					</div>
				</div>
				{stats && (
					<div className='px-3 pb-3 pt-2 border-t border-gray-100'>
						<div className='flex flex-wrap gap-1.5'>
							<StatChip
								icon={<Eye className='w-3 h-3' />}
								label='просмотры'
								value={String(stats.views)}
								tone={stats.views > 0 ? 'active' : 'muted'}
								title='Уникальные открытия страницы лендинга'
							/>
							<StatChip
								icon={<PlayCircle className='w-3 h-3' />}
								label={
									stats.bestCompletionPercent != null
										? `запуски · до ${Math.round(stats.bestCompletionPercent)}%`
										: 'запуски'
								}
								value={String(stats.videoPlays)}
								tone={stats.videoPlays > 0 ? 'active' : 'muted'}
								title='Сколько раз клиент запускал видео и максимальный процент досмотра'
							/>
							<StatChip
								icon={<ShoppingBag className='w-3 h-3' />}
								label='купить'
								value={String(stats.clicks)}
								tone={stats.clicks > 0 ? 'active' : 'muted'}
								title='Клики по кнопке «Купить» на лендинге'
							/>
							{stats.firstVisitAt ? (
								<StatChip
									icon={<CheckCircle2 className='w-3 h-3' />}
									label={relativeTime(stats.firstVisitAt)}
									value='открыто'
									tone='active'
									title={`Первое открытие: ${new Date(stats.firstVisitAt).toLocaleString('ru-RU')}`}
								/>
							) : (
								<StatChip
									icon={<Clock className='w-3 h-3' />}
									label='не открывалось'
									value=''
									tone='muted'
									title='Клиент пока не открывал лендинг'
								/>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function ReadByAgentRow({ event }: { event: TimelineEvent }) {
	const count = (event.payload.messageCount as number | undefined) ?? 0;
	const text = `${actorName(event.actor)} прочитал${
		count > 1 ? ` ${count} сообщений` : ''
	}`;
	return (
		<div className='flex items-center gap-3 px-4 py-2'>
			<div className='flex-1 h-px bg-gray-100' />
			<span className='text-[11px] text-gray-400 whitespace-nowrap'>
				{text} · {formatTime(event.createdAt)}
			</span>
			<div className='flex-1 h-px bg-gray-100' />
		</div>
	);
}

function ConversationCreatedRow({ event }: { event: TimelineEvent }) {
	const date = new Date(event.createdAt);
	const dateLabel = date.toLocaleDateString('ru-RU', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
	return (
		<div className='flex items-center gap-3 px-4 py-3'>
			<div className='flex-1 h-px bg-gray-200' />
			<span className='text-[11px] font-medium text-gray-500 whitespace-nowrap'>
				Чат создан · {dateLabel}, {formatTime(event.createdAt)}
			</span>
			<div className='flex-1 h-px bg-gray-200' />
		</div>
	);
}

function AssignedRow({ event }: { event: TimelineEvent }) {
	const assigneeName = event.payload.assigneeName as string | undefined;
	const text = assigneeName
		? `${actorName(event.actor)} назначил ${assigneeName}`
		: `${actorName(event.actor)} переназначил тикет`;
	return (
		<div className='flex items-center gap-3 px-4 py-3'>
			<div className='flex-1 h-px bg-gray-100' />
			<span className='text-[11px] text-gray-400 whitespace-nowrap'>
				{text} · {formatTime(event.createdAt)}
			</span>
			<div className='flex-1 h-px bg-gray-100' />
		</div>
	);
}

export function ConversationTimelineEvent({
	event,
}: {
	event: TimelineEvent;
}) {
	switch (event.type) {
		case 'STATUS_CHANGED':
			return <StatusChangedRow event={event} />;
		case 'LANDING_SENT':
			return <LandingSentCard event={event} />;
		case 'ASSIGNED':
			return <AssignedRow event={event} />;
		case 'READ_BY_AGENT':
			return <ReadByAgentRow event={event} />;
		case 'CONVERSATION_CREATED':
			return <ConversationCreatedRow event={event} />;
		default:
			return null;
	}
}
