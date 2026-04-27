'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageBubble } from './message-bubble';
import type { Message } from './message-bubble';
import { ConversationTimelineEvent, type TimelineEvent } from './timeline-event';
import { useMessagingEvents } from '@/hooks/use-messaging-events';

interface MessageThreadProps {
	conversationId: string;
}

interface RawMessage extends Omit<Message, 'channelType' | 'status'> {
	channelType?: string;
	status?: string;
	metadata?: Record<string, unknown> | null;
}

type TimelineItem =
	| { kind: 'message'; data: Message; createdAt: string }
	| { kind: 'event'; data: TimelineEvent; createdAt: string };

function formatDateSeparator(dateStr: string): string {
	const date = new Date(dateStr);
	const today = new Date();
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);

	if (date.toDateString() === today.toDateString()) return 'Сегодня';
	if (date.toDateString() === yesterday.toDateString()) return 'Вчера';

	return date.toLocaleDateString('ru-RU', {
		day: 'numeric',
		month: 'long',
		year:
			date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
	});
}

function groupByDate(items: TimelineItem[]): { date: string; items: TimelineItem[] }[] {
	const groups: { date: string; items: TimelineItem[] }[] = [];
	let currentDate = '';

	for (const item of items) {
		const dateKey = new Date(item.createdAt).toDateString();
		if (dateKey !== currentDate) {
			currentDate = dateKey;
			groups.push({ date: item.createdAt, items: [item] });
		} else {
			groups[groups.length - 1].items.push(item);
		}
	}
	return groups;
}

