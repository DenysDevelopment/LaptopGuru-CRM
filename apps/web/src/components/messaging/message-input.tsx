'use client';

import { useState, useRef, useEffect } from 'react';
import { sendMessage } from '@/services/messaging/messages.service';

interface MessageInputProps {
	conversationId: string;
	onMessageSent?: (msg: { body: string; contentType: string }) => void;
	disabled?: boolean;
	onOpenSendLanding?: () => void;
	onOpenPhoneCamera?: () => void;
}

interface PendingAttachment {
	tempId: string;
	fileName: string;
	mimeType: string;
	fileSize: number;
	storageKey: string;
	storageUrl: string;
	uploading?: boolean;
	error?: string;
}

function isImage(mime: string): boolean {
	return mime.startsWith('image/');
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageInput({ conversationId, onMessageSent, disabled, onOpenSendLanding, onOpenPhoneCamera }: MessageInputProps) {
	const [body, setBody] = useState('');
	const [sending, setSending] = useState(false);
	const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Auto-resize textarea
	useEffect(() => {
		const el = textareaRef.current;
		if (el) {
			el.style.height = 'auto';
			el.style.height = Math.min(el.scrollHeight, 150) + 'px';
		}
	}, [body]);

const handleSend = async () => {
		const trimmed = body.trim();
		const readyAttachments = pendingAttachments.filter(
			(a) => !a.uploading && !a.error,
		);
		if (sending || disabled) return;
		if (!trimmed && readyAttachments.length === 0) return;
		if (pendingAttachments.some((a) => a.uploading)) return; // wait for uploads

		const contentType = readyAttachments.some((a) => isImage(a.mimeType))
			? 'IMAGE'
			: readyAttachments.length > 0
				? 'FILE'
				: 'TEXT';

		// Optimistic insert: show the bubble immediately with a spinner; the
		// thread will swap the temp id for the real one when the server
		// confirms.
		const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const optimisticMsg = {
			id: tempId,
			direction: 'OUTBOUND' as const,
			body: trimmed,
			contentType,
			channelType: '',
			status: 'SENDING',
			createdAt: new Date().toISOString(),
			attachments: readyAttachments.map((a, i) => ({
				id: `${tempId}-att-${i}`,
				fileName: a.fileName,
				mimeType: a.mimeType,
				url: a.storageUrl,
				size: a.fileSize,
			})),
		};
		window.dispatchEvent(
			new CustomEvent('messaging:optimistic-add', {
				detail: { conversationId, message: optimisticMsg },
			}),
		);

		// Clear input now — feels snappier and matches Telegram UX.
		setBody('');
		setPendingAttachments([]);
		setSending(true);
		try {
			const data = await sendMessage(conversationId, {
				body: trimmed,
				contentType,
				attachments: readyAttachments.map((a) => ({
					fileName: a.fileName,
					mimeType: a.mimeType,
					fileSize: a.fileSize,
					storageKey: a.storageKey,
					storageUrl: a.storageUrl,
				})),
			});
			const finalStatus =
				(data.deliveryStatus as string | undefined) ??
				(data.externalId ? 'SENT' : 'FAILED');
			window.dispatchEvent(
				new CustomEvent('messaging:optimistic-confirm', {
					detail: {
						conversationId,
						tempId,
						realId: data.id,
						status: finalStatus,
					},
				}),
			);
			onMessageSent?.({ body: trimmed, contentType });
		} catch {
			window.dispatchEvent(
				new CustomEvent('messaging:optimistic-confirm', {
					detail: { conversationId, tempId, realId: tempId, status: 'FAILED' },
				}),
			);
		} finally {
			setSending(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		// Enter without shift sends message
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setBody(e.target.value);
	};

	const handleFileClick = () => {
		fileInputRef.current?.click();
	};

	const uploadOne = async (file: File) => {
		const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		setPendingAttachments((prev) => [
			...prev,
			{
				tempId,
				fileName: file.name,
				mimeType: file.type || 'application/octet-stream',
				fileSize: file.size,
				storageKey: '',
				storageUrl: '',
				uploading: true,
			},
		]);
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch(
				`/api/messaging/conversations/${conversationId}/attachments`,
				{ method: 'POST', body: fd },
			);
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				setPendingAttachments((prev) =>
					prev.map((a) =>
						a.tempId === tempId
							? { ...a, uploading: false, error: txt.slice(0, 100) || `HTTP ${res.status}` }
							: a,
					),
				);
				return;
			}
			const data = (await res.json()) as {
				fileName: string;
				mimeType: string;
				fileSize: number;
				storageKey: string;
				storageUrl: string;
			};
			setPendingAttachments((prev) =>
				prev.map((a) =>
					a.tempId === tempId
						? { ...a, ...data, uploading: false }
						: a,
				),
			);
		} catch (err) {
			setPendingAttachments((prev) =>
				prev.map((a) =>
					a.tempId === tempId
						? { ...a, uploading: false, error: err instanceof Error ? err.message : 'upload failed' }
						: a,
				),
			);
		}
	};

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files ?? []);
		e.target.value = '';
		for (const file of files) {
			void uploadOne(file);
		}
	};

	const removeAttachment = (tempId: string) => {
		setPendingAttachments((prev) => prev.filter((a) => a.tempId !== tempId));
	};

	return (
		<div className='relative border-t border-gray-200 bg-white'>
			{/* Pending attachment chips */}
			{pendingAttachments.length > 0 && (
				<div className='flex flex-wrap gap-2 px-3 pt-2'>
					{pendingAttachments.map((a) => (
						<div
							key={a.tempId}
							className={`flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg border text-xs ${
								a.error
									? 'border-red-200 bg-red-50 text-red-700'
									: 'border-gray-200 bg-gray-50 text-gray-700'
							}`}>
							{a.uploading ? (
								<div className='w-3 h-3 border-2 border-brand/30 border-t-brand rounded-full animate-spin' />
							) : isImage(a.mimeType) ? (
								<svg className='w-3.5 h-3.5 text-gray-400' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z' />
								</svg>
							) : (
								<svg className='w-3.5 h-3.5 text-gray-400' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z' />
								</svg>
							)}
							<span className='max-w-[160px] truncate'>{a.fileName}</span>
							{!a.uploading && !a.error && (
								<span className='text-[10px] text-gray-400'>{formatFileSize(a.fileSize)}</span>
							)}
							<button
								onClick={() => removeAttachment(a.tempId)}
								className='ml-1 p-1 text-gray-400 hover:text-gray-600 rounded'
								title='Удалить'>
								<svg className='w-3 h-3' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='M6 18 18 6M6 6l12 12' />
								</svg>
							</button>
						</div>
					))}
				</div>
			)}

			{/* Input area */}
			<div className='flex items-end gap-2 p-3'>
				{/* Attachment */}
				<button
					onClick={handleFileClick}
					className='flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50'>
					<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							d='m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13'
						/>
					</svg>
				</button>
				<input
					ref={fileInputRef}
					type='file'
					className='hidden'
					multiple
					onChange={handleFileChange}
				/>

{/* Send landing — opens modal with video picker + chat-message editor */}
				{onOpenSendLanding && (
					<button
						type='button'
						onClick={onOpenSendLanding}
						title='Отправить лендинг с видео-обзором'
						className='flex-shrink-0 p-2 text-gray-400 hover:text-brand hover:bg-brand-light/60 transition-colors rounded-lg'>
						<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z'
							/>
						</svg>
					</button>
				)}

				{/* Take photo on phone — opens QR modal */}
				{onOpenPhoneCamera && (
					<button
						type='button'
						onClick={onOpenPhoneCamera}
						title='Сделать фото на телефоне через QR'
						className='flex-shrink-0 p-2 text-gray-400 hover:text-brand hover:bg-brand-light/60 transition-colors rounded-lg'>
						<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z'
							/>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z'
							/>
						</svg>
					</button>
				)}

				{/* Textarea */}
				<textarea
					ref={textareaRef}
					value={body}
					onChange={handleBodyChange}
					onKeyDown={handleKeyDown}
					placeholder='Напишите сообщение...'
					disabled={disabled || sending}
					rows={1}
					className='flex-1 resize-none px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400 disabled:opacity-50 max-h-[150px]'
				/>

				{/* Send button */}
				<button
					onClick={handleSend}
					disabled={!body.trim() || sending || disabled}
					className='flex-shrink-0 p-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed'>
					{sending ? (
						<div className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin' />
					) : (
						<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5'
							/>
						</svg>
					)}
				</button>
			</div>
		</div>
	);
}
