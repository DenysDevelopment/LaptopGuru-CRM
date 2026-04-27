'use client';

import { ChevronDown, ChevronUp, Eye, PlayCircle } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { STATUS_DICTIONARY } from '@/lib/messaging/status';
import type { ConversationStatus } from '@/generated/prisma/client';

export interface TimelineEvent {
	id: string;
	type: 'STATUS_CHANGED' | 'LANDING_SENT' | 'ASSIGNED';
	actor: { id: string; name: string | null; email: string } | null;
	payload: Record<string, unknown>;
	createdAt: string;
	/** Optional related message body to show in expanded LANDING_SENT card. */
	relatedMessageBody?: string | null;
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

function LandingSentCard({ event }: { event: TimelineEvent }) {
	const [expanded, setExpanded] = useState(false);
	const slug = event.payload.slug as string;
	const videoTitle = event.payload.videoTitle as string;
	const videoThumbnail = event.payload.videoThumbnail as string | undefined;
	const shortUrl = event.payload.shortUrl as string;
	const previewToken = event.payload.previewToken as string | undefined;

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
					<div className='flex-1 min-w-0 flex flex-col justify-between'>
						<div>
							<p className='text-sm font-medium text-gray-900 line-clamp-2' title={videoTitle}>
								{videoTitle}
							</p>
							<p className='text-xs text-gray-400 mt-1 truncate' title={shortUrl}>
								{shortUrl}
							</p>
						</div>
						<div className='flex items-center gap-3 mt-2 text-xs'>
							<a
								href={previewHref}
								target='_blank'
								rel='noopener noreferrer'
								className='inline-flex items-center gap-1 text-brand hover:text-brand-hover font-medium'>
								<Eye className='w-3.5 h-3.5' />
								Превью
							</a>
							{event.relatedMessageBody && (
								<button
									type='button'
									onClick={() => setExpanded((e) => !e)}
									className='inline-flex items-center gap-1 text-gray-500 hover:text-gray-900'>
									{expanded ? (
										<>
											<ChevronUp className='w-3.5 h-3.5' />
											Скрыть текст
										</>
									) : (
										<>
											<ChevronDown className='w-3.5 h-3.5' />
											Показать текст
										</>
									)}
								</button>
							)}
						</div>
					</div>
				</div>
				{expanded && event.relatedMessageBody && (
					<div className='px-3 pb-3 -mt-1'>
						<div className='text-[11px] text-gray-400 mb-1'>
							Текст, отправленный клиенту:
						</div>
						<div className='text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-md px-3 py-2 whitespace-pre-wrap'>
							{event.relatedMessageBody}
						</div>
					</div>
				)}
			</div>
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
		default:
			return null;
	}
}
