'use client';

import { useState, useCallback } from 'react';
import { useMessagingEvents } from '@/hooks/use-messaging-events';
import { ChannelIcon } from './channel-icon';

interface Toast {
	id: string;
	senderName: string;
	body: string;
	channelType: string;
	conversationId: string;
}

export function MessagingToastNotifications() {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const addToast = useCallback((toast: Toast) => {
		setToasts((prev) => [...prev.slice(-4), toast]); // max 5 toasts

		// Play notification sound
		try {
			const audio = new Audio('/notification.wav');
			audio.volume = 0.5;
			audio.play().catch(() => {});
		} catch {}

		// Auto-remove after 5s
		setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== toast.id));
		}, 5000);
	}, []);

	useMessagingEvents((event) => {
		// Toast only on inbound messages from external channels.
		if (event.type !== 'new_message' || !event.message) return;
		if (event.message.direction !== 'INBOUND') return;
		const senderName = event.message.contact?.name ?? 'Клиент';
		addToast({
			id: `${Date.now()}-${Math.random()}`,
			senderName,
			body: (event.message.body || '').slice(0, 100) || 'Новое сообщение',
			channelType: 'TELEGRAM',
			conversationId: event.conversationId,
		});
	});

	if (toasts.length === 0) return null;

	return (
		<div className='fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm'>
			{toasts.map((toast) => (
				<div
					key={toast.id}
					className='bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex items-start gap-3 animate-slide-up cursor-pointer hover:shadow-xl transition-shadow'
					onClick={() => {
						window.location.href = `/messaging/conversations/${toast.conversationId}`;
						setToasts((prev) => prev.filter((t) => t.id !== toast.id));
					}}>
					<div className='w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0'>
						<ChannelIcon channel={toast.channelType} size={16} />
					</div>
					<div className='min-w-0 flex-1'>
						<p className='text-sm font-semibold text-gray-900 truncate'>
							{toast.senderName}
						</p>
						<p className='text-xs text-gray-500 truncate mt-0.5'>
							{toast.body}
						</p>
					</div>
					<button
						onClick={(e) => {
							e.stopPropagation();
							setToasts((prev) => prev.filter((t) => t.id !== toast.id));
						}}
						className='text-gray-300 hover:text-gray-500 flex-shrink-0'>
						<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
							<path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
						</svg>
					</button>
				</div>
			))}
		</div>
	);
}
