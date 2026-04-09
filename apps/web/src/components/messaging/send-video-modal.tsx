'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
	sendVideoFromChatSchema,
	type SendVideoFromChatInput,
} from '@/lib/schemas/messaging';
import type { SendLanguage } from '@/lib/schemas/send';
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

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

const LANGUAGES: { value: SendLanguage; label: string }[] = [
	{ value: 'pl', label: 'PL' },
	{ value: 'uk', label: 'UA' },
	{ value: 'ru', label: 'RU' },
	{ value: 'en', label: 'EN' },
	{ value: 'lt', label: 'LT' },
	{ value: 'et', label: 'ET' },
	{ value: 'lv', label: 'LV' },
];

export function SendVideoModal({ conversationId, onClose, onSent }: SendVideoModalProps) {
	const [videos, setVideos] = useState<Video[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [apiError, setApiError] = useState('');

	const form = useForm<SendVideoFromChatInput>({
		resolver: zodResolver(sendVideoFromChatSchema),
		mode: 'onTouched',
		defaultValues: {
			videoId: '',
			language: 'pl',
			personalNote: '',
		},
	});

	useEffect(() => {
		fetch('/api/videos')
			.then((r) => (r.ok ? r.json() : []))
			.then((data) => {
				setVideos(Array.isArray(data) ? data : []);
				setLoading(false);
			})
			.catch(() => setLoading(false));
	}, []);

	async function onSubmit(data: SendVideoFromChatInput) {
		setApiError('');
		try {
			const res = await fetch(
				`/api/messaging/conversations/${conversationId}/send-video`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						videoId: data.videoId,
						personalNote: data.personalNote?.trim() || undefined,
						language: data.language,
					}),
				},
			);

			if (res.ok) {
				const payload = await res.json();
				alert(`Видео-рецензия отправлена!\n${payload.shortUrl}`);
				onSent();
			} else {
				const err = await res.json();
				setApiError(err.error || 'Ошибка отправки');
			}
		} catch {
			setApiError('Ошибка отправки');
		}
	}

	const selectedVideoId = form.watch('videoId');
	const selectedLanguage = form.watch('language');
	const filteredVideos = search
		? videos.filter((v) => v.title.toLowerCase().includes(search.toLowerCase()))
		: videos;

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
			<div className='bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col'>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className='flex flex-col flex-1 min-h-0'>
						{/* Header */}
						<div className='p-5 border-b border-gray-100 flex items-center justify-between'>
							<h2 className='text-lg font-semibold text-gray-900'>
								Отправить видео-рецензию
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

						{/* Content */}
						<div className='flex-1 overflow-y-auto p-5 space-y-4'>
							{apiError && (
								<div className='bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3'>
									{apiError}
								</div>
							)}

							{/* Search */}
							<Input
								type='text'
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder='Поиск видео...'
							/>

							{/* Video grid */}
							<FormField
								control={form.control}
								name='videoId'
								render={({ field }) => (
									<FormItem>
										{loading ? (
											<div className='text-center py-8 text-gray-400 text-sm'>
												Загрузка видео...
											</div>
										) : filteredVideos.length === 0 ? (
											<div className='text-center py-8 text-gray-400 text-sm'>
												Видео не найдены
											</div>
										) : (
											<div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
												{filteredVideos.map((video) => (
													<button
														key={video.id}
														type='button'
														onClick={() =>
															field.onChange(video.id)
														}
														className={`text-left rounded-xl overflow-hidden border-2 transition-all ${
															selectedVideoId === video.id
																? 'border-brand ring-2 ring-brand/20'
																: 'border-gray-100 hover:border-gray-200'
														}`}>
														{/* eslint-disable-next-line @next/next/no-img-element */}
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
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Language */}
							<FormField
								control={form.control}
								name='language'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Язык письма</FormLabel>
										<div className='flex gap-2 flex-wrap'>
											{LANGUAGES.map((lang) => (
												<button
													key={lang.value}
													type='button'
													onClick={() => field.onChange(lang.value)}
													className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
														selectedLanguage === lang.value
															? 'bg-brand text-white'
															: 'bg-gray-100 text-gray-600 hover:bg-gray-200'
													}`}>
													{lang.label}
												</button>
											))}
										</div>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Personal note */}
							<FormField
								control={form.control}
								name='personalNote'
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											Персональная заметка (необязательно)
										</FormLabel>
										<FormControl>
											<Textarea
												rows={2}
												placeholder='Добрый день! Вот видео-рецензия на ваш ноутбук...'
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{/* Footer */}
						<div className='p-5 border-t border-gray-100 flex gap-3 justify-end'>
							<Button type='button' variant='outline' onClick={onClose}>
								Отмена
							</Button>
							<Button
								type='submit'
								disabled={form.formState.isSubmitting}
								className='bg-brand hover:bg-brand-hover text-white'>
								{form.formState.isSubmitting ? 'Отправка...' : 'Отправить'}
							</Button>
						</div>
					</form>
				</Form>
			</div>
		</div>
	);
}
