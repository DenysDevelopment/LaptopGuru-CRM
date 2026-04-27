'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageThread } from '@/components/messaging/message-thread';
import { MessageInput } from '@/components/messaging/message-input';
import { ConversationSidebar } from '@/components/messaging/conversation-sidebar';
import { ChannelIcon, getChannelLabel } from '@/components/messaging/channel-icon';
import type { ConversationDetail } from '@/components/messaging/conversation-sidebar';
import { SendVideoModal } from '@/components/messaging/send-video-modal';
import { StatusControl } from '@/components/messaging/status-control';

export default function ConversationDetailPage() {
	const params = useParams();
	const router = useRouter();
	const conversationId = params.id as string;

	const [conversation, setConversation] = useState<ConversationDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [showVideoModal, setShowVideoModal] = useState(false);

	const fetchConversation = useCallback(async () => {
		try {
			const res = await fetch(`/api/messaging/conversations/${conversationId}`);
			if (!res.ok) {
				setError(true);
				return;
			}
			const data = await res.json();
			setConversation(data);
		} catch {
			setError(true);
		} finally {
			setLoading(false);
		}
	}, [conversationId]);

	useEffect(() => {
		fetchConversation();
		// Mark messages as read when opening conversation
		fetch(`/api/messaging/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
	}, [fetchConversation, conversationId]);

	if (loading) {
		return (
			<div className='flex items-center justify-center h-full'>
				<div className='w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin' />
			</div>
		);
	}

	if (error || !conversation) {
		return (
			<div className='flex items-center justify-center h-full'>
				<div className='text-center'>
					<p className='text-gray-400 mb-2'>Разговор не найден</p>
					<Link
						href='/messaging'
						className='text-sm text-brand hover:underline'>
						Вернуться к входящим
					</Link>
				</div>
			</div>
		);
	}

	const contact = conversation.contact;
	const contactName = contact?.name || contact?.email || contact?.phone || 'Без имени';

	return (
		<div className='flex h-full'>
			{/* Main chat area */}
			<div className='flex-1 flex flex-col min-w-0'>
				{/* Send Video Banner — top, prominent */}
				{conversation.channelType === 'EMAIL' && (
					<div className='flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-brand to-orange-500 flex-shrink-0'>
						<div className='flex items-center gap-2 text-white/90 text-sm'>
							<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
								<path strokeLinecap='round' strokeLinejoin='round' d='m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z' />
							</svg>
							<span className='hidden sm:inline'>Отправьте видео-рецензию клиенту</span>
						</div>
						<div className='flex items-center gap-2'>
							<button
								onClick={() => setShowVideoModal(true)}
								className='inline-flex items-center gap-2 text-sm font-semibold text-brand bg-white hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors shadow-sm'>
								<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5' />
								</svg>
								Отправить видео
							</button>
							<Link
								href={`/send?conversationId=${conversationId}`}
								className='text-white/70 hover:text-white transition-colors p-1.5'
								title='Расширенная отправка'>
								<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25' />
								</svg>
							</Link>
						</div>
					</div>
				)}

				{/* Header */}
				<div className='flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0'>
					{/* Mobile back button */}
					<button
						onClick={() => router.push('/messaging')}
						className='md:hidden flex-shrink-0 p-1 -ml-1 text-gray-400 hover:text-gray-600'>
						<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
							<path strokeLinecap='round' strokeLinejoin='round' d='M15.75 19.5 8.25 12l7.5-7.5' />
						</svg>
					</button>

					{/* Avatar */}
					{contact?.avatarUrl ? (
						<img
							src={contact.avatarUrl}
							alt={contactName}
							className='w-9 h-9 rounded-full object-cover flex-shrink-0'
						/>
					) : (
						<div className='w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600 flex-shrink-0'>
							{contactName[0]?.toUpperCase() || '?'}
						</div>
					)}

					<div className='flex-1 min-w-0'>
						<div className='flex items-center gap-2 flex-wrap'>
							<h1 className='text-sm font-semibold text-gray-900 truncate'>
								{contactName}
							</h1>
							<ChannelIcon channel={conversation.channelType} size={14} />
							<StatusControl
								conversationId={conversationId}
								status={conversation.status as Parameters<typeof StatusControl>[0]['status']}
								lastStatusChangedAt={
									(conversation as ConversationDetail & {
										lastStatusChangedAt?: string | null;
									}).lastStatusChangedAt ?? null
								}
								lastStatusChangedBy={
									(conversation as ConversationDetail & {
										lastStatusChangedBy?: {
											id: string;
											name: string | null;
											email: string;
										} | null;
									}).lastStatusChangedBy ?? null
								}
								onChange={fetchConversation}
							/>
						</div>
						<p className='text-xs text-gray-400 truncate'>
							{getChannelLabel(conversation.channelType)}
							{contact?.email ? ` • ${contact.email}` : ''}
							{conversation.subject ? ` • ${conversation.subject}` : ''}
						</p>
					</div>

					{/* Assignee badge */}
					{conversation.assignee && (
						<div className='hidden sm:flex items-center gap-1.5 text-xs text-gray-400'>
							<div className='w-6 h-6 rounded-full bg-brand-light flex items-center justify-center text-[10px] font-medium text-brand'>
								{conversation.assignee.name?.[0]?.toUpperCase() || '?'}
							</div>
							<span className='hidden lg:inline'>{conversation.assignee.name}</span>
						</div>
					)}
				</div>

				{/* Messages */}
				<MessageThread conversationId={conversationId} />

				{/* Input */}
				<MessageInput
					conversationId={conversationId}
					disabled={conversation.status === 'CLOSED'}
				/>
			</div>

			{/* Right sidebar */}
			<ConversationSidebar
				conversation={conversation}
				onUpdate={fetchConversation}
			/>

			{/* Send Video Modal */}
			{showVideoModal && (
				<SendVideoModal
					conversationId={conversationId}
					onClose={() => setShowVideoModal(false)}
					onSent={() => {
						setShowVideoModal(false);
						fetchConversation();
					}}
				/>
			)}
		</div>
	);
}
