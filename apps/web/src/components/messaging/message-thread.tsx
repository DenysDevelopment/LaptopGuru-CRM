'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageBubble } from './message-bubble';
import type { Message } from './message-bubble';
import { ConversationTimelineEvent, type TimelineEvent } from './timeline-event';
import { useMessagingEvents } from '@/hooks/use-messaging-events';
import { listMessages } from '@/services/messaging/messages.service';
import { getConversation } from '@/services/messaging/conversations.service';

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
	const [conversationCreatedAt, setConversationCreatedAt] = useState<
		string | null
	>(null);
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
				const [msgItems, conv] = await Promise.all([
					listMessages(conversationId, { page: pageNum, limit: 50 }).catch(() => [] as RawMessage[]),
					prepend ? Promise.resolve(null) : getConversation(conversationId).catch(() => null),
				]);

				const list: Message[] = (msgItems as RawMessage[]).map((m) => ({
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
				})) as unknown as Message[];

				if (prepend) {
					setMessages((prev) => [...list.reverse(), ...prev]);
				} else {
					setMessages(list.reverse());
				}
				setHasMore(list.length >= 50);

				if (!prepend && conv) {
					setEvents(
						(Array.isArray(conv.events) ? conv.events : []) as unknown as TimelineEvent[],
					);
					setConversationCreatedAt(conv.createdAt ?? null);
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
		if (event.conversationId !== conversationId) return;

		if (event.type === 'new_message') {
			// Prefer the in-payload message: append a single bubble at the bottom
			// without touching the rest of the thread. Falls back to a refetch
			// only if the emitter didn't provide the full payload.
			if (event.message) {
				const m = event.message;
				const incoming: Message = {
					id: m.id,
					direction: m.direction,
					body: m.body ?? '',
					contentType: m.contentType,
					channelType: '',
					status: m.status ?? 'SENT',
					createdAt: m.createdAt,
					attachments: m.attachments,
					sender: m.sender ?? null,
					// metadata propagates through to LANDING_SENT stitching.
					...(m.metadata ? { metadata: m.metadata } : {}),
				} as unknown as Message;
				setMessages((prev) => {
					if (prev.some((p) => p.id === incoming.id)) return prev;
					return [...prev, incoming];
				});
				const container = containerRef.current;
				if (container) {
					const nearBottom =
						container.scrollHeight - container.scrollTop - container.clientHeight < 200;
					if (nearBottom) {
						setTimeout(
							() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }),
							50,
						);
					}
				}
				return;
			}
			// Fallback only when payload is missing (legacy emitters).
			fetchAll(1, false);
			return;
		}

		if (event.type === 'conversation_updated') {
			// Status changes / read events: just refresh the lightweight events
			// timeline, never the full message list. Avoids the "thread blanks
			// out and reloads" UX.
			getConversation(conversationId)
				.then((conv) => {
					if (Array.isArray(conv.events)) setEvents(conv.events as unknown as TimelineEvent[]);
				})
				.catch(() => {});
		}
	});

	const loadMore = () => {
		const next = page + 1;
		setPage(next);
		fetchAll(next, true);
	};

	// Optimistic UI: MessageInput dispatches a window event the instant the
	// user clicks "send". We append the bubble with a spinner status before
	// the network round-trip; once the server confirms, we swap the temp id
	// for the real one and flip status to SENT (or FAILED).
	useEffect(() => {
		const onAdd = (e: Event) => {
			const detail = (e as CustomEvent).detail as {
				conversationId: string;
				message: Message;
			};
			if (!detail || detail.conversationId !== conversationId) return;
			setMessages((prev) => {
				if (prev.some((p) => p.id === detail.message.id)) return prev;
				return [...prev, detail.message];
			});
			setTimeout(
				() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }),
				30,
			);
		};
		const onConfirm = (e: Event) => {
			const detail = (e as CustomEvent).detail as {
				conversationId: string;
				tempId: string;
				realId: string;
				status: string;
			};
			if (!detail || detail.conversationId !== conversationId) return;
			setMessages((prev) => {
				// If SSE arrived before the POST response, the real message is
				// already in the list — drop the temp one to avoid duplicates.
				const realAlreadyThere = prev.some((m) => m.id === detail.realId);
				if (realAlreadyThere) {
					return prev.filter((m) => m.id !== detail.tempId);
				}
				return prev.map((m) =>
					m.id === detail.tempId
						? ({ ...m, id: detail.realId, status: detail.status } as Message)
						: m,
				);
			});
		};
		window.addEventListener('messaging:optimistic-add', onAdd);
		window.addEventListener('messaging:optimistic-confirm', onConfirm);
		return () => {
			window.removeEventListener('messaging:optimistic-add', onAdd);
			window.removeEventListener('messaging:optimistic-confirm', onConfirm);
		};
	}, [conversationId]);

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
	// Dedupe viewed-by-admin events: a race in concurrent GETs can create
	// multiple "open ticket" events at once. Keep only the earliest one so the
	// timeline shows a single "Чат открыт" line.
	const seenViewedByAdmin = new Set<string>();
	const dedupedEvents = events
		.slice()
		.sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		)
		.filter((e) => {
			if (
				e.type === 'STATUS_CHANGED' &&
				(e.payload as { reason?: string } | null)?.reason === 'viewed-by-admin'
			) {
				const key = `${conversationId}:viewed-by-admin`;
				if (seenViewedByAdmin.has(key)) return false;
				seenViewedByAdmin.add(key);
			}
			return true;
		});
	const decoratedEvents: TimelineEvent[] = dedupedEvents.map((e) => {
		if (e.type === 'LANDING_SENT') {
			const landingId = e.payload?.landingId as string | undefined;
			const related = landingId ? messagesByLandingId.get(landingId) : undefined;
			return { ...e, relatedMessageBody: related?.body ?? null };
		}
		return e;
	});

	// Backfill a synthetic "Чат создан" header for legacy conversations that
	// predate the CONVERSATION_CREATED event type.
	const hasCreatedEvent = decoratedEvents.some(
		(e) => e.type === 'CONVERSATION_CREATED',
	);
	if (!hasCreatedEvent && conversationCreatedAt) {
		decoratedEvents.unshift({
			id: `synthetic-created-${conversationId}`,
			type: 'CONVERSATION_CREATED',
			actor: null,
			payload: { source: 'legacy' },
			createdAt: conversationCreatedAt,
		});
	}

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
