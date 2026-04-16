'use client';

import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';

interface Props {
	title: string;
	/** Called when the mobile upload completes successfully. */
	onComplete: (videoId: string) => void;
}

type Status =
	| { kind: 'init' }
	| { kind: 'waiting'; token: string; mobileUrl: string; expiresAt: number }
	| {
			kind: 'uploading';
			token: string;
			mobileUrl: string;
			expiresAt: number;
			pct: number;
	  }
	| { kind: 'done' }
	| { kind: 'expired' }
	| { kind: 'error'; message: string };

export function QrUploadTab({ title, onComplete }: Props) {
	const [status, setStatus] = useState<Status>({ kind: 'init' });
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const esRef = useRef<EventSource | null>(null);
	const onCompleteRef = useRef(onComplete);

	useEffect(() => {
		onCompleteRef.current = onComplete;
	});

	// Generate the token + QR as soon as the tab mounts.
	useEffect(() => {
		let cancelled = false;

		async function start() {
			try {
				const res = await fetch('/api/videos/mobile-upload/init', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title }),
				});
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					throw new Error(data.error || 'Не удалось создать ссылку');
				}
				const { token, mobileUrl, expiresAt } = await res.json();
				if (cancelled) return;

				const dataUrl = await QRCode.toDataURL(mobileUrl, {
					margin: 1,
					width: 440,
					color: { dark: '#111827', light: '#ffffff' },
				});
				if (cancelled) return;

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
	}, [title]);

	// Subscribe to SSE stream once we have a token.
	useEffect(() => {
		if (status.kind !== 'waiting' && status.kind !== 'uploading') return;

		const token = status.token;
		const es = new EventSource(`/api/videos/mobile-upload/${token}/events`);
		esRef.current = es;

		es.addEventListener('uploading', () => {
			setStatus(s =>
				s.kind === 'waiting' || s.kind === 'uploading'
					? { ...s, kind: 'uploading', pct: 0 }
					: s,
			);
		});

		es.addEventListener('progress', e => {
			try {
				const { pct } = JSON.parse((e as MessageEvent).data);
				setStatus(s =>
					s.kind === 'uploading' || s.kind === 'waiting'
						? { ...s, kind: 'uploading', pct: Number(pct) || 0 }
						: s,
				);
			} catch {
				// ignore parse errors
			}
		});

		es.addEventListener('complete', e => {
			try {
				const { videoId } = JSON.parse((e as MessageEvent).data);
				setStatus({ kind: 'done' });
				onCompleteRef.current(videoId);
			} catch {
				// ignore
			}
		});

		es.addEventListener('failed', e => {
			try {
				const { reason } = JSON.parse((e as MessageEvent).data);
				setStatus({
					kind: 'error',
					message:
						reason === 'too_large' ? 'Файл слишком большой' : 'Ошибка загрузки',
				});
			} catch {
				setStatus({ kind: 'error', message: 'Ошибка загрузки' });
			}
		});

		es.addEventListener('expired', () => {
			setStatus({ kind: 'expired' });
		});

		return () => {
			es.close();
			esRef.current = null;
		};
		// Only resubscribe when the token changes
	}, [
		status.kind === 'waiting' || status.kind === 'uploading'
			? status.token
			: null,
	]);

	// Tick every second for the countdown.
	useEffect(() => {
		if (status.kind !== 'waiting' && status.kind !== 'uploading') return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [status.kind]);

	const expiresAt =
		status.kind === 'waiting' || status.kind === 'uploading'
			? status.expiresAt
			: null;
	const msLeft = expiresAt ? Math.max(0, expiresAt - now) : 0;
	const minLeft = Math.floor(msLeft / 60_000);
	const secLeft = Math.floor((msLeft % 60_000) / 1000);

	return (
		<div className='flex flex-col items-center gap-4 py-4'>
			{status.kind === 'init' && (
				<div className='w-[220px] h-[220px] bg-gray-100 animate-pulse rounded-lg' />
			)}

			{(status.kind === 'waiting' || status.kind === 'uploading') &&
				qrDataUrl && (
					<>
						<div className='relative'>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={qrDataUrl}
								alt='QR для загрузки с телефона'
								width={220}
								height={220}
								className='rounded-lg border border-gray-100'
							/>
							{status.kind === 'uploading' && (
								<div className='absolute inset-0 rounded-lg bg-white/80 backdrop-blur-sm flex items-center justify-center'>
									<div className='text-center'>
										<div className='text-2xl font-semibold text-gray-900'>
											{status.pct}%
										</div>
										<div className='text-xs text-gray-500 mt-1'>
											Загружается
										</div>
									</div>
								</div>
							)}
						</div>

						<p className='text-sm text-gray-600 text-center max-w-xs'>
							{status.kind === 'waiting'
								? 'Наведите камеру телефона'
								: 'Видео загружается с телефона…'}
						</p>

						{status.kind === 'waiting' && (
							<details className='w-full'>
								<summary className='text-xs text-gray-400 cursor-pointer text-center select-none'>
									Не работает QR? Открыть ссылку вручную
								</summary>
								<div className='mt-2 flex items-center gap-2'>
									<code className='flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5 truncate'>
										{status.mobileUrl}
									</code>
									<button
										type='button'
										onClick={() =>
											navigator.clipboard.writeText(status.mobileUrl)
										}
										className='text-xs px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-800'>
										Копировать
									</button>
								</div>
							</details>
						)}

						<div className='text-xs text-gray-400'>
							Ссылка истекает через {String(minLeft).padStart(2, '0')}:
							{String(secLeft).padStart(2, '0')}
						</div>
					</>
				)}

			{status.kind === 'done' && (
				<div className='flex flex-col items-center gap-2 py-8'>
					<div className='w-12 h-12 rounded-full bg-green-100 flex items-center justify-center'>
						<svg
							className='w-6 h-6 text-green-600'
							fill='none'
							viewBox='0 0 24 24'
							strokeWidth={2.5}
							stroke='currentColor'>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='m4.5 12.75 6 6 9-13.5'
							/>
						</svg>
					</div>
					<p className='text-sm font-medium text-gray-900'>Видео загружено</p>
					<p className='text-xs text-gray-500'>
						Обрабатывается — будет готово через несколько минут.
					</p>
				</div>
			)}

			{status.kind === 'expired' && (
				<div className='flex flex-col items-center gap-3 py-8'>
					<p className='text-sm text-gray-600'>Ссылка истекла</p>
					<button
						type='button'
						onClick={() => setStatus({ kind: 'init' })}
						className='text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800'>
						Сгенерировать заново
					</button>
				</div>
			)}

			{status.kind === 'error' && (
				<div className='flex flex-col items-center gap-3 py-8'>
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
	);
}
