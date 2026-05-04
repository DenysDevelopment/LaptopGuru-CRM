'use client';

import { ChannelIcon } from './channel-icon';
import { decodeEntities } from '@/lib/decode-entities';

interface Message {
	id: string;
	direction: 'INBOUND' | 'OUTBOUND';
	body: string;
	contentType: string;
	channelType: string;
	status: string;
	createdAt: string;
	attachments?: {
		id: string;
		fileName: string;
		mimeType: string;
		url: string;
		size: number;
	}[];
	sender?: {
		id: string;
		name: string | null;
	} | null;
}

function formatTime(dateStr: string): string {
	return new Date(dateStr).toLocaleTimeString('ru-RU', {
		hour: '2-digit',
		minute: '2-digit',
	});
}

function DeliveryStatusIcon({ status }: { status: string }) {
	switch (status) {
		case 'SENDING':
		case 'PENDING':
			return (
				<div
					className='w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin'
					title='Отправляется...'
				/>
			);
		case 'SENT':
			return (
				<svg className='w-3.5 h-3.5 text-gray-400' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
					<path strokeLinecap='round' strokeLinejoin='round' d='m4.5 12.75 6 6 9-13.5' />
				</svg>
			);
		case 'DELIVERED':
			return (
				<svg className='w-3.5 h-3.5 text-gray-400' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
					<path strokeLinecap='round' strokeLinejoin='round' d='m4.5 12.75 6 6 9-13.5' />
					<path strokeLinecap='round' strokeLinejoin='round' d='m8.5 12.75 6 6 9-13.5' />
				</svg>
			);
		case 'READ':
			return (
				<svg className='w-3.5 h-3.5 text-blue-500' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
					<path strokeLinecap='round' strokeLinejoin='round' d='m4.5 12.75 6 6 9-13.5' />
					<path strokeLinecap='round' strokeLinejoin='round' d='m8.5 12.75 6 6 9-13.5' />
				</svg>
			);
		case 'FAILED':
			return (
				<svg className='w-3.5 h-3.5 text-red-500' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
					<path strokeLinecap='round' strokeLinejoin='round' d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z' />
				</svg>
			);
		default:
			return (
				<svg className='w-3.5 h-3.5 text-gray-300' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
					<path strokeLinecap='round' strokeLinejoin='round' d='M12 6v6h4.5' />
				</svg>
			);
	}
}

function isImageMime(mime: string): boolean {
	return mime.startsWith('image/');
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageBubble({ message }: { message: Message }) {
	const isOutbound = message.direction === 'OUTBOUND';

	return (
		<div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-2 px-4`}>
			<div
				className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ring-1 ${
					isOutbound
						? 'bg-slate-700 text-white rounded-br-md ring-slate-700/10'
						: 'bg-gray-50 text-gray-900 rounded-bl-md ring-gray-200/70'
				}`}>
				{/* Sender name for outbound */}
				{isOutbound && message.sender?.name && (
					<p className={`text-xs mb-1 ${isOutbound ? 'text-white/70' : 'text-gray-400'}`}>
						{message.sender.name}
					</p>
				)}

				{/* Attachments */}
				{message.attachments && message.attachments.length > 0 && (
					<div className='mb-2 space-y-1.5'>
						{message.attachments.map((att) =>
							isImageMime(att.mimeType) ? (
								<img
									key={att.id}
									src={att.url}
									alt={att.fileName}
									className='max-w-full rounded-lg max-h-60 object-cover'
								/>
							) : (
								<a
									key={att.id}
									href={att.url}
									target='_blank'
									rel='noopener noreferrer'
									className={`flex items-center gap-2 p-2 rounded-lg ${
										isOutbound ? 'bg-white/10' : 'bg-white'
									}`}>
									<svg
										className={`w-5 h-5 flex-shrink-0 ${
											isOutbound ? 'text-white/70' : 'text-gray-400'
										}`}
										fill='none'
										viewBox='0 0 24 24'
										strokeWidth={1.5}
										stroke='currentColor'>
										<path
											strokeLinecap='round'
											strokeLinejoin='round'
											d='m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13'
										/>
									</svg>
									<div className='min-w-0'>
										<p
											className={`text-xs font-medium truncate ${
												isOutbound ? 'text-white' : 'text-gray-700'
											}`}>
											{att.fileName}
										</p>
										<p
											className={`text-[10px] ${
												isOutbound ? 'text-white/60' : 'text-gray-400'
											}`}>
											{formatFileSize(att.size)}
										</p>
									</div>
								</a>
							),
						)}
					</div>
				)}

				{/* Body */}
				{message.body && (
					<p className='text-sm whitespace-pre-wrap break-words leading-relaxed'>
						{decodeEntities(message.body)}
					</p>
				)}

				{/* Footer: time + status */}
				<div
					className={`flex items-center gap-1.5 mt-1 ${
						isOutbound ? 'justify-end' : 'justify-start'
					}`}>
					<ChannelIcon channel={message.channelType} size={10} className='opacity-50' />
					<span
						className={`text-[10px] ${
							isOutbound ? 'text-white/60' : 'text-gray-400'
						}`}>
						{formatTime(message.createdAt)}
					</span>
					{isOutbound && <DeliveryStatusIcon status={message.status} />}
				</div>
			</div>
		</div>
	);
}

export type { Message };
