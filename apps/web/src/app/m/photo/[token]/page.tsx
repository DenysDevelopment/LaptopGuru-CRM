'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

type ItemState =
	| { kind: 'queued' }
	| { kind: 'uploading'; pct: number }
	| { kind: 'done'; messageId: string }
	| { kind: 'error'; message: string };

type Item = {
	id: string;
	file: File;
	preview: string;
	state: ItemState;
};

const UPLOAD_PATH = (token: string) => `/api/messaging/photo-upload/${token}`;

export default function MobilePhotoCapturePage() {
	const params = useParams();
	const token = params.token as string;
	const [items, setItems] = useState<Item[]>([]);
	const [tokenExpired, setTokenExpired] = useState(false);
	const cameraRef = useRef<HTMLInputElement>(null);
	const galleryRef = useRef<HTMLInputElement>(null);
	const isUploadingRef = useRef(false);

	const patchItem = useCallback((id: string, state: ItemState) => {
		setItems((prev) =>
			prev.map((it) => (it.id === id ? { ...it, state } : it)),
		);
	}, []);

	// Single-flight upload worker. Re-runs whenever items change; if nothing is
	// currently uploading and there's a queued item, it picks one and kicks off
	// the XHR. The ref guards re-entry; the microtask defers React state writes
	// out of the effect body (React 19 lint rule).
	useEffect(() => {
		if (isUploadingRef.current || tokenExpired) return;
		const next = items.find((i) => i.state.kind === 'queued');
		if (!next) return;

		isUploadingRef.current = true;
		queueMicrotask(() => {
			patchItem(next.id, { kind: 'uploading', pct: 0 });

			const fd = new FormData();
			fd.append('file', next.file);
			const xhr = new XMLHttpRequest();
			xhr.open('POST', UPLOAD_PATH(token));
			xhr.upload.onprogress = (ev) => {
				if (ev.lengthComputable) {
					const pct = Math.round((ev.loaded / ev.total) * 100);
					patchItem(next.id, { kind: 'uploading', pct });
				}
			};
			xhr.onload = () => {
				isUploadingRef.current = false;
				if (xhr.status >= 200 && xhr.status < 300) {
					let messageId = '';
					try {
						const data = JSON.parse(xhr.responseText) as { messageId?: string };
						messageId = data.messageId ?? '';
					} catch {
						/* server returned non-JSON 2xx; rare but harmless */
					}
					patchItem(next.id, { kind: 'done', messageId });
					return;
				}
				// Surface the real cause. Mapped strings for the well-known codes,
				// raw status + body slice for everything else — that's what
				// diagnoses "не удалось загрузить" in the wild (proxy 502 with
				// HTML page, Allegro 422 on HEIC, etc.).
				let message: string;
				const raw = xhr.responseText || '';
				try {
					const data = JSON.parse(raw) as { error?: string };
					if (data.error === 'expired') {
						message = 'Ссылка истекла — обновите QR на компьютере';
						setTokenExpired(true);
					} else if (data.error === 'too_large') {
						message = 'Файл больше 25 МБ — снимите в меньшем разрешении';
					} else if (data.error) {
						message = `Ошибка ${xhr.status}: ${data.error}`;
					} else {
						message = `Ошибка ${xhr.status}: пустой ответ`;
					}
				} catch {
					message = `Ошибка ${xhr.status}: ${raw.slice(0, 300) || '(пусто)'}`;
				}
				patchItem(next.id, { kind: 'error', message });
			};
			xhr.onerror = () => {
				isUploadingRef.current = false;
				patchItem(next.id, {
					kind: 'error',
					message:
						'Сеть оборвалась. Возможно, файл больше лимита прокси или нет связи.',
				});
			};
			xhr.send(fd);
		});
	}, [items, token, tokenExpired, patchItem]);

	function addFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		const newItems: Item[] = Array.from(files).map((file) => ({
			id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			file,
			preview: URL.createObjectURL(file),
			state: { kind: 'queued' },
		}));
		setItems((prev) => [...prev, ...newItems]);
	}

	function removeItem(id: string) {
		setItems((prev) => {
			const it = prev.find((x) => x.id === id);
			if (it) URL.revokeObjectURL(it.preview);
			return prev.filter((x) => x.id !== id);
		});
	}

	function retryItem(id: string) {
		patchItem(id, { kind: 'queued' });
	}

	// Free preview blob URLs when the page unmounts.
	useEffect(() => {
		return () => {
			setItems((prev) => {
				prev.forEach((it) => URL.revokeObjectURL(it.preview));
				return prev;
			});
		};
	}, []);

	const counts = {
		done: items.filter((i) => i.state.kind === 'done').length,
		uploading: items.filter((i) => i.state.kind === 'uploading').length,
		queued: items.filter((i) => i.state.kind === 'queued').length,
		error: items.filter((i) => i.state.kind === 'error').length,
	};

	return (
		<div className='min-h-dvh bg-gray-50 flex flex-col'>
			{/* Header */}
			<div className='sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3'>
				<div className='w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0'>
					<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z' />
						<path strokeLinecap='round' strokeLinejoin='round' d='M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z' />
					</svg>
				</div>
				<div className='min-w-0'>
					<h1 className='text-base font-semibold text-gray-900 leading-tight'>
						Фото для клиента
					</h1>
					{items.length > 0 ? (
						<p className='text-xs text-gray-500 leading-tight mt-0.5'>
							✓ {counts.done}
							{counts.uploading > 0 && ` • ↑ ${counts.uploading}`}
							{counts.queued > 0 && ` • ⏳ ${counts.queued}`}
							{counts.error > 0 && ` • ⚠ ${counts.error}`}
						</p>
					) : (
						<p className='text-xs text-gray-500 leading-tight mt-0.5'>
							Каждое фото уходит сразу
						</p>
					)}
				</div>
			</div>

			{/* Expired banner */}
			{tokenExpired && (
				<div className='mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800'>
					Ссылка истекла. Обновите QR на компьютере и отсканируйте заново.
				</div>
			)}

			{/* Items list / empty state */}
			{items.length > 0 ? (
				<div className='flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2'>
					{items.map((it) => (
						<ItemRow
							key={it.id}
							item={it}
							onRemove={() => removeItem(it.id)}
							onRetry={() => retryItem(it.id)}
						/>
					))}
				</div>
			) : (
				<div className='flex-1 flex flex-col items-center justify-center text-center px-8 text-gray-400'>
					<svg className='w-16 h-16 mb-3' fill='none' viewBox='0 0 24 24' strokeWidth={1.2} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z' />
					</svg>
					<p className='text-sm'>Снимите фото или выберите из галереи — можно несколько подряд.</p>
				</div>
			)}

			{/* Action bar */}
			<div className='sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3 flex gap-2'>
				<button
					type='button'
					onClick={() => cameraRef.current?.click()}
					disabled={tokenExpired}
					className='flex-1 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:bg-gray-300 text-white font-semibold rounded-xl py-3 transition-colors flex items-center justify-center gap-2'>
					<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z' />
						<path strokeLinecap='round' strokeLinejoin='round' d='M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z' />
					</svg>
					Камера
				</button>
				<button
					type='button'
					onClick={() => galleryRef.current?.click()}
					disabled={tokenExpired}
					className='flex-1 bg-gray-900 hover:bg-gray-800 active:bg-black disabled:bg-gray-300 text-white font-semibold rounded-xl py-3 transition-colors flex items-center justify-center gap-2'>
					<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z' />
					</svg>
					Галерея
				</button>
				{/* iOS Safari ignores `multiple` when `capture` is set, so we keep
				    the camera and gallery flows on separate inputs. */}
				<input
					ref={cameraRef}
					type='file'
					accept='image/*'
					capture='environment'
					className='hidden'
					onChange={(e) => {
						addFiles(e.target.files);
						e.target.value = '';
					}}
				/>
				<input
					ref={galleryRef}
					type='file'
					accept='image/*'
					multiple
					className='hidden'
					onChange={(e) => {
						addFiles(e.target.files);
						e.target.value = '';
					}}
				/>
			</div>
		</div>
	);
}