export function MessageThread({ conversationId }: MessageThreadProps) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [events, setEvents] = useState<TimelineEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const initialScrollDone = useRef(false);

	const fetchAll = useCallback(
		async (pageNum: number, prepend: boolean) => {
			if (prepend) setLoadingMore(true);
			else setLoading(true);

			try {
				const [msgRes, convRes] = await Promise.all([
					fetch(
						`/api/messaging/conversations/${conversationId}/messages?page=${pageNum}&limit=50`,
					),
					fetch(`/api/messaging/conversations/${conversationId}`),
				]);

				if (msgRes.ok) {
					const data = await msgRes.json();
					const items = (data.items || data.data || data) as RawMessage[];
					const list: Message[] = (Array.isArray(items) ? items : []).map(
						(m) => ({
							id: m.id,
							direction: m.direction,
							body: m.body ?? '',
							contentType: m.contentType,
							channelType: m.channelType ?? '',
							status: m.status ?? 'SENT',
							createdAt: m.createdAt,
							attachments: m.attachments,
							sender: m.sender,
							metadata: m.metadata ?? null,
						}),
					) as unknown as Message[];

					if (prepend) {
						setMessages((prev) => [...list.reverse(), ...prev]);
					} else {
						setMessages(list.reverse());
					}
					setHasMore(list.length >= 50);
				}

				if (!prepend && convRes.ok) {
					const conv = await convRes.json();
					setEvents(Array.isArray(conv.events) ? conv.events : []);
				}
			} catch {
				// silently fail
			} finally {
				setLoading(false);
				setLoadingMore(false);
			}
		},
		[conversationId],
	);

	useEffect(() => {
		initialScrollDone.current = false;
		setPage(1);
		setMessages([]);
		setEvents([]);
		fetchAll(1, false);
	}, [conversationId, fetchAll]);

	useEffect(() => {
		if ((messages.length > 0 || events.length > 0) && !initialScrollDone.current) {
			bottomRef.current?.scrollIntoView();
			initialScrollDone.current = true;
		}
	}, [messages, events]);

	useMessagingEvents((event) => {
		if (
			event.conversationId === conversationId &&
			(event.type === 'new_message' || event.type === 'conversation_updated')
		) {
			fetchAll(1, false);
		}
	});

	const loadMore = () => {
		const next = page + 1;
		setPage(next);
		fetchAll(next, true);
	};

	useEffect(() => {
		const el = containerRef.current;
		if (el) {
			(el as HTMLDivElement & { addMessage?: (m: Message) => void }).addMessage =
				(msg) => {
					setMessages((prev) => [...prev, msg]);
					setTimeout(
						() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }),
						50,
					);
				};
		}
	});

	// Build merged timeline:
	//   1. Drop messages whose metadata.eventType === 'LANDING_SENT' (the
	//      richer ConversationEvent card replaces them).
	//   2. Stitch related Message bodies into LANDING_SENT events.
	//   3. Sort by createdAt ascending.
	const messagesByLandingId = new Map<string, Message>();
	for (const m of messages) {
		const meta = (m as Message & { metadata?: Record<string, unknown> | null }).metadata;
		if (meta && meta.eventType === 'LANDING_SENT' && typeof meta.landingId === 'string') {
			messagesByLandingId.set(meta.landingId, m);
		}
	}
	const visibleMessages = messages.filter((m) => {
		const meta = (m as Message & { metadata?: Record<string, unknown> | null }).metadata;
		return !(meta && meta.eventType === 'LANDING_SENT');
	});
	const decoratedEvents: TimelineEvent[] = events.map((e) => {
		if (e.type === 'LANDING_SENT') {
			const landingId = e.payload?.landingId as string | undefined;
			const related = landingId ? messagesByLandingId.get(landingId) : undefined;
			return { ...e, relatedMessageBody: related?.body ?? null };
		}
		return e;
	});

	const timeline: TimelineItem[] = [
		...visibleMessages.map((m) => ({
			kind: 'message' as const,
			data: m,
			createdAt: m.createdAt,
		})),
		...decoratedEvents.map((e) => ({
			kind: 'event' as const,
			data: e,
			createdAt: e.createdAt,
		})),
	].sort(
		(a, b) =>
			new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
	);

	const grouped = groupByDate(timeline);

	if (loading && timeline.length === 0) {
		return (
			<div className='flex-1 flex items-center justify-center'>
				<div className='text-center'>
					<div className='w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto' />
					<p className='text-xs text-gray-400 mt-2'>Загрузка сообщений...</p>
				</div>
			</div>
		);
	}

	return (
		<div ref={containerRef} className='flex-1 overflow-y-auto py-4'>
			{hasMore && (
				<div className='text-center py-3'>
					<button
						onClick={loadMore}
						disabled={loadingMore}
						className='text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50'>
						{loadingMore ? 'Загрузка...' : 'Загрузить ранние сообщения'}
					</button>
				</div>
			)}

			{timeline.length === 0 ? (
				<div className='flex items-center justify-center h-full'>
					<div className='text-center'>
						<svg
							className='w-16 h-16 mx-auto text-gray-200 mb-3'
							fill='none'
							viewBox='0 0 24 24'
							strokeWidth={0.75}
							stroke='currentColor'>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z'
							/>
						</svg>
						<p className='text-sm text-gray-400'>Нет сообщений</p>
						<p className='text-xs text-gray-400 mt-1'>Напишите первое сообщение</p>
					</div>
				</div>
			) : (
				grouped.map((group) => (
					<div key={group.date}>
						<div className='flex items-center gap-3 px-4 py-3'>
							<div className='flex-1 h-px bg-gray-200' />
							<span className='text-xs text-gray-400 font-medium'>
								{formatDateSeparator(group.date)}
							</span>
							<div className='flex-1 h-px bg-gray-200' />
						</div>
						{group.items.map((item) =>
							item.kind === 'message' ? (
								<MessageBubble key={`m-${item.data.id}`} message={item.data} />
							) : (
								<ConversationTimelineEvent
									key={`e-${item.data.id}`}
									event={item.data}
								/>
							),
						)}
					</div>
				))
			)}
			<div ref={bottomRef} />
		</div>
	);
}
