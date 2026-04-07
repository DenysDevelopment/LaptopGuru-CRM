'use client';

import { useState, useEffect } from 'react';

interface Video {
	id: string;
	title: string;
	thumbnail: string;
	youtubeId: string;
}

interface SendVideoModalProps {
	conversationId: string;
	onClose: () => void;
	onSent: () => void;
}

export function SendVideoModal({ conversationId, onClose, onSent }: SendVideoModalProps) {
	const [videos, setVideos] = useState<Video[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
	const [personalNote, setPersonalNote] = useState('');
	const [language, setLanguage] = useState('pl');
	const [sending, setSending] = useState(false);
	const [search, setSearch] = useState('');

	useEffect(() => {
		fetch('/api/videos')
			.then((r) => (r.ok ? r.json() : []))
			.then((data) => {
				setVideos(Array.isArray(data) ? data : []);
				setLoading(false);
			})
			.catch(() => setLoading(false));
	}, []);

	const handleSend = async () => {
		if (!selectedVideo || sending) return;
		setSending(true);

		try {
			const res = await fetch(`/api/messaging/conversations/${conversationId}/send-video`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					videoId: selectedVideo,
					personalNote: personalNote.trim() || undefined,
					language,
				}),
			});

			if (res.ok) {
				const data = await res.json();
				alert(`Видео-рецензия отправлена!\n${data.shortUrl}`);
				onSent();
			} else {
				const err = await res.json();
				alert(err.error || 'Ошибка отправки');
			}
		} catch {
			alert('Ошибка отправки');
		}
		setSending(false);
	};

	const filteredVideos = search
		? videos.filter((v) => v.title.toLowerCase().includes(search.toLowerCase()))
		: videos;

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
			<div className='bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col'>
				{/* Header */}
				<div className='p-5 border-b border-gray-100 flex items-center justify-between'>
					<h2 className='text-lg font-semibold text-gray-900'>
						Отправить видео-рецензию
					</h2>
					<button
						onClick={onClose}
						className='text-gray-400 hover:text-gray-600'>
						<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
							<path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
						</svg>
					</button>
				</div>

				{/* Content */}
				<div className='flex-1 overflow-y-auto p-5 space-y-4'>
					{/* Search */}
					<input
						type='text'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder='Поиск видео...'
						className='w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand'
					/>

					{/* Video grid */}
					{loading ? (
						<div className='text-center py-8 text-gray-400 text-sm'>Загрузка видео...</div>
					) : filteredVideos.length === 0 ? (
						<div className='text-center py-8 text-gray-400 text-sm'>Видео не найдены</div>
					) : (
						<div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
							{filteredVideos.map((video) => (
								<button
									key={video.id}
									onClick={() => setSelectedVideo(video.id)}
									className={`text-left rounded-xl overflow-hidden border-2 transition-all ${
										selectedVideo === video.id
											? 'border-brand ring-2 ring-brand/20'
											: 'border-gray-100 hover:border-gray-200'
									}`}>
									<img
										src={video.thumbnail}
										alt={video.title}
										className='w-full aspect-video object-cover'
									/>
									<div className='p-2'>
										<p className='text-xs font-medium text-gray-900 line-clamp-2'>
											{video.title}
										</p>
									</div>
								</button>
							))}
						</div>
					)}

					{/* Language */}
					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>Язык письма</label>
						<div className='flex gap-2'>
							{[
								{ value: 'pl', label: 'PL' },
								{ value: 'uk', label: 'UA' },
								{ value: 'ru', label: 'RU' },
								{ value: 'en', label: 'EN' },
								{ value: 'lt', label: 'LT' },
								{ value: 'et', label: 'ET' },
								{ value: 'lv', label: 'LV' },
							].map((lang) => (
								<button
									key={lang.value}
									onClick={() => setLanguage(lang.value)}
									className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
										language === lang.value
											? 'bg-brand text-white'
											: 'bg-gray-100 text-gray-600 hover:bg-gray-200'
									}`}>
									{lang.label}
								</button>
							))}
						</div>
					</div>

					{/* Personal note */}
					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Персональная заметка (необязательно)
						</label>
						<textarea
							value={personalNote}
							onChange={(e) => setPersonalNote(e.target.value)}
							rows={2}
							placeholder='Добрый день! Вот видео-рецензия на ваш ноутбук...'
							className='w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none'
						/>
					</div>
				</div>

				{/* Footer */}
				<div className='p-5 border-t border-gray-100 flex gap-3 justify-end'>
					<button
						onClick={onClose}
						className='px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors'>
						Отмена
					</button>
					<button
						onClick={handleSend}
						disabled={!selectedVideo || sending}
						className='px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50'>
						{sending ? 'Отправка...' : 'Отправить'}
					</button>
				</div>
			</div>
		</div>
	);
}
