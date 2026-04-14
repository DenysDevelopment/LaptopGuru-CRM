'use client';

import { VideoStatusBadge } from '@/components/dashboard/videos/video-status-badge';
import { VideoUploader } from '@/components/dashboard/videos/video-uploader';
import { YouTubeChannelCard } from '@/components/dashboard/videos/youtube-channel-card';
import { EmptyState } from '@/components/ui/empty-state';
import type { Video } from '@/types';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function VideosPage() {
	const [videos, setVideos] = useState<Video[]>([]);
	const [loading, setLoading] = useState(true);
	const [url, setUrl] = useState('');
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState('');

	const fetchVideos = useCallback(async () => {
		try {
			const res = await fetch('/api/videos');
			if (!res.ok) {
				setLoading(false);
				return;
			}
			const data = await res.json();
			setVideos(Array.isArray(data) ? data : []);
		} catch {
			/* ignore */
		}
		setLoading(false);
	}, []);

	const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching pattern
		void fetchVideos();
		const interval = setInterval(() => void fetchVideos(), 300_000);
		return () => clearInterval(interval);
	}, [fetchVideos]);

	// Faster polling when there are uploading/processing videos
	useEffect(() => {
		const hasProcessing = videos.some(
			v => v.status === 'UPLOADING' || v.status === 'PROCESSING',
		);
		if (hasProcessing && !pollingRef.current) {
			pollingRef.current = setInterval(() => void fetchVideos(), 3_000);
		} else if (!hasProcessing && pollingRef.current) {
			clearInterval(pollingRef.current);
			pollingRef.current = null;
		}
		return () => {
			if (pollingRef.current) {
				clearInterval(pollingRef.current);
				pollingRef.current = null;
			}
		};
	}, [videos, fetchVideos]);

	async function handleAdd(e: React.FormEvent) {
		e.preventDefault();
		setError('');
		setAdding(true);

		try {
			const res = await fetch('/api/videos', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url }),
			});
			const data = await res.json();
			if (!res.ok) setError(data.error);
			else {
				setUrl('');
				fetchVideos();
			}
		} catch {
			setError('Ошибка соединения');
		}

		setAdding(false);
	}

	async function handleDelete(id: string) {
		if (!confirm('Удалить это видео из библиотеки?')) return;
		await fetch(`/api/videos/${id}`, { method: 'DELETE' });
		fetchVideos();
	}

	return (
		<div>
			<div className='mb-6'>
				<h1 className='text-2xl font-bold text-gray-900'>Видео</h1>
			</div>

			<YouTubeChannelCard onSyncComplete={fetchVideos} />

			<VideoUploader onUploadComplete={fetchVideos} />

			<form onSubmit={handleAdd} className='mb-8'>
				<div className='flex gap-3'>
					<input
						type='text'
						value={url}
						onChange={e => setUrl(e.target.value)}
						placeholder='Ссылка на YouTube видео...'
						className='flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:ring-2 focus:ring-brand-muted outline-none transition-colors'
					/>
					<button
						type='submit'
						disabled={adding || !url.trim()}
						className='bg-brand hover:bg-brand-hover text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap'>
						{adding ? 'Добавление...' : 'Добавить'}
					</button>
				</div>
				{error && <p className='text-sm text-red-500 mt-2'>{error}</p>}
			</form>

			{loading ? (
				<div className='text-center py-12 text-gray-400'>Загрузка...</div>
			) : videos.length === 0 ? (
				<EmptyState
					title='Видео пока нет'
					subtitle='Добавьте первое видео, вставив ссылку выше'
				/>
			) : (
				<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
					{videos.map(video => (
						<div
							key={video.id}
							className='bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-gray-200 transition-colors group'>
							<div className='relative aspect-video bg-gray-100'>
								{video.thumbnail &&
								video.status !== 'UPLOADING' &&
								video.status !== 'PROCESSING' ? (
									video.thumbnail.includes('ytimg') ? (
										<Image
											src={video.thumbnail}
											alt={video.title}
											fill
											className='object-cover'
											sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
										/>
									) : (
										<p>фото</p>
									)
								) : (
									<div className='absolute inset-0 flex flex-col items-center justify-center text-gray-400'>
										<svg
											className='w-8 h-8 animate-spin mb-2'
											viewBox='0 0 24 24'
											fill='none'>
											<circle
												className='opacity-25'
												cx='12'
												cy='12'
												r='10'
												stroke='currentColor'
												strokeWidth='4'
											/>
											<path
												className='opacity-75'
												fill='currentColor'
												d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z'
											/>
										</svg>
										<span className='text-xs'>
											{video.status === 'UPLOADING'
												? 'Загрузка...'
												: 'Обработка...'}
										</span>
									</div>
								)}
								{video.duration && (
									<span className='absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded'>
										{video.duration}
									</span>
								)}
							</div>
							<div className='p-3'>
								<h3 className='text-sm font-medium text-gray-900 line-clamp-2'>
									{video.title}
								</h3>
								<div className='flex items-center gap-2 mt-1'>
									{video.channelTitle && (
										<span className='text-xs text-gray-400'>
											{video.channelTitle}
										</span>
									)}
									{video.source === 'S3' && video.status !== 'READY' && (
										<VideoStatusBadge status={video.status} />
									)}
									{video.source === 'S3' && video.status === 'READY' && (
										<span className='text-xs text-gray-400'>S3</span>
									)}
								</div>
								<div className='flex items-center justify-between mt-3'>
									<span className='text-xs text-gray-400'>
										{video.createdAt
											? new Date(video.createdAt).toLocaleDateString('ru-RU')
											: ''}
									</span>
									<div className='flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
										<button
											onClick={() => handleDelete(video.id)}
											className='text-xs text-gray-400 hover:text-red-500 transition-colors'>
											Удалить
										</button>
									</div>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
