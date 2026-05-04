'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
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
import { CHAT_TEMPLATE_BY_LANG } from '@/lib/constants/languages';
import {
	sendVideoFromChatSchema,
	type SendVideoFromChatInput,
} from '@/lib/schemas/messaging';
import type { SendLanguage } from '@/lib/schemas/send';

interface Video {
	id: string;
	title: string;
	thumbnail: string;
	youtubeId: string | null;
}

interface SendLandingModalProps {
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

export function SendLandingModal({
	conversationId,
	onClose,
	onSent,
}: SendLandingModalProps) {
	const [videos, setVideos] = useState<Video[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [apiError, setApiError] = useState('');
	// Tracks whether the agent has manually edited the chat-text field. While
	// untouched, switching language auto-rewrites the field with the new
	// language's default template. Once touched we leave it alone.
	const [chatTouched, setChatTouched] = useState(false);

	const form = useForm<SendVideoFromChatInput>({
		resolver: zodResolver(sendVideoFromChatSchema),
		mode: 'onTouched',
		defaultValues: {
			videoId: '',
			language: 'pl',
			personalNote: '',
			messageBody: CHAT_TEMPLATE_BY_LANG.pl,
			productUrl: '',
		},
	});

	useEffect(() => {
		fetch('/api/videos')
			.then(r => (r.ok ? r.json() : []))
			.then(data => {
				setVideos(Array.isArray(data) ? data : []);
				setLoading(false);
			})
			.catch(() => setLoading(false));
	}, []);

	const selectedVideoId = form.watch('videoId');
	const selectedLanguage = form.watch('language');

	// Re-fill chat template on language change while the agent hasn't edited it
	useEffect(() => {
		if (chatTouched) return;
		form.setValue('messageBody', CHAT_TEMPLATE_BY_LANG[selectedLanguage]);
	}, [selectedLanguage, chatTouched, form]);

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
						messageBody: data.messageBody?.trim() || undefined,
						productUrl: data.productUrl?.trim() || undefined,
					}),
				},
			);

			if (res.ok) {
				onSent();
			} else {
				const err = await res.json();
				setApiError(err.error || 'Ошибка отправки');
			}
		} catch {
			setApiError('Ошибка отправки');
		}
	}

	const filteredVideos = search
		? videos.filter(v => v.title.toLowerCase().includes(search.toLowerCase()))
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
								Отправить лендинг с видео-обзором
							</h2>
							<button
								type='button'
								onClick={onClose}
								className='text-gray-400 hover:text-gray-600'>
								<svg
									className='w-5 h-5'
									fill='none'
									viewBox='0 0 24 24'
									strokeWidth={2}
									stroke='currentColor'>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										d='M6 18L18 6M6 6l12 12'
									/>
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
								onChange={e => setSearch(e.target.value)}
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
											<div className='grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1'>
												{filteredVideos.map(video => (
													<button
														key={video.id}
														type='button'
														onClick={() => field.onChange(video.id)}
														className={`text-left rounded-lg overflow-hidden border-2 transition-all ${
															selectedVideoId === video.id
																? 'border-brand ring-2 ring-brand/20'
																: 'border-gray-100 hover:border-gray-200'
														}`}>
														{/* eslint-disable-next-line @next/next/no-img-element */}
														<img
															src={video.thumbnail}
															alt={video.title}
															className='w-full aspect-[16/10] object-cover bg-gray-100'
														/>
														<div className='p-1.5'>
															<p className='text-[11px] font-medium text-gray-900 line-clamp-2 leading-tight'>
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
										<FormLabel>Язык лендинга и шаблона</FormLabel>
										<div className='flex gap-2 flex-wrap'>
											{LANGUAGES.map(lang => (
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

							{/* Product URL — autofilled from the conversation when possible
							    (Allegro offer for ALLEGRO, email parser for EMAIL). Empty
							    value falls back to allegro.pl on the landing CTA. */}
							<FormField
								control={form.control}
								name='productUrl'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Ссылка на товар</FormLabel>
										<FormControl>
											<Input
												type='url'
												placeholder='https://allegro.pl/oferta/...'
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Chat message body — editable per-send */}
							<FormField
								control={form.control}
								name='messageBody'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Текст сообщения клиенту</FormLabel>
										<FormControl>
											<Textarea
												rows={4}
												{...field}
												onChange={e => {
													setChatTouched(true);
													field.onChange(e);
												}}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Personal note — appears on the landing page itself */}
							<FormField
								control={form.control}
								name='personalNote'
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											Заметка на странице лендинга (необязательно)
										</FormLabel>
										<FormControl>
											<Textarea
												rows={2}
												placeholder='Видна клиенту на самой странице лендинга, не в сообщении.'
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
