'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChannelIcon } from '@/components/messaging/channel-icon';
import { listContacts, type ContactListItem } from '@/services/messaging/contacts.service';

export default function ContactsPage() {
	const [contacts, setContacts] = useState<ContactListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(false);

	const fetchContacts = useCallback(async (pageNum: number, append: boolean) => {
		if (!append) setLoading(true);
		setError(null);
		try {
			const list = await listContacts({
				page: pageNum,
				limit: 25,
				...(search ? { search } : {}),
			});

			if (append) {
				setContacts((prev) => [...prev, ...list]);
			} else {
				setContacts(list);
			}
			setHasMore(list.length >= 25);
		} catch {
			setError('Ошибка сети. Проверьте подключение.');
		} finally {
			setLoading(false);
		}
	}, [search]);

	useEffect(() => {
		setPage(1);
		fetchContacts(1, false);
	}, [fetchContacts]);

	const loadMore = () => {
		const next = page + 1;
		setPage(next);
		fetchContacts(next, true);
	};

	return (
		<div>
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Контакты</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Все контакты из мессенджера
					</p>
				</div>
			</div>

			{/* Search */}
			<div className='mb-4'>
				<div className='relative max-w-md'>
					<svg
						className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400'
						fill='none'
						viewBox='0 0 24 24'
						strokeWidth={1.5}
						stroke='currentColor'>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							d='m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z'
						/>
					</svg>
					<input
						type='text'
						placeholder='Поиск по имени, email, телефону...'
						aria-label='Поиск контактов'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className='w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
					/>
				</div>
			</div>

			{/* Table */}
			{/* Error state */}
			{error && (
				<div className='mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 flex items-center gap-2' role='alert'>
					<svg className='w-4 h-4 flex-shrink-0' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z' />
					</svg>
					{error}
					<button onClick={() => fetchContacts(1, false)} className='ml-auto text-red-700 hover:text-red-900 font-medium'>
						Повторить
					</button>
				</div>
			)}

			{loading && contacts.length === 0 ? (
				<div className='bg-white rounded-xl border border-gray-100 overflow-hidden' aria-busy='true' aria-label='Загрузка контактов'>
					{[...Array(5)].map((_, i) => (
						<div key={i} className='flex items-center gap-4 px-4 py-3 border-b border-gray-50 animate-pulse'>
							<div className='w-8 h-8 rounded-full bg-gray-200' />
							<div className='flex-1 space-y-2'>
								<div className='h-3 bg-gray-200 rounded w-32' />
								<div className='h-2 bg-gray-100 rounded w-24' />
							</div>
							<div className='h-3 bg-gray-100 rounded w-16' />
						</div>
					))}
				</div>
			) : contacts.length === 0 ? (
				<div className='text-center py-16 bg-white rounded-xl border border-gray-100'>
					<svg
						className='w-12 h-12 mx-auto text-gray-300 mb-3'
						fill='none'
						viewBox='0 0 24 24'
						strokeWidth={1}
						stroke='currentColor'>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							d='M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z'
						/>
					</svg>
					<p className='text-sm text-gray-400'>Контактов пока нет</p>
				</div>
			) : (
				<div className='bg-white rounded-xl border border-gray-100 overflow-hidden'>
					<div className='overflow-x-auto'>
						<table className='w-full'>
							<thead>
								<tr className='border-b border-gray-100'>
									<th className='text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3'>
										Имя
									</th>
									<th className='text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3'>
										Контакт
									</th>
									<th className='text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3'>
										Каналы
									</th>
									<th className='text-center text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3'>
										Разговоры
									</th>
									<th className='text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3'>
										Дата
									</th>
								</tr>
							</thead>
							<tbody>
								{contacts.map((contact) => (
									<tr
										key={contact.id}
										className='border-b border-gray-50 hover:bg-gray-50 transition-colors'>
										<td className='px-4 py-3'>
											<Link
												href={`/messaging/contacts/${contact.id}`}
												className='flex items-center gap-3'>
												{contact.avatarUrl ? (
													<img
														src={contact.avatarUrl}
														alt={contact.name || ''}
														className='w-8 h-8 rounded-full object-cover'
													/>
												) : (
													<div className='w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600'>
														{(contact.name || '?')[0]?.toUpperCase()}
													</div>
												)}
												<div className='min-w-0'>
													<p className='text-sm font-medium text-gray-900 truncate'>
														{contact.name || 'Без имени'}
													</p>
													{contact.company && (
														<p className='text-xs text-gray-400'>
															{contact.company}
														</p>
													)}
												</div>
											</Link>
										</td>
										<td className='px-4 py-3'>
											<div className='text-sm text-gray-600'>
												{contact.email && (
													<p className='truncate'>{contact.email}</p>
												)}
												{contact.phone && (
													<p className='text-xs text-gray-400'>
														{contact.phone}
													</p>
												)}
											</div>
										</td>
										<td className='px-4 py-3'>
											<div className='flex items-center gap-1.5'>
												{contact.channels?.map((ch, idx) => (
													<ChannelIcon
														key={idx}
														channel={ch.type}
														size={16}
													/>
												))}
											</div>
										</td>
										<td className='px-4 py-3 text-center'>
											<span className='text-sm text-gray-600'>
												{contact.conversationCount || 0}
											</span>
										</td>
										<td className='px-4 py-3 text-right'>
											<span className='text-xs text-gray-400'>
												{new Date(contact.createdAt).toLocaleDateString(
													'ru-RU',
													{
														day: 'numeric',
														month: 'short',
														year: 'numeric',
													},
												)}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{hasMore && (
						<div className='text-center py-3 border-t border-gray-50'>
							<button
								onClick={loadMore}
								className='text-sm text-brand hover:underline'>
								Загрузить ещё
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
