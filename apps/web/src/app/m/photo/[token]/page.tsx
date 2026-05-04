'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';

type Status =
	| { kind: 'idle' }
	| { kind: 'uploading'; pct: number }
	| { kind: 'done' }
	| { kind: 'error'; message: string };

export default function MobilePhotoCapturePage() {
	const params = useParams();
	const token = params.token as string;
	const [status, setStatus] = useState<Status>({ kind: 'idle' });
	const fileRef = useRef<HTMLInputElement>(null);

	async function uploadFile(file: File) {
		setStatus({ kind: 'uploading', pct: 0 });
		const fd = new FormData();
		fd.append('file', file);

		// Use XHR rather than fetch to get progress events.
		const xhr = new XMLHttpRequest();
		xhr.open('POST', `/api/messaging/photo-upload/${token}`);
		xhr.upload.onprogress = (ev) => {
			if (ev.lengthComputable) {
				const pct = Math.round((ev.loaded / ev.total) * 100);
				setStatus((s) => (s.kind === 'uploading' ? { ...s, pct } : s));
			}
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				setStatus({ kind: 'done' });
			} else {
				let msg = 'Не удалось загрузить';
				try {
					const data = JSON.parse(xhr.responseText) as { error?: string };
					if (data.error === 'expired') msg = 'Ссылка истекла';
					else if (data.error === 'too_large')
						msg = 'Файл слишком большой (макс. 25МБ)';
					else if (data.error) msg = data.error;
				} catch {}
				setStatus({ kind: 'error', message: msg });
			}
		};
		xhr.onerror = () => {
			setStatus({ kind: 'error', message: 'Сеть не отвечает' });
		};
		xhr.send(fd);
	}

	function onChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = '';
		if (!file) return;
		void uploadFile(file);
	}

	return (
		<div className='min-h-dvh bg-gray-50 flex flex-col items-center justify-center px-6 py-10'>
			<div className='w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center gap-4'>
				<div className='w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center text-orange-600'>
					<svg className='w-7 h-7' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z' />
						<path strokeLinecap='round' strokeLinejoin='round' d='M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z' />
					</svg>
				</div>

				<h1 className='text-lg font-semibold text-gray-900 text-center'>
					Сделайте фото для клиента
				</h1>
				<p className='text-sm text-gray-500 text-center -mt-2'>
					Фото уйдёт сразу в активный диалог.
				</p>

				{status.kind === 'idle' && (
					<>
						<button
							type='button'
							onClick={() => fileRef.current?.click()}
							className='w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold rounded-xl py-3 transition-colors'>
							Открыть камеру
						</button>
						<input
							ref={fileRef}
							type='file'
							accept='image/*'
							capture='environment'
							className='hidden'
							onChange={onChange}
						/>
						<p className='text-[11px] text-gray-400 text-center'>
							Или нажмите долго чтобы выбрать из галереи
						</p>
					</>
				)}

				{status.kind === 'uploading' && (
					<div className='w-full flex flex-col items-center gap-2'>
						<div className='w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin' />
						<p className='text-sm text-gray-600'>Загрузка {status.pct}%</p>
						<div className='w-full h-1.5 bg-gray-100 rounded-full overflow-hidden'>
							<div
								className='h-full bg-orange-500 transition-all'
								style={{ width: `${status.pct}%` }}
							/>
						</div>
					</div>
				)}

				{status.kind === 'done' && (
					<div className='flex flex-col items-center gap-3 py-2'>
						<div className='w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600'>
							<svg className='w-7 h-7' fill='none' viewBox='0 0 24 24' strokeWidth={2.5} stroke='currentColor'>
								<path strokeLinecap='round' strokeLinejoin='round' d='m4.5 12.75 6 6 9-13.5' />
							</svg>
						</div>
						<p className='text-sm font-semibold text-gray-900'>Отправлено клиенту</p>
						<button
							type='button'
							onClick={() => setStatus({ kind: 'idle' })}
							className='text-xs text-orange-600 underline'>
							Отправить ещё одно фото
						</button>
					</div>
				)}

				{status.kind === 'error' && (
					<div className='w-full flex flex-col items-center gap-3 py-2'>
						<p className='text-sm text-red-600 text-center'>{status.message}</p>
						<button
							type='button'
							onClick={() => setStatus({ kind: 'idle' })}
							className='text-xs px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800'>
							Попробовать снова
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
