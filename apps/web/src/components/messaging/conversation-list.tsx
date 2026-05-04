'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ConversationListItem } from './conversation-list-item';
import type { Conversation } from './conversation-list-item';
import { useMessagingEvents } from '@/hooks/use-messaging-events';
import { listConversations } from '@/services/messaging/conversations.service';

interface ConversationListProps {
	status?: string;
	assigneeId?: string;
	/**
	 * When provided, scopes the list to channels of this type regardless of
	 * URL search params (used by `/allegro/*`). Falls back to `?channelType`
	 * from the URL otherwise.
	 */
	forceChannelType?: string;
}

const TABS = [
	{ key: '', label: 'Все' },
	{ key: 'NEW', label: 'Новые' },
	{ key: 'OPEN', label: 'Открытые' },
	{ key: 'WAITING_REPLY', label: 'В работе' },
	{ key: 'RESOLVED', label: 'Завершённые' },
];

export function ConversationList({
	status: initialStatus,
	forceChannelType,
}: ConversationListProps) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	// Sidebar links to /messaging?channel=<id>; use that to scope the list.
	const channelFilter = searchParams.get('channel') ?? '';
	const channelTypeFilter =
		forceChannelType ?? searchParams.get('channelType') ?? '';
	const channelTypesFilter = searchParams.get('channelTypes') ?? '';
	const smartFilter = searchParams.get('filter') ?? '';
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [activeTab, setActiveTab] = useState(initialStatus || '');
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(false);

	const activeConversationId = pathname.match(/\/conversations\/(.+)/)?.[1];

	const fetchConversations = useCallback(async (pageNum: number, append: boolean) => {
		setLoading(!append);
		try {
			const list = await listConversations({
				page: pageNum,
				limit: 30,
				...(activeTab === 'mine'
					? { assigneeId: 'me' }
					: activeTab
						? { status: activeTab }
						: {}),
				// Smart sidebar filters override the activeTab when present.
				...(smartFilter === 'mine' ? { assigneeId: 'me' } : {}),
				...(smartFilter === 'urgent' ? { priority: 'HIGH,URGENT' } : {}),
				...(channelFilter ? { channelId: channelFilter } : {}),
				...(channelTypeFilter ? { channelType: channelTypeFilter } : {}),
				...(channelTypesFilter ? { channelTypes: channelTypesFilter } : {}),
				...(search ? { search } : {}),
			});

			if (append) {
				setConversations((prev) => [...prev, ...list]);
			} else {
				setConversations(list);
			}
			setHasMore(list.length >= 30);
		} catch {
			// silently fail — TODO: surface via toast once we add a global error handler
		} finally {
			setLoading(false);
		}
	}, [activeTab, search, channelFilter, channelTypeFilter, channelTypesFilter, smartFilter]);

	useEffect(() => {
		setPage(1);
		fetchConversations(1, false);
	}, [fetchConversations]);

	// Real-time updates via SSE — patch local state instead of refetching.
	// Without this, every incoming message would blank out the list while a
	// new fetch round-trips, causing the "everything reloads" UX.
	useMessagingEvents((event) => {
		if (event.type === 'new_conversation') {
			// Apply the same filters the server used so we don't insert
			// conversations that wouldn't match the current view.
			const conv = event.conversation;
			if (channelTypeFilter && conv.channelType !== channelTypeFilter) return;
			if (activeTab && activeTab !== 'mine' && conv.status !== activeTab) return;
			setConversations((prev) => {
				if (prev.some((c) => c.id === conv.id)) return prev;
				return [conv as unknown as Conversation, ...prev];
			});
			return;
		}

		if (event.type === 'new_message') {
			setConversations((prev) => {
				const idx = prev.findIndex((c) => c.id === event.conversationId);
				if (idx === -1) {
					// Conversation isn't in the visible page — only refetch if it's
					// likely a brand-new one we missed. We deliberately stay quiet
					// otherwise to avoid stampedes.
					return prev;
				}
				const current = prev[idx];
				const patch = event.conversationPatch ?? {};
				const isInbound = event.message?.direction === 'INBOUND';
				const updated: Conversation = {
					...current,
					lastMessageAt:
						(patch.lastMessageAt as string | null | undefined) ??
						event.message?.createdAt ??
						new Date().toISOString(),
					lastMessagePreview:
						(patch.lastMessagePreview as string | null | undefined) ??
						(event.message?.body ? event.message.body.slice(0, 120) : current.lastMessagePreview),
					unreadCount: isInbound ? current.unreadCount + 1 : current.unreadCount,
				};
				const next = [...prev];
				next.splice(idx, 1);
				// Re-sort by lastMessageAt desc — bring updated conversation to top.
				next.unshift(updated);
				return next;
			});
			return;
		}

		if (event.type === 'conversation_updated') {
			setConversations((prev) => {
				const idx = prev.findIndex((c) => c.id === event.conversationId);
				if (idx === -1) return prev;
				const next = [...prev];
				const patch = (event.patch ?? {}) as Partial<Conversation>;
				// "read" action: zero out unread badge instantly.
				const unreadOverride = event.action === 'read' ? { unreadCount: 0 } : {};
				next[idx] = { ...next[idx], ...patch, ...unreadOverride };
				return next;
			});
		}
	});

	const loadMore = () => {
		const next = page + 1;
		setPage(next);
		fetchConversations(next, true);
	};

	return (
		<div className='flex flex-col h-full'>
			{/* Search */}
			<div className='px-3 pt-3 pb-2'>
				<div className='relative'>
					<svg
						className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400'
						fill='none'
						viewBox='0 0 24 24'
						strokeWidth={1.5}
						stroke='currentColor'>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							d='m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z'
						/>
					</svg>
					<input
						type='text'
						placeholder='Поиск...'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className='w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
					/>
				</div>
			</div>

			{/* Tabs */}
			<div className='flex gap-1 px-3 pb-2 overflow-x-auto scrollbar-hide'>
				{TABS.map((tab) => (
					<button
						key={tab.key}
						onClick={() => setActiveTab(tab.key)}
						className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
							activeTab === tab.key
								? 'bg-brand text-white'
								: 'text-gray-500 hover:bg-gray-100'
						}`}>
						{tab.label}
					</button>
				))}
			</div>

			{/* List */}
			<div className='flex-1 overflow-y-auto'>
				{loading && conversations.length === 0 ? (
					<div className='text-center py-12'>
						<div className='w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto' />
						<p className='text-xs text-gray-400 mt-2'>Загрузка...</p>
					</div>
				) : conversations.length === 0 ? (
					<div className='text-center py-12 px-4'>
						<svg
							className='w-12 h-12 mx-auto text-gray-300 mb-3'
							fill='none'
							viewBox='0 0 24 24'
							strokeWidth={1}
							stroke='currentColor'>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z'
							/>
						</svg>
						<p className='text-sm text-gray-400'>Нет разговоров</p>
						<p className='text-xs text-gray-400 mt-1'>
							Разговоры появятся здесь при поступлении сообщений
						</p>
					</div>
				) : (
					<>
						{conversations.map((c) => (
							<ConversationListItem
								key={c.id}
								conversation={c}
								isActive={c.id === activeConversationId}
							/>
						))}
						{hasMore && (
							<button
								onClick={loadMore}
								className='w-full py-3 text-xs text-gray-400 hover:text-gray-600 transition-colors'>
								Загрузить ещё
							</button>
						)}
					</>
				)}
			</div>
		</div>
	);
}
