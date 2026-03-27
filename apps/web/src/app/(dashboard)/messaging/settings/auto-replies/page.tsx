'use client';

import { useState, useEffect } from 'react';
import { normalizeListResponse } from '@/lib/utils/normalize-response';

interface AutoReply {
	id: string;
	name: string;
	triggerType: string;
	triggerValue: string | null;
	body: string;
	enabled: boolean;
	channelType: string | null;
	createdAt: string;
}

const TRIGGER_TYPES = [
	{ value: 'NEW_CONVERSATION', label: 'Новый разговор' },
	{ value: 'KEYWORD', label: 'Ключевое слово' },
	{ value: 'OUTSIDE_HOURS', label: 'Нерабочее время' },
	{ value: 'NO_AGENT', label: 'Нет свободных операторов' },
	{ value: 'WAIT_TIMEOUT', label: 'Таймаут ожидания' },
];

export default function AutoRepliesSettingsPage() {
	const [autoReplies, setAutoReplies] = useState<AutoReply[]>([]);
	const [loading, setLoading] = useState(true);
	const [showModal, setShowModal] = useState(false);
	const [editingItem, setEditingItem] = useState<AutoReply | null>(null);
	const [name, setName] = useState('');
	const [triggerType, setTriggerType] = useState('NEW_CONVERSATION');
	const [triggerValue, setTriggerValue] = useState('');
	const [body, setBody] = useState('');
	const [channelType, setChannelType] = useState('');
	const [saving, setSaving] = useState(false);

	const fetchItems = async () => {
		try {
			const res = await fetch('/api/messaging/auto-replies');
			if (res.ok) {
				const data = await res.json();
				setAutoReplies(normalizeListResponse(data));
			}
		} catch { /* ignore */ }
		setLoading(false);
	};

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		fetchItems();
	}, []);

	const openCreate = () => {
		setEditingItem(null);
		setName('');
		setTriggerType('NEW_CONVERSATION');
		setTriggerValue('');
		setBody('');
		setChannelType('');
		setShowModal(true);
	};

	const openEdit = (item: AutoReply) => {
		setEditingItem(item);
		setName(item.name);
		setTriggerType(item.triggerType);
		setTriggerValue(item.triggerValue || '');
		setBody(item.body);
		setChannelType(item.channelType || '');
		setShowModal(true);
	};

	const handleSave = async () => {
		if (!name.trim() || !body.trim() || saving) return;
		setSaving(true);
		try {
			const url = editingItem
				? `/api/messaging/auto-replies/${editingItem.id}`
				: '/api/messaging/auto-replies';
			const method = editingItem ? 'PATCH' : 'POST';
			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: name.trim(),
					triggerType,
					triggerValue: triggerValue.trim() || null,
					body: body.trim(),
					channelType: channelType || null,
				}),
			});
			if (res.ok) {
				setShowModal(false);
				fetchItems();
			}
		} catch { /* ignore */ }
		setSaving(false);
	};

	const toggleEnabled = async (id: string, enabled: boolean) => {
		try {
			await fetch(`/api/messaging/auto-replies/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled }),
			});
			setAutoReplies((prev) =>
				prev.map((ar) => (ar.id === id ? { ...ar, enabled } : ar)),
			);
		} catch { /* ignore */ }
	};

	const getTriggerLabel = (type: string) =>
		TRIGGER_TYPES.find((t) => t.value === type)?.label || type;

	return (
		<div>
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Авто-ответы</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Автоматические ответы по правилам
					</p>
				</div>
				<button
					onClick={openCreate}
					className='inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2.5 rounded-lg transition-colors text-sm'>
					<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M12 4.5v15m7.5-7.5h-15' />
					</svg>
					Создать правило
				</button>
			</div>

			{loading ? (
				<div className='text-center py-12 text-gray-400'>Загрузка...</div>
			) : autoReplies.length === 0 ? (
				<div className='text-center py-16 bg-white rounded-xl border border-gray-100'>
					<p className='text-sm text-gray-400'>Нет правил авто-ответов</p>
				</div>
			) : (
				<div className='space-y-2'>
					{autoReplies.map((ar) => (
						<div
							key={ar.id}
							className='bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-4'>
							<div className='flex-1 min-w-0 cursor-pointer' onClick={() => openEdit(ar)}>
								<div className='flex items-center gap-2 mb-1'>
									<h3 className='text-sm font-medium text-gray-900'>{ar.name}</h3>
									<span className='text-[10px] font-medium text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded'>
										{getTriggerLabel(ar.triggerType)}
									</span>
									{ar.channelType && (
										<span className='text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded'>
											{ar.channelType}
										</span>
									)}
								</div>
								{ar.triggerValue && (
									<p className='text-xs text-brand mb-1'>
										Триггер: {ar.triggerValue}
									</p>
								)}
								<p className='text-xs text-gray-500 line-clamp-2'>{ar.body}</p>
							</div>
							<label className='relative inline-flex items-center cursor-pointer flex-shrink-0'>
								<input
									type='checkbox'
									checked={ar.enabled}
									onChange={(e) => toggleEnabled(ar.id, e.target.checked)}
									className='sr-only peer'
								/>
								<div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand" />
							</label>
						</div>
					))}
				</div>
			)}

			{/* Create/Edit modal */}
			{showModal && (
				<div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
					<div className='absolute inset-0 bg-black/40' onClick={() => setShowModal(false)} />
					<div className='relative bg-white rounded-2xl shadow-xl max-w-lg w-full'>
						<div className='p-6'>
							<h2 className='text-lg font-bold text-gray-900 mb-4'>
								{editingItem ? 'Редактировать правило' : 'Новое правило'}
							</h2>

							<div className='mb-4'>
								<label className='block text-sm font-medium text-gray-700 mb-1'>Название</label>
								<input
									type='text'
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder='Приветствие новых клиентов'
									className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
								/>
							</div>

							<div className='mb-4'>
								<label className='block text-sm font-medium text-gray-700 mb-1'>Триггер</label>
								<select
									value={triggerType}
									onChange={(e) => setTriggerType(e.target.value)}
									className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand'>
									{TRIGGER_TYPES.map((t) => (
										<option key={t.value} value={t.value}>{t.label}</option>
									))}
								</select>
							</div>

							{triggerType === 'KEYWORD' && (
								<div className='mb-4'>
									<label className='block text-sm font-medium text-gray-700 mb-1'>
										Ключевое слово
									</label>
									<input
										type='text'
										value={triggerValue}
										onChange={(e) => setTriggerValue(e.target.value)}
										placeholder='цена, прайс, стоимость'
										className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
									/>
								</div>
							)}

							<div className='mb-4'>
								<label className='block text-sm font-medium text-gray-700 mb-1'>Канал (необязательно)</label>
								<select
									value={channelType}
									onChange={(e) => setChannelType(e.target.value)}
									className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand'>
									<option value=''>Все каналы</option>
									<option value='EMAIL'>Email</option>
									<option value='SMS'>SMS</option>
									<option value='WHATSAPP'>WhatsApp</option>
									<option value='TELEGRAM'>Telegram</option>
								</select>
							</div>

							<div className='mb-4'>
								<label className='block text-sm font-medium text-gray-700 mb-1'>Текст ответа</label>
								<textarea
									value={body}
									onChange={(e) => setBody(e.target.value)}
									rows={4}
									placeholder='Здравствуйте! Мы получили ваше сообщение и скоро ответим.'
									className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400 resize-none'
								/>
							</div>

							<div className='flex gap-3'>
								<button
									onClick={() => setShowModal(false)}
									className='flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors'>
									Отмена
								</button>
								<button
									onClick={handleSave}
									disabled={!name.trim() || !body.trim() || saving}
									className='flex-1 px-4 py-2.5 text-sm font-medium text-white bg-brand hover:bg-brand-hover rounded-xl transition-colors disabled:opacity-50'>
									{saving ? 'Сохранение...' : 'Сохранить'}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
