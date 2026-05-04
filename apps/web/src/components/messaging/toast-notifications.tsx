'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
	// One Audio instance reused per session — created lazily on the first
	// user interaction so Chrome's autoplay policy lets it play. Without
	// this, audio.play() rejects silently and no sound is heard.
	const audioRef = useRef<HTMLAudioElement | null>(null);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const unlock = () => {
			if (!audioRef.current) {
				const a = new Audio('/notification.wav');
				a.volume = 0.5;
				audioRef.current = a;
			}
			// Fire-and-forget muted play to satisfy the autoplay gesture
			// requirement; subsequent .play() calls don't need a gesture.
			audioRef.current.muted = true;
			audioRef.current
				.play()
				.then(() => {
					audioRef.current!.pause();
					audioRef.current!.currentTime = 0;
					audioRef.current!.muted = false;
				})
				.catch(() => {
					if (audioRef.current) audioRef.current.muted = false;
				});
			window.removeEventListener('click', unlock);
			window.removeEventListener('keydown', unlock);
		};
		window.addEventListener('click', unlock, { once: true });
		window.addEventListener('keydown', unlock, { once: true });
		// Native browser notifications work even when the tab is in the
		// background — ask permission once on mount, no-op if already
		// granted/denied.
		if (
			'Notification' in window &&
			Notification.permission === 'default'
		) {
			Notification.requestPermission().catch(() => {});
		}
		return () => {
			window.removeEventListener('click', unlock);
			window.removeEventListener('keydown', unlock);
		};
	}, []);

	const addToast = useCallback((toast: Toast) => {
		setToasts((prev) => [...prev.slice(-4), toast]); // max 5 toasts

		// 1) In-page sound — autoplay-unlocked Audio above.
		if (audioRef.current) {
			try {
				audioRef.current.currentTime = 0;
				audioRef.current.play().catch(() => {});
			} catch {}
		} else {
			try {
				const a = new Audio('/notification.wav');
				a.volume = 0.5;
				a.play().catch(() => {});
			} catch {}
		}

		// 2) Native browser notification when the tab isn't focused, so the
		//    user gets pinged even with the CRM in the background.
		if (
			typeof document !== 'undefined' &&
			document.visibilityState !== 'visible' &&
			'Notification' in window &&
			Notification.permission === 'granted'
		) {
			try {
				const n = new Notification(toast.senderName, {
					body: toast.body,
					icon: '/laptopguru-favicon.png',
					tag: `conv-${toast.conversationId}`, // collapse repeats per chat
				});
				n.onclick = () => {
					window.focus();
					window.location.href = `/messaging/conversations/${toast.conversationId}`;
					n.close();
				};
			} catch {}
		}

		// Auto-remove after 5s
		setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== toast.id));
		}, 5000);
	}, []);

	useMessagingEvents((event) => {
		// Inbound text on an existing conversation.
		if (event.type === 'new_message' && event.message) {
			if (event.message.direction !== 'INBOUND') return;
			const senderName = event.message.contact?.name ?? 'Клиент';
			addToast({
				id: `${Date.now()}-${Math.random()}`,
				senderName,
				body: (event.message.body || '').slice(0, 100) || 'Новое сообщение',
				channelType: event.conversationPatch?.channelType ?? '',
				conversationId: event.conversationId,
			});
			return;
		}
		// First message of a brand-new conversation arrives bundled in the
		// new_conversation event — also worth a ping.
		if (event.type === 'new_conversation' && event.conversation) {
			addToast({
				id: `${Date.now()}-${Math.random()}`,
				senderName: event.conversation.contact?.name ?? 'Новый клиент',
				body:
					(event.conversation.lastMessagePreview || '').slice(0, 100) ||
					'Новое обращение',
				channelType: event.conversation.channelType,
				conversationId: event.conversationId,
			});
		}
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
