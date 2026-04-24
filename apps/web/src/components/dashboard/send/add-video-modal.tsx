'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { QrUploadTab } from './qr-upload-tab';

const MAX_BYTES = 2_147_483_648; // 2 GB

interface Props {
	open: boolean;
	onClose: () => void;
	/** Called with the new video ID after a successful upload (desktop or mobile). */
	onCreated: (videoId: string) => void;
}

type Tab = 'computer' | 'phone';

export function AddVideoModal({ open, onClose, onCreated }: Props) {
	const [tab, setTab] = useState<Tab>('phone');
	const [title, setTitle] = useState('');
	const [debouncedTitle, setDebouncedTitle] = useState('');
	const [phase, setPhase] = useState<'form' | 'active' | 'uploading'>('form');
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Reset on open so each invocation starts fresh
	useEffect(() => {
		if (!open) return;
		setTab('phone');
		setTitle('');
		setDebouncedTitle('');
		setPhase('form');
		setProgress(0);
		setError(null);
	}, [open]);

	// Debounce title so the QR code isn't regenerated on every keystroke
	useEffect(() => {
		const trimmed = title.trim();
		if (!trimmed) {
			setDebouncedTitle('');
			return;
		}
		const id = setTimeout(() => setDebouncedTitle(trimmed), 500);
		return () => clearTimeout(id);
	}, [title]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && phase !== 'uploading') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, phase, onClose]);

	const titleIsValid = title.trim().length > 0;

	const startDesktopUpload = useCallback(
		async (file: File) => {
			setError(null);
			if (!file.type.startsWith('video/')) {
				setError('Только видеофайлы');
				return;
			}
			if (file.size > MAX_BYTES) {
				setError('Максимальный размер — 2 GB');
				return;
			}

			setPhase('uploading');
			setProgress(0);

			try {
				const initRes = await fetch('/api/videos/upload-init', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						fileName: file.name,
						fileSize: file.size,
						mimeType: file.type,
						title: title.trim(),
						publishToYoutube: true,
					}),
				});
				if (!initRes.ok) {
					const data = await initRes.json().catch(() => ({}));
					throw new Error(data.error || 'Не удалось инициализировать загрузку');
				}
				const { videoId, putUrl } = await initRes.json();

				await new Promise<void>((resolve, reject) => {
					const xhr = new XMLHttpRequest();
					xhr.open('PUT', putUrl, true);
					xhr.setRequestHeader('Content-Type', file.type);
					xhr.upload.onprogress = e => {
						if (e.lengthComputable) {
							setProgress(Math.round((e.loaded / e.total) * 100));
						}
					};
					xhr.onload = () => {
						if (xhr.status >= 200 && xhr.status < 300) resolve();
						else reject(new Error(`S3 upload failed: ${xhr.status}`));
					};
					xhr.onerror = () => reject(new Error('Сеть оборвалась'));
					xhr.send(file);
				});

				const completeRes = await fetch('/api/videos/upload-complete', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ videoId }),
				});
				if (!completeRes.ok) {
					const data = await completeRes.json().catch(() => ({}));
					throw new Error(data.error || 'Не удалось завершить загрузку');
				}

				onCreated(videoId);
				onClose();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Ошибка загрузки');
				setPhase('form');
			}
		},
		[title, onCreated, onClose],
	);

	const onFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			e.target.value = '';
			if (file) startDesktopUpload(file);
		},
		[startDesktopUpload],
	);

	if (!open) return null;

	return (
		<div
			className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50'
			onClick={() => phase !== 'uploading' && onClose()}>
			<div
				className='bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden'
				onClick={e => e.stopPropagation()}>
				<div className='flex items-center justify-between px-5 py-4 border-b border-gray-100'>
					<h3 className='text-base font-semibold text-gray-900'>Новое видео</h3>
					<button
						type='button'
						onClick={onClose}
						disabled={phase === 'uploading'}
						className='text-gray-400 hover:text-gray-700 disabled:opacity-40'
						aria-label='Закрыть'>
						<svg
							className='w-5 h-5'
							fill='none'
							viewBox='0 0 24 24'
							strokeWidth={2}
							stroke='currentColor'>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='M6 18 18 6M6 6l12 12'
							/>
						</svg>
					</button>
				</div>

				<div className='px-5 py-4 space-y-4'>
					<div>
						<label className='block text-xs font-medium text-gray-700 mb-1.5'>
							Название видео <span className='text-red-500'>*</span>
						</label>
						<input
							type='text'
							value={title}
							onChange={e => setTitle(e.target.value)}
							placeholder='Например: HP 2233'
							disabled={phase === 'uploading' || phase === 'active'}
							className='w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand disabled:bg-gray-50 disabled:text-gray-500'
							maxLength={200}
						/>
					</div>

					<div className='grid grid-cols-2 bg-gray-100 rounded-lg p-1'>
						<button
							type='button'
							onClick={() => setTab('phone')}
							disabled={phase === 'uploading' || phase === 'active'}
							className={`text-sm py-1.5 rounded-md transition-colors disabled:opacity-50 ${
								tab === 'phone'
									? 'bg-white shadow-sm text-gray-900'
									: 'text-gray-600 hover:text-gray-900'
							}`}>
							📱 С телефона
						</button>
						<button
							type='button'
							onClick={() => setTab('computer')}
							disabled={phase === 'uploading' || phase === 'active'}
							className={`text-sm py-1.5 rounded-md transition-colors disabled:opacity-50 ${
								tab === 'computer'
									? 'bg-white shadow-sm text-gray-900'
									: 'text-gray-600 hover:text-gray-900'
							}`}>
							💻 С компьютера
						</button>
					</div>

					{tab === 'computer' ? (
						<div>
							<button
								type='button'
								disabled={!titleIsValid || phase === 'uploading'}
								onClick={() => fileInputRef.current?.click()}
								className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
									titleIsValid && phase !== 'uploading'
										? 'border-gray-200 hover:border-gray-300 cursor-pointer'
										: 'border-gray-200 opacity-50 cursor-not-allowed'
								}`}>
								<input
									ref={fileInputRef}
									type='file'
									accept='video/*'
									onChange={onFileSelect}
									className='hidden'
								/>
								{phase === 'uploading' ? (
									<>
										<p className='text-sm text-gray-600 mb-2'>
											Загрузка… {progress}%
										</p>
										<div className='w-full bg-gray-200 rounded-full h-2'>
											<div
												className='bg-brand h-2 rounded-full transition-all duration-300'
												style={{ width: `${progress}%` }}
											/>
										</div>
									</>
								) : (
									<>
										<p className='text-sm text-gray-700 font-medium'>
											Выберите видеофайл
										</p>
										<p className='text-xs text-gray-400 mt-1'>
											MP4, WebM, MOV — до 2 GB
										</p>
									</>
								)}
							</button>
							{!titleIsValid && (
								<p className='text-xs text-gray-400 mt-2 text-center'>
									Сначала введите название
								</p>
							)}
							{error && (
								<p className='text-xs text-red-500 mt-2 text-center'>{error}</p>
							)}
						</div>
					) : debouncedTitle ? (
						<QrUploadTab
							title={debouncedTitle}
							onComplete={videoId => {
								onCreated(videoId);
								// Small delay so user sees the ✅ state briefly before modal closes
								setTimeout(onClose, 900);
							}}
						/>
					) : (
						<div className='py-8 text-center text-sm text-gray-400'>
							{titleIsValid ? 'Подождите…' : 'Сначала введите название.'}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
