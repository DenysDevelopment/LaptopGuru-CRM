'use client';

import { AddVideoModal } from '@/components/dashboard/send/add-video-modal';
import { VideoStatusBadge } from '@/components/dashboard/videos/video-status-badge';
import { YouTubeChannelCard } from '@/components/dashboard/videos/youtube-channel-card';
import { EmptyState } from '@/components/ui/empty-state';
import type { Video } from '@/types';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/use-confirm';

function formatFileSize(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	if (mb < 1) return `${Math.round(mb * 1024)} KB`;
	if (mb < 1024) return `${mb.toFixed(1)} MB`;
	return `${(mb / 1024).toFixed(2)} GB`;
}

export default function VideosPage() {
	const confirm = useConfirm();
	const [videos, setVideos] = useState<Video[]>([]);
	const [loading, setLoading] = useState(true);
	const [modalOpen, setModalOpen] = useState(false);

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

	async function handleDelete(id: string) {
		const ok = await confirm({
			title: 'Удалить видео?',
			description: 'Видео будет удалено из библиотеки. Это действие нельзя отменить.',
			confirmLabel: 'Удалить',
			cancelLabel: 'Отмена',
			variant: 'destructive',
		});
		if (!ok) return;
		const r = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
		if (r.ok) {
			toast.success('Видео удалено');
			fetchVideos();
		} else {
			toast.error('Не удалось удалить видео', { description: `HTTP ${r.status}` });
		}
	}

	return (
		<div>
			<div className='mb-6 flex items-center justify-between'>
				<h1 className='text-2xl font-bold text-gray-900'>Видео</h1>
				<button
					type='button'
					onClick={() => setModalOpen(true)}
					className='bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-1.5'
					aria-label='Добавить новое видео'>
					<svg
						className='w-4 h-4'
						fill='none'
						viewBox='0 0 24 24'
						strokeWidth={2.2}
						stroke='currentColor'>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							d='M12 4.5v15m7.5-7.5h-15'
						/>
					</svg>
					Добавить
				</button>
			</div>

			<YouTubeChannelCard onSyncComplete={fetchVideos} />

			<AddVideoModal
				open={modalOpen}
				onClose={() => setModalOpen(false)}
				onCreated={() => fetchVideos()}
			/>

			{loading ? (
				<div className='text-center py-12 text-gray-400'>Загрузка...</div>
			) : videos.length === 0 ? (
				<EmptyState
					title='Видео пока нет'
					subtitle='Нажмите «Добавить», чтобы загрузить первое видео'
				/>
			) : (
				<div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'>
					{videos.map(video => (
						<div
							key={video.id}
							className='bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-gray-200 transition-colors group'>
							<div className='relative aspect-[9/16] bg-black'>
								{video.thumbnail &&
								video.status !== 'UPLOADING' &&
								video.status !== 'PROCESSING' ? (
									<Image
										src={video.thumbnail}
										alt={video.title}
										fill
										className='object-cover'
										sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
									/>
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
								{video.fileSize != null && video.fileSize > 0 && (
									<span className='absolute bottom-2 left-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded'>
										{formatFileSize(video.fileSize)}
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
											? new Date(video.createdAt).toLocaleString('ru-RU', {
													day: '2-digit',
													month: '2-digit',
													year: 'numeric',
													hour: '2-digit',
													minute: '2-digit',
												})
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
