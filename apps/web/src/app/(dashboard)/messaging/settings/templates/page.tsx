'use client';

import { useState, useEffect } from 'react';
import { normalizeListResponse } from '@/lib/utils/normalize-response';

interface Template {
	id: string;
	name: string;
	body: string;
	channelType: string | null;
	status: string;
	variables: string[];
	createdAt: string;
}

const STATUS_BADGES: Record<string, { label: string; class: string }> = {
	DRAFT: { label: 'Черновик', class: 'bg-gray-100 text-gray-600' },
	PENDING: { label: 'На проверке', class: 'bg-amber-100 text-amber-700' },
	APPROVED: { label: 'Одобрен', class: 'bg-green-100 text-green-700' },
	ACTIVE: { label: 'Активен', class: 'bg-green-100 text-green-700' },
	REJECTED: { label: 'Отклонён', class: 'bg-red-100 text-red-700' },
};

export default function TemplatesSettingsPage() {
	const [templates, setTemplates] = useState<Template[]>([]);
	const [loading, setLoading] = useState(true);
	const [showModal, setShowModal] = useState(false);
	const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
	const [name, setName] = useState('');
	const [body, setBody] = useState('');
	const [channelType, setChannelType] = useState('');
	const [saving, setSaving] = useState(false);

	const fetchTemplates = async () => {
		try {
			const res = await fetch('/api/messaging/templates');
			if (res.ok) {
				const data = await res.json();
				setTemplates(normalizeListResponse(data));
			}
		} catch { /* ignore */ }
		setLoading(false);
	};

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		fetchTemplates();
	}, []);

	const openCreate = () => {
		setEditingTemplate(null);
		setName('');
		setBody('');
		setChannelType('');
		setShowModal(true);
	};

	const openEdit = (t: Template) => {
		setEditingTemplate(t);
		setName(t.name);
		setBody(t.body);
		setChannelType(t.channelType || '');
		setShowModal(true);
	};

	const handleSave = async () => {
		if (!name.trim() || !body.trim() || saving) return;
		setSaving(true);
		try {
			const url = editingTemplate
				? `/api/messaging/templates/${editingTemplate.id}`
				: '/api/messaging/templates';
			const method = editingTemplate ? 'PATCH' : 'POST';
			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: name.trim(),
					body: body.trim(),
					channelType: channelType || null,
				}),
			});
			if (res.ok) {
				setShowModal(false);
				fetchTemplates();
			}
		} catch { /* ignore */ }
		setSaving(false);
	};

	// Extract variables like {{name}} from template body
	const extractVariables = (text: string): string[] => {
		const matches = text.match(/\{\{(\w+)\}\}/g) || [];
		return [...new Set(matches.map((m) => m.replace(/[{}]/g, '')))];
	};

	const currentVars = extractVariables(body);

	return (
		<div>
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Шаблоны</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Шаблоны сообщений для каналов
					</p>
				</div>
				<button
					onClick={openCreate}
					className='inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2.5 rounded-lg transition-colors text-sm'>
					<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M12 4.5v15m7.5-7.5h-15' />
					</svg>
					Создать шаблон
				</button>
			</div>

			{loading ? (
				<div className='text-center py-12 text-gray-400'>Загрузка...</div>
			) : templates.length === 0 ? (
				<div className='text-center py-16 bg-white rounded-xl border border-gray-100'>
					<p className='text-sm text-gray-400'>Шаблонов пока нет</p>
				</div>
			) : (
				<div className='space-y-2'>
					{templates.map((t) => {
						const badge = STATUS_BADGES[t.status] || STATUS_BADGES.DRAFT;
						return (
							<div
								key={t.id}
								onClick={() => openEdit(t)}
								className='bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors cursor-pointer'>
								<div className='flex items-center gap-2 mb-1'>
									<h3 className='text-sm font-medium text-gray-900'>
										{t.name}
									</h3>
									<span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.class}`}>
										{badge.label}
									</span>
									{t.channelType && (
										<span className='text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded'>
											{t.channelType}
										</span>
									)}
								</div>
								<p className='text-xs text-gray-500 line-clamp-2'>{t.body}</p>
								{t.variables && t.variables.length > 0 && (
									<div className='flex gap-1 mt-2'>
										{t.variables.map((v) => (
											<span
												key={v}
												className='text-[10px] font-mono text-brand bg-brand-light px-1.5 py-0.5 rounded'>
												{`{{${v}}}`}
											</span>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}

			{/* Create/Edit modal */}
			{showModal && (
				<div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
					<div className='absolute inset-0 bg-black/40' onClick={() => setShowModal(false)} />
					<div className='relative bg-white rounded-2xl shadow-xl max-w-lg w-full'>
						<div className='p-6'>
							<h2 className='text-lg font-bold text-gray-900 mb-4'>
								{editingTemplate ? 'Редактировать шаблон' : 'Новый шаблон'}
							</h2>

							<div className='mb-4'>
								<label className='block text-sm font-medium text-gray-700 mb-1'>Название</label>
								<input
									type='text'
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder='Приветственное сообщение'
									className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
								/>
							</div>

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
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Текст шаблона
								</label>
								<textarea
									value={body}
									onChange={(e) => setBody(e.target.value)}
									rows={5}
									placeholder={'Здравствуйте, {{name}}!\n\nСпасибо за обращение...'}
									className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400 resize-none'
								/>
								<p className='text-xs text-gray-400 mt-1'>
									Используйте {'{{переменная}}'} для вставки динамических данных
								</p>
							</div>

							{currentVars.length > 0 && (
								<div className='mb-4'>
									<p className='text-xs font-medium text-gray-400 mb-1'>Переменные:</p>
									<div className='flex flex-wrap gap-1'>
										{currentVars.map((v) => (
											<span key={v} className='text-xs font-mono text-brand bg-brand-light px-2 py-0.5 rounded'>
												{`{{${v}}}`}
											</span>
										))}
									</div>
								</div>
							)}

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
