'use client';

import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useMessagingEvents } from '@/hooks/use-messaging-events';

interface Props {
	conversationId: string;
	onClose: () => void;
	/** Optional callback fired when a photo arrives via the QR flow. */
	onPhotoSent?: () => void;
}

type Status =
	| { kind: 'init' }
	| { kind: 'waiting'; token: string; mobileUrl: string; expiresAt: number }
	| { kind: 'done' }
	| { kind: 'expired' }
	| { kind: 'error'; message: string };

export function SendPhotoModal({ conversationId, onClose, onPhotoSent }: Props) {
	const [status, setStatus] = useState<Status>({ kind: 'init' });
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const onPhotoSentRef = useRef(onPhotoSent);
	// Remember when the QR was issued so we only treat new IMAGE messages
	// arriving *after* this point as the photo we're waiting for.
	const issuedAtRef = useRef<number>(Date.now());

	useEffect(() => {
		onPhotoSentRef.current = onPhotoSent;
	});

	// Issue token + render QR on mount.
	useEffect(() => {
		let cancelled = false;
		async function start() {
			try {
				const res = await fetch(
					`/api/messaging/conversations/${conversationId}/photo-token`,
					{ method: 'POST' },
				);
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					throw new Error(data.error || 'Не удалось создать ссылку');
				}
				const { token, mobileUrl, expiresAt } = (await res.json()) as {
					token: string;
					mobileUrl: string;
					expiresAt: string;
				};
				if (cancelled) return;
				const dataUrl = await QRCode.toDataURL(mobileUrl, {
					margin: 1,
					width: 360,
					color: { dark: '#111827', light: '#ffffff' },
				});
				if (cancelled) return;
				issuedAtRef.current = Date.now();
				setQrDataUrl(dataUrl);
				setStatus({
					kind: 'waiting',
					token,
					mobileUrl,
					expiresAt: new Date(expiresAt).getTime(),
				});
			} catch (err) {
				if (cancelled) return;
				setStatus({
					kind: 'error',
					message: err instanceof Error ? err.message : 'Неизвестная ошибка',
				});
			}
		}
		start();
		return () => {
			cancelled = true;
		};
	}, [conversationId]);

	// Listen to messaging SSE — close on first IMAGE message that arrives
	// for this conversation after the QR was issued.
	useMessagingEvents((evt) => {
		if (status.kind !== 'waiting') return;
		if (evt.type !== 'new_message') return;
		if (evt.conversationId !== conversationId) return;
		const m = evt.message;
		if (!m || m.contentType !== 'IMAGE') return;
		if (new Date(m.createdAt).getTime() < issuedAtRef.current - 1000) return;
		setStatus({ kind: 'done' });
		onPhotoSentRef.current?.();
	});

	// Countdown tick
	useEffect(() => {
		if (status.kind !== 'waiting') return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [status.kind]);

	// Auto-detect expiry from the countdown.
	useEffect(() => {
		if (status.kind !== 'waiting') return;
		if (status.expiresAt - now <= 0) setStatus({ kind: 'expired' });
	}, [now, status]);

	// Auto-close 1.5s after success so the agent sees the green check.
	useEffect(() => {
		if (status.kind !== 'done') return;
		const t = setTimeout(onClose, 1500);
		return () => clearTimeout(t);
	}, [status.kind, onClose]);

	const expiresAt = status.kind === 'waiting' ? status.expiresAt : null;
	const msLeft = expiresAt ? Math.max(0, expiresAt - now) : 0;
	const minLeft = Math.floor(msLeft / 60_000);
	const secLeft = Math.floor((msLeft % 60_000) / 1000);

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
			<div className='bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col'>
				<div className='p-5 border-b border-gray-100 flex items-center justify-between'>
					<h2 className='text-lg font-semibold text-gray-900'>
						Сделать фото на телефоне
					</h2>
					<button
						type='button'
						onClick={onClose}
						className='text-gray-400 hover:text-gray-600'>
						<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
							<path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
						</svg>
					</button>
				</div>

				<div className='p-5 flex flex-col items-center gap-3'>
					{status.kind === 'init' && (
						<div className='w-[280px] h-[280px] bg-gray-100 animate-pulse rounded-lg' />
					)}

					{status.kind === 'waiting' && qrDataUrl && (
						<>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={qrDataUrl}
								alt='QR для съёмки фото с телефона'
								width={280}
								height={280}
								className='rounded-lg border border-gray-100'
							/>
							<p className='text-sm text-gray-600 text-center max-w-xs'>
								Наведите камеру телефона. После съёмки фото уйдёт клиенту автоматически.
							</p>
							<div className='text-xs text-gray-400'>
								Ссылка истекает через {String(minLeft).padStart(2, '0')}:
								{String(secLeft).padStart(2, '0')}
							</div>
						</>
					)}

					{status.kind === 'done' && (
						<div className='flex flex-col items-center gap-2 py-6'>
							<div className='w-12 h-12 rounded-full bg-green-100 flex items-center justify-center'>
								<svg className='w-6 h-6 text-green-600' fill='none' viewBox='0 0 24 24' strokeWidth={2.5} stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='m4.5 12.75 6 6 9-13.5' />
								</svg>
							</div>
							<p className='text-sm font-semibold text-gray-900'>Фото отправлено</p>
						</div>
					)}

					{status.kind === 'expired' && (
						<div className='flex flex-col items-center gap-3 py-6'>
							<p className='text-sm text-gray-600'>QR истёк</p>
							<button
								type='button'
								onClick={() => setStatus({ kind: 'init' })}
								className='text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800'>
								Сгенерировать заново
							</button>
						</div>
					)}

					{status.kind === 'error' && (
						<div className='flex flex-col items-center gap-3 py-6'>
							<p className='text-sm text-red-600'>{status.message}</p>
							<button
								type='button'
								onClick={() => setStatus({ kind: 'init' })}
								className='text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800'>
								Попробовать снова
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
