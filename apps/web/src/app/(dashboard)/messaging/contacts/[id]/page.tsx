'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChannelIcon, getChannelLabel } from '@/components/messaging/channel-icon';
import { getContact, type ContactDetail } from '@/services/messaging/contacts.service';

const STATUS_LABEL: Record<string, string> = {
	NEW: 'Новый',
	OPEN: 'Открыт',
	WAITING: 'Ожидание',
	CLOSED: 'Закрыт',
};

export default function ContactDetailPage() {
	const params = useParams();
	const contactId = params.id as string;
	const [contact, setContact] = useState<ContactDetail | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		getContact(contactId)
			.then((data) => setContact(data))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [contactId]);

	if (loading) {
		return <div className='text-center py-12 text-gray-400'>Загрузка...</div>;
	}

	if (!contact) {
		return (
			<div className='text-center py-16 bg-white rounded-xl border border-gray-100'>
				<p className='text-gray-400'>Контакт не найден</p>
				<Link href='/messaging/contacts' className='text-sm text-brand hover:underline mt-2 inline-block'>
					Вернуться к контактам
				</Link>
			</div>
		);
	}

	const customFields = contact.customFields || {};
	const customFieldEntries = Object.entries(customFields);

	return (
		<div>
			{/* Breadcrumb */}
			<div className='mb-6'>
				<Link href='/messaging/contacts' className='text-sm text-gray-400 hover:text-gray-600'>
					Контакты
				</Link>
				<span className='text-sm text-gray-300 mx-2'>/</span>
				<span className='text-sm text-gray-600'>{contact.name || 'Без имени'}</span>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
				{/* Contact profile */}
				<div className='lg:col-span-1'>
					<div className='bg-white rounded-xl border border-gray-100 p-5'>
						<div className='flex items-center gap-4 mb-4'>
							{contact.avatarUrl ? (
								<img
									src={contact.avatarUrl}
									alt={contact.name || ''}
									className='w-14 h-14 rounded-full object-cover'
								/>
							) : (
								<div className='w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-xl font-medium text-gray-600'>
									{(contact.name || '?')[0]?.toUpperCase()}
								</div>
							)}
							<div>
								<h1 className='text-lg font-bold text-gray-900'>
									{contact.name || 'Без имени'}
								</h1>
								{contact.company && (
									<p className='text-sm text-gray-400'>{contact.company}</p>
								)}
							</div>
						</div>

						<div className='space-y-3'>
							{contact.email && (
								<div className='flex items-center gap-3'>
									<svg className='w-4 h-4 text-gray-400 flex-shrink-0' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
										<path strokeLinecap='round' strokeLinejoin='round' d='M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75' />
									</svg>
									<span className='text-sm text-gray-600'>{contact.email}</span>
								</div>
							)}
							{contact.phone && (
								<div className='flex items-center gap-3'>
									<svg className='w-4 h-4 text-gray-400 flex-shrink-0' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
										<path strokeLinecap='round' strokeLinejoin='round' d='M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z' />
									</svg>
									<span className='text-sm text-gray-600'>{contact.phone}</span>
								</div>
							)}
						</div>

						{/* Channels */}
						{contact.channels && contact.channels.length > 0 && (
							<div className='mt-4 pt-4 border-t border-gray-100'>
								<h3 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>
									Каналы
								</h3>
								<div className='space-y-2'>
									{contact.channels.map((ch, idx) => (
										<div
											key={idx}
											className='flex items-center gap-2.5 p-2 bg-gray-50 rounded-lg'>
											<ChannelIcon channel={ch.type} size={16} />
											<div>
												<p className='text-sm font-medium text-gray-700'>
													{getChannelLabel(ch.type)}
												</p>
												<p className='text-xs text-gray-400'>
													{ch.externalId}
												</p>
											</div>
										</div>
									))}
								</div>
							</div>
						)}

						{/* Custom fields */}
						{customFieldEntries.length > 0 && (
							<div className='mt-4 pt-4 border-t border-gray-100'>
								<h3 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>
									Дополнительные поля
								</h3>
								<div className='space-y-2'>
									{customFieldEntries.map(([key, value]) => (
										<div key={key} className='flex justify-between text-sm'>
											<span className='text-gray-400'>{key}</span>
											<span className='text-gray-700'>{value}</span>
										</div>
									))}
								</div>
							</div>
						)}

						<div className='mt-4 pt-4 border-t border-gray-100'>
							<p className='text-xs text-gray-400'>
								Создан{' '}
								{new Date(contact.createdAt).toLocaleDateString('ru-RU', {
									day: 'numeric',
									month: 'long',
									year: 'numeric',
								})}
							</p>
						</div>
					</div>
				</div>

				{/* Conversation history */}
				<div className='lg:col-span-2'>
					<h2 className='text-sm font-semibold text-gray-900 mb-3'>
						История разговоров
					</h2>
					{!contact.conversations || contact.conversations.length === 0 ? (
						<div className='text-center py-12 bg-white rounded-xl border border-gray-100'>
							<p className='text-sm text-gray-400'>Нет разговоров с этим контактом</p>
						</div>
					) : (
						<div className='space-y-2'>
							{contact.conversations.map((conv) => (
								<Link
									key={conv.id}
									href={`/messaging/conversations/${conv.id}`}
									className='flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors'>
									<ChannelIcon channel={conv.channelType} size={20} />
									<div className='flex-1 min-w-0'>
										<div className='flex items-center gap-2'>
											<p className='text-sm font-medium text-gray-900 truncate'>
												{conv.lastMessagePreview || 'Нет сообщений'}
											</p>
											<span className='text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded flex-shrink-0'>
												{STATUS_LABEL[conv.status] || conv.status}
											</span>
										</div>
										<p className='text-xs text-gray-400 mt-0.5'>
											{new Date(conv.createdAt).toLocaleDateString('ru-RU', {
												day: 'numeric',
												month: 'short',
												year: 'numeric',
												hour: '2-digit',
												minute: '2-digit',
											})}
										</p>
									</div>
									<svg
										className='w-4 h-4 text-gray-300 flex-shrink-0'
										fill='none'
										viewBox='0 0 24 24'
										strokeWidth={1.5}
										stroke='currentColor'>
										<path
											strokeLinecap='round'
											strokeLinejoin='round'
											d='m8.25 4.5 7.5 7.5-7.5 7.5'
										/>
									</svg>
								</Link>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
