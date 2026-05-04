'use client';

import { useState, useEffect, useCallback } from 'react';
import { QuickReplyForm } from '@/components/dashboard/settings/quick-reply-form';
import { Button } from '@/components/ui/button';
import type { QuickReplyInput } from '@/lib/schemas/quick-reply';
import {
	listQuickReplies,
	createQuickReply,
	updateQuickReply,
	deleteQuickReply,
	type QuickReply,
} from '@/services/messaging/quick-replies.service';

const QR_ENABLED_KEY = 'messaging.quickReplies.enabled';

export default function QuickRepliesSettingsPage() {
	const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
	const [loading, setLoading] = useState(true);
	const [showModal, setShowModal] = useState(false);
	const [editingItem, setEditingItem] = useState<QuickReply | null>(null);
	// Per-browser preference. Default ON. Read once on mount via lazy
	// initialiser to dodge the react-hooks/set-state-in-effect rule.
	const [enabled, setEnabled] = useState<boolean>(() => {
		if (typeof window === 'undefined') return true;
		return window.localStorage.getItem(QR_ENABLED_KEY) !== 'false';
	});

	const toggleEnabled = () => {
		setEnabled((prev) => {
			const next = !prev;
			try {
				window.localStorage.setItem(QR_ENABLED_KEY, String(next));
				// Broadcast so any open MessageInput re-reads immediately
				// without waiting for navigation / refresh.
				window.dispatchEvent(
					new CustomEvent('messaging:quickReplies-toggle', { detail: next }),
				);
			} catch {}
			return next;
		});
	};

	const fetchItems = useCallback(async () => {
		try {
			setQuickReplies(await listQuickReplies());
		} catch { /* ignore */ }
		setLoading(false);
	}, []);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		fetchItems();
	}, [fetchItems]);

	const openCreate = () => {
		setEditingItem(null);
		setShowModal(true);
	};

	const openEdit = (qr: QuickReply) => {
		setEditingItem(qr);
		setShowModal(true);
	};

	const handleSave = async (data: QuickReplyInput) => {
		try {
			if (editingItem) {
				await updateQuickReply(editingItem.id, data);
			} else {
				await createQuickReply(data);
			}
			setShowModal(false);
			fetchItems();
		} catch { /* ignore */ }
	};

	const handleDelete = async (id: string) => {
		if (!confirm('Удалить этот быстрый ответ?')) return;
		try {
			await deleteQuickReply(id);
			setQuickReplies((prev) => prev.filter((qr) => qr.id !== id));
		} catch { /* ignore */ }
	};

	return (
		<div>
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Быстрые ответы</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Сокращения для частых ответов. Введите / в чате для вызова.
					</p>
				</div>
				<Button
					type='button'
					onClick={openCreate}
					className='bg-brand hover:bg-brand-hover text-white'>
					<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M12 4.5v15m7.5-7.5h-15' />
					</svg>
					Создать
				</Button>
			</div>

			{/* Master toggle for the / trigger in the chat composer. */}
			<label className='flex items-center justify-between gap-4 bg-white rounded-xl border border-gray-100 p-4 mb-4 cursor-pointer'>
				<div>
					<p className='text-sm font-medium text-gray-900'>
						Показывать быстрые ответы в чате
					</p>
					<p className='text-xs text-gray-500 mt-0.5'>
						Когда выключено, ввод «/» в окне сообщения не открывает
						подсказки и шаблоны не подставляются.
					</p>
				</div>
				<input
					type='checkbox'
					checked={enabled}
					onChange={toggleEnabled}
					className='w-5 h-5 accent-brand cursor-pointer flex-shrink-0'
				/>
			</label>

			{loading ? (
				<div className='text-center py-12 text-gray-400'>Загрузка...</div>
			) : quickReplies.length === 0 ? (
				<div className='text-center py-16 bg-white rounded-xl border border-gray-100'>
					<p className='text-sm text-gray-400'>Быстрых ответов пока нет</p>
				</div>
			) : (
				<div className='space-y-2'>
					{quickReplies.map((qr) => (
						<div
							key={qr.id}
							className='bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3'>
							<span className='text-xs font-mono text-brand bg-brand-light px-2 py-1 rounded flex-shrink-0 mt-0.5'>
								/{qr.shortcut}
							</span>
							<div className='flex-1 min-w-0'>
								<p className='text-sm font-medium text-gray-900'>{qr.title}</p>
								<p className='text-xs text-gray-500 mt-0.5 line-clamp-2'>
									{qr.body}
								</p>
							</div>
							<div className='flex gap-1 flex-shrink-0'>
								<button
									type='button'
									onClick={() => openEdit(qr)}
									className='p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50'>
									<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
										<path strokeLinecap='round' strokeLinejoin='round' d='m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10' />
									</svg>
								</button>
								<button
									type='button'
									onClick={() => handleDelete(qr.id)}
									className='p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50'>
									<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
										<path strokeLinecap='round' strokeLinejoin='round' d='m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' />
									</svg>
								</button>
							</div>
						</div>
					))}
				</div>
			)}

			{/* Create/Edit modal */}
			{showModal && (
				<div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
					<div
						className='absolute inset-0 bg-black/40'
						onClick={() => setShowModal(false)}
					/>
					<div className='relative bg-white rounded-2xl shadow-xl max-w-lg w-full'>
						<div className='p-6'>
							<h2 className='text-lg font-bold text-gray-900 mb-4'>
								{editingItem ? 'Редактировать' : 'Новый быстрый ответ'}
							</h2>
							<QuickReplyForm
								initialValue={
									editingItem
										? {
												shortcut: editingItem.shortcut,
												title: editingItem.title,
												body: editingItem.body,
											}
										: undefined
								}
								submitLabel='Сохранить'
								onSubmit={handleSave}
								onCancel={() => setShowModal(false)}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