function ItemRow({
	item,
	onRemove,
	onRetry,
}: {
	item: Item;
	onRemove: () => void;
	onRetry: () => void;
}) {
	const { state } = item;
	const sizeKb = Math.round(item.file.size / 1024);
	const sizeLabel = sizeKb < 1024 ? `${sizeKb} KB` : `${(sizeKb / 1024).toFixed(1)} MB`;

	return (
		<div className='bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden'>
			<div className='flex items-center gap-3 p-2'>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={item.preview}
					alt=''
					className='w-14 h-14 rounded-lg object-cover bg-gray-100 flex-shrink-0'
				/>
				<div className='min-w-0 flex-1'>
					<div className='text-xs text-gray-700 truncate'>{item.file.name}</div>
					<div className='text-[11px] text-gray-400 mt-0.5'>{sizeLabel}</div>
					{state.kind === 'uploading' && (
						<div className='mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden'>
							<div
								className='h-full bg-orange-500 transition-all'
								style={{ width: `${state.pct}%` }}
							/>
						</div>
					)}
				</div>
				<div className='flex-shrink-0'>
					{state.kind === 'queued' && (
						<span className='text-[11px] text-gray-400'>Ждёт</span>
					)}
					{state.kind === 'uploading' && (
						<span className='text-[11px] text-orange-600 tabular-nums'>
							{state.pct}%
						</span>
					)}
					{state.kind === 'done' && (
						<div className='w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-600'>
							<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={3} stroke='currentColor'>
								<path strokeLinecap='round' strokeLinejoin='round' d='m4.5 12.75 6 6 9-13.5' />
							</svg>
						</div>
					)}
					{state.kind === 'error' && (
						<div className='w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-600'>
							<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={3} stroke='currentColor'>
								<path strokeLinecap='round' strokeLinejoin='round' d='M12 9v3.75m0 3.75h.008v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' />
							</svg>
						</div>
					)}
				</div>
				{(state.kind === 'queued' || state.kind === 'error' || state.kind === 'done') && (
					<button
						type='button'
						onClick={onRemove}
						className='flex-shrink-0 w-7 h-7 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-50 flex items-center justify-center'
						aria-label='Убрать'>
						<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
							<path strokeLinecap='round' strokeLinejoin='round' d='M6 18 18 6M6 6l12 12' />
						</svg>
					</button>
				)}
			</div>
			{state.kind === 'error' && (
				<div className='px-3 pb-3 pt-1 -mt-1 border-t border-red-100 bg-red-50/50 flex flex-col gap-2'>
					<pre className='text-[11px] text-red-700 font-mono whitespace-pre-wrap break-words leading-snug max-h-32 overflow-y-auto'>
						{state.message}
					</pre>
					<button
						type='button'
						onClick={onRetry}
						className='self-start text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800'>
						Повторить
					</button>
				</div>
			)}
		</div>
	);
}
