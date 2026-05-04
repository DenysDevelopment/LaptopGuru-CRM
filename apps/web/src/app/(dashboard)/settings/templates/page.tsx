'use client';

import { useState, useEffect, useCallback } from 'react';
import { TemplateForm } from '@/components/dashboard/settings/template-form';
import { Button } from '@/components/ui/button';
import type { TemplateInput } from '@/lib/schemas/template';
import {
	listTemplates,
	createTemplate,
	updateTemplate,
	type Template,
} from '@/services/messaging/templates.service';

const STATUS_BADGES: Record<string, { label: string; class: string }> = {
	DRAFT: { label: 'Черновик', class: 'bg-gray-100 text-gray-600' },
	PENDING: { label: 'На проверке', class: 'bg-amber-100 text-amber-700' },
	APPROVED: { label: 'Одобрен', class: 'bg-green-100 text-green-700' },
	ACTIVE: { label: 'Активен', class: 'bg-green-100 text-green-700' },
	REJECTED: { label: 'Отклонён', class: 'bg-red-100 text-red-700' },
};

type ChannelType = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'TELEGRAM';
const VALID_CHANNEL_TYPES: ChannelType[] = ['EMAIL', 'SMS', 'WHATSAPP', 'TELEGRAM'];

export default function TemplatesSettingsPage() {
	const [templates, setTemplates] = useState<Template[]>([]);
	const [loading, setLoading] = useState(true);
	const [showModal, setShowModal] = useState(false);
	const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

	const fetchTemplates = useCallback(async () => {
		try {
			setTemplates(await listTemplates());
		} catch { /* ignore */ }
		setLoading(false);
	}, []);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		fetchTemplates();
	}, [fetchTemplates]);

	const openCreate = () => {
		setEditingTemplate(null);
		setShowModal(true);
	};

	const openEdit = (t: Template) => {
		setEditingTemplate(t);
		setShowModal(true);
	};

	const handleSave = async (data: TemplateInput) => {
		try {
			const payload = {
				name: data.name,
				body: data.body,
				channelType: data.channelType || null,
			};
			if (editingTemplate) {
				await updateTemplate(editingTemplate.id, payload);
			} else {
				await createTemplate(payload);
			}
			setShowModal(false);
			fetchTemplates();
		} catch { /* ignore */ }
	};

	return (
		<div>
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Шаблоны</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Шаблоны сообщений для каналов
					</p>
				</div>
				<Button
					type='button'
					onClick={openCreate}
					className='bg-brand hover:bg-brand-hover text-white'>
					<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M12 4.5v15m7.5-7.5h-15' />
					</svg>
					Создать шаблон
				</Button>
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
					<div
						className='absolute inset-0 bg-black/40'
						onClick={() => setShowModal(false)}
					/>
					<div className='relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto'>
						<div className='p-6'>
							<h2 className='text-lg font-bold text-gray-900 mb-4'>
								{editingTemplate ? 'Редактировать шаблон' : 'Новый шаблон'}
							</h2>
							<TemplateForm
								initialValue={
									editingTemplate
										? {
												name: editingTemplate.name,
												body: editingTemplate.body,
												channelType:
													editingTemplate.channelType &&
													VALID_CHANNEL_TYPES.includes(
														editingTemplate.channelType as ChannelType,
													)
														? (editingTemplate.channelType as ChannelType)
														: null,
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
