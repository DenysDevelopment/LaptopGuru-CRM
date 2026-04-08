'use client';

import { useState, useEffect } from 'react';
import { ChannelIcon, getChannelLabel } from '@/components/messaging/channel-icon';

interface Channel {
	id: string;
	type: string;
	name: string;
	status: string;
	enabled: boolean;
	config: Record<string, string>;
	createdAt: string;
}

const CHANNEL_TYPES = [
	{ value: 'EMAIL', label: 'Email' },
	{ value: 'SMS', label: 'SMS' },
	{ value: 'WHATSAPP', label: 'WhatsApp' },
	{ value: 'TELEGRAM', label: 'Telegram' },
];

const EMAIL_DEFAULTS: Record<string, string> = {
	imap_host: 'imap.hostinger.com',
	imap_port: '993',
	smtp_host: 'smtp.hostinger.com',
	smtp_port: '465',
};

const CONFIG_FIELDS: Record<string, { key: string; label: string; type: string }[]> = {
	EMAIL: [
		{ key: 'smtp_display_name', label: 'Имя отправителя', type: 'text' },
		{ key: 'imap_host', label: 'IMAP Хост', type: 'text' },
		{ key: 'imap_port', label: 'IMAP Порт', type: 'text' },
		{ key: 'smtp_host', label: 'SMTP Хост', type: 'text' },
		{ key: 'smtp_port', label: 'SMTP Порт', type: 'text' },
		{ key: 'imap_user', label: 'Логин', type: 'text' },
		{ key: 'imap_password', label: 'Пароль', type: 'password' },
	],
	TELEGRAM: [
		{ key: 'bot_token', label: 'Bot Token (от @BotFather)', type: 'password' },
	],
	WHATSAPP: [
		{ key: 'apiKey', label: 'API Key', type: 'password' },
		{ key: 'phoneNumberId', label: 'Phone Number ID', type: 'text' },
		{ key: 'businessAccountId', label: 'Business Account ID', type: 'text' },
	],
	SMS: [
		{ key: 'provider', label: 'Провайдер', type: 'text' },
		{ key: 'apiKey', label: 'API Key', type: 'password' },
		{ key: 'senderId', label: 'Sender ID', type: 'text' },
	],
	FACEBOOK: [
		{ key: 'pageAccessToken', label: 'Page Access Token', type: 'password' },
		{ key: 'pageId', label: 'Page ID', type: 'text' },
	],
	INSTAGRAM: [
		{ key: 'accessToken', label: 'Access Token', type: 'password' },
		{ key: 'igUserId', label: 'IG User ID', type: 'text' },
	],
	WEBCHAT: [
		{ key: 'widgetColor', label: 'Цвет виджета', type: 'text' },
		{ key: 'welcomeMessage', label: 'Приветственное сообщение', type: 'text' },
	],
};

export default function ChannelsSettingsPage() {
	const [channels, setChannels] = useState<Channel[]>([]);
	const [loading, setLoading] = useState(true);
	const [showModal, setShowModal] = useState(false);
	const [newChannelType, setNewChannelType] = useState('EMAIL');
	const [newChannelName, setNewChannelName] = useState('');
	const [newChannelConfig, setNewChannelConfig] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState<string | null>(null);

	// Edit email channel state
	const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
	const [editChannelName, setEditChannelName] = useState('');
	const [editChannelConfig, setEditChannelConfig] = useState<Record<string, string>>({});

	// Delete channel modal state
	const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
	const [deleteStep, setDeleteStep] = useState<'choose' | 'confirm'>('choose');
	const [deleting, setDeleting] = useState(false);

	const fetchChannels = async () => {
		try {
			const res = await fetch('/api/messaging/channels');
			if (res.ok) {
				const raw = await res.json();
				const arr = Array.isArray(raw) ? raw : raw.items || [];
				setChannels(arr.map((ch: Record<string, unknown>) => ({
					id: ch.id,
					type: ch.type,
					name: ch.name,
					status: ch.isActive ? 'CONNECTED' : 'DISCONNECTED',
					enabled: ch.isActive ?? true,
					config: Array.isArray(ch.config)
						? Object.fromEntries((ch.config as { key: string; value: string }[]).map((c) => [c.key, c.value]))
						: ch.config || {},
					createdAt: ch.createdAt,
				})) as Channel[]);
			}
		} catch { /* ignore */ }
		setLoading(false);
	};

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		fetchChannels();
	}, []);

	const handleSave = async () => {
		if (!newChannelName.trim() || saving) return;
		setSaving(true);
		try {
			// For EMAIL channels, duplicate imap credentials as smtp if not set separately
			const finalConfig = { ...newChannelConfig };
			if (newChannelType === 'EMAIL') {
				if (!finalConfig.smtp_user) finalConfig.smtp_user = finalConfig.imap_user || '';
				if (!finalConfig.smtp_password) finalConfig.smtp_password = finalConfig.imap_password || '';
				if (!finalConfig.smtp_from) finalConfig.smtp_from = finalConfig.imap_user || '';
			}

			const res = await fetch('/api/messaging/channels', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: newChannelType,
					name: newChannelName.trim(),
					config: Object.entries(finalConfig)
						.filter(([, v]) => v)
						.map(([key, value]) => ({
							key,
							value,
							isSecret: key.toLowerCase().includes('password') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret'),
						})),
				}),
			});
			if (res.ok) {
				setShowModal(false);
				setNewChannelName('');
				setNewChannelConfig({});
				fetchChannels();
				if (newChannelType === 'EMAIL') {
					syncEmail();
				}
			} else {
				const err = await res.json();
				alert(err.error || 'Ошибка создания канала');
			}
		} catch { /* ignore */ }
		setSaving(false);
	};

	const toggleChannel = async (channelId: string, enabled: boolean) => {
		try {
			await fetch(`/api/messaging/channels/${channelId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isActive: enabled }),
			});
			setChannels((prev) =>
				prev.map((ch) => (ch.id === channelId ? { ...ch, enabled } : ch)),
			);
		} catch { /* ignore */ }
	};

	const openDeleteModal = (channelId: string) => {
		setDeletingChannelId(channelId);
		setDeleteStep('choose');
	};

	const executeDelete = async (deleteData: boolean) => {
		if (!deletingChannelId || deleting) return;
		setDeleting(true);
		try {
			const res = await fetch(`/api/messaging/channels/${deletingChannelId}?deleteData=${deleteData}`, {
				method: 'DELETE',
			});
			if (res.ok) {
				setDeletingChannelId(null);
				if (deleteData) {
					setChannels((prev) => prev.filter((ch) => ch.id !== deletingChannelId));
				} else {
					fetchChannels();
				}
			} else {
				alert('Ошибка удаления');
			}
		} catch { /* ignore */ }
		setDeleting(false);
	};

	const syncEmail = async () => {
		try {
			await fetch('/api/emails/sync', { method: 'POST' });
		} catch {
		}
	};

	const testConnection = async (channelId: string) => {
		setTesting(channelId);
		try {
			const res = await fetch(`/api/messaging/channels/${channelId}/test`, { method: 'POST' });
			if (res.ok) {
				alert('Подключение успешно!');
			} else {
				alert('Ошибка подключения');
			}
		} catch {
			alert('Ошибка подключения');
		}
		setTesting(null);
	};

	const leadEmailChannel = channels.find((ch) => ch.type === 'EMAIL');

	const openEditModal = (channel: Channel) => {
		setEditingChannel(channel);
		setEditChannelName(channel.name);
		// Don't prefill secret values — show empty so user can re-enter if needed
		const cleanConfig: Record<string, string> = {};
		for (const [k, v] of Object.entries(channel.config)) {
			cleanConfig[k] = v === '--------' ? '' : v;
		}
		setEditChannelConfig(cleanConfig);
	};

	const handleEditSave = async () => {
		if (!editingChannel || saving) return;
		setSaving(true);
		try {
			const configEntries = Object.entries(editChannelConfig)
				.filter(([, v]) => v)
				.map(([key, value]) => ({
					key,
					value,
					isSecret: key.toLowerCase().includes('password') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret'),
				}));

			const res = await fetch(`/api/messaging/channels/${editingChannel.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: editChannelName.trim() || undefined,
					config: configEntries.length > 0 ? configEntries : undefined,
				}),
			});
			if (res.ok) {
				setEditingChannel(null);
				fetchChannels();
			} else {
				const err = await res.json();
				alert(err.error || 'Ошибка сохранения');
			}
		} catch { /* ignore */ }
		setSaving(false);
	};

	const fields = CONFIG_FIELDS[newChannelType] || [];
	const editFields = CONFIG_FIELDS['EMAIL'] || [];

	return (
		<div>
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Каналы</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Подключённые каналы связи
					</p>
				</div>
				<button
					onClick={() => { setShowModal(true); setNewChannelConfig({ ...EMAIL_DEFAULTS }); }}
					className='inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2.5 rounded-lg transition-colors text-sm'>
					<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M12 4.5v15m7.5-7.5h-15' />
					</svg>
					Добавить канал
				</button>
			</div>

			{/* ── Почта для заявок ── */}
			<div className='mb-8'>
				<h2 className='text-base font-semibold text-gray-900'>Почта для заявок</h2>
				<p className='text-sm text-gray-500 mt-0.5 mb-3'>Email для приёма входящих заявок с сайта</p>

				{loading ? (
					<div className='bg-white rounded-xl border border-gray-100 p-6 text-center text-gray-400 text-sm'>Загрузка...</div>
				) : !leadEmailChannel ? (
					<div className='border-2 border-dashed border-gray-200 rounded-xl p-6 text-center'>
						<div className='w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-50 flex items-center justify-center'>
							<ChannelIcon channel='EMAIL' size={28} />
						</div>
						<p className='text-sm font-medium text-gray-700'>Email не подключён</p>
						<p className='text-xs text-gray-400 mt-1 mb-4'>Подключите почтовый ящик для автоматического приёма заявок</p>
						<button
							onClick={() => {
								setNewChannelType('EMAIL');
								setNewChannelName('Почта для заявок');
								setNewChannelConfig({ ...EMAIL_DEFAULTS });
								setShowModal(true);
							}}
							className='inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm'>
							<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
								<path strokeLinecap='round' strokeLinejoin='round' d='M12 4.5v15m7.5-7.5h-15' />
							</svg>
							Подключить email
						</button>
					</div>
				) : (
					<div className='bg-gradient-to-r from-blue-50 to-white border border-blue-200 rounded-xl p-4 flex items-center gap-4'>
						<div className='w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center'>
							<ChannelIcon channel='EMAIL' size={22} />
						</div>
						<div className='flex-1 min-w-0'>
							<p className='text-sm font-medium text-gray-900'>{leadEmailChannel.name}</p>
							<p className='text-xs text-gray-500 mt-0.5'>{leadEmailChannel.config.imap_user || 'Email'}</p>
						</div>
						<div className='flex items-center gap-1.5'>
							<span className={`w-1.5 h-1.5 rounded-full ${leadEmailChannel.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
							<span className='text-xs text-gray-400'>{leadEmailChannel.enabled ? 'Подключён' : 'Отключён'}</span>
						</div>
						<button
							onClick={() => testConnection(leadEmailChannel.id)}
							disabled={testing === leadEmailChannel.id}
							className='text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors disabled:opacity-50'>
							{testing === leadEmailChannel.id ? 'Проверка...' : 'Тест'}
						</button>
						<button
							onClick={syncEmail}
							className='text-xs text-blue-500 hover:text-blue-700 px-3 py-1.5 border border-blue-200 rounded-lg transition-colors'>
							Синхронизировать
						</button>
						<button
							onClick={() => openEditModal(leadEmailChannel)}
							className='text-xs text-gray-400 hover:text-gray-600 p-1.5 border border-gray-200 rounded-lg transition-colors'
							title='Настройки'>
							<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
								<path strokeLinecap='round' strokeLinejoin='round' d='M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z' />
								<path strokeLinecap='round' strokeLinejoin='round' d='M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' />
							</svg>
						</button>
						<label className='relative inline-flex items-center cursor-pointer'>
							<input
								type='checkbox'
								checked={leadEmailChannel.enabled}
								onChange={(e) => toggleChannel(leadEmailChannel.id, e.target.checked)}
								className='sr-only peer'
							/>
							<div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand" />
						</label>
					</div>
				)}
			</div>

			{/* ── Каналы коммуникации ── */}
			<h2 className='text-base font-semibold text-gray-900 mb-3'>Каналы коммуникации</h2>

			{loading ? (
				<div className='text-center py-12 text-gray-400'>Загрузка...</div>
			) : channels.length === 0 ? (
				<div className='text-center py-16 bg-white rounded-xl border border-gray-100'>
					<svg className='w-12 h-12 mx-auto text-gray-300 mb-3' fill='none' viewBox='0 0 24 24' strokeWidth={1} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418' />
					</svg>
					<p className='text-sm text-gray-400'>Нет подключённых каналов</p>
					<p className='text-xs text-gray-400 mt-1'>Добавьте первый канал для начала работы</p>
				</div>
			) : (
				<div className='space-y-3'>
					{channels.map((channel) => (
						<div
							key={channel.id}
							className='bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4'>
							<div className='w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center'>
								<ChannelIcon channel={channel.type} size={22} />
							</div>
							<div className='flex-1 min-w-0'>
								<div className='flex items-center gap-2'>
									<p className='text-sm font-medium text-gray-900'>
										{channel.name}
									</p>
									<span className='text-xs text-gray-400'>
										{getChannelLabel(channel.type)}
									</span>
								</div>
								<div className='flex items-center gap-2 mt-0.5'>
									<span
										className={`w-1.5 h-1.5 rounded-full ${
											channel.status === 'CONNECTED'
												? 'bg-green-500'
												: channel.status === 'ERROR'
													? 'bg-red-500'
													: 'bg-gray-300'
										}`}
									/>
									<span className='text-xs text-gray-400'>
										{channel.status === 'CONNECTED'
											? 'Подключён'
											: channel.status === 'ERROR'
												? 'Ошибка'
												: 'Отключён'}
									</span>
								</div>
							</div>
							{channel.type === 'EMAIL' && (
								<button
									onClick={syncEmail}
									className='text-xs text-blue-500 hover:text-blue-700 px-3 py-1.5 border border-blue-200 rounded-lg transition-colors'>
									Синхронизировать
								</button>
							)}
							<button
								onClick={() => testConnection(channel.id)}
								disabled={testing === channel.id}
								className='text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors disabled:opacity-50'>
								{testing === channel.id ? 'Проверка...' : 'Тест'}
							</button>
							<label className='relative inline-flex items-center cursor-pointer'>
								<input
									type='checkbox'
									checked={channel.enabled}
									onChange={(e) => toggleChannel(channel.id, e.target.checked)}
									className='sr-only peer'
								/>
								<div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand" />
							</label>
							<button
								onClick={() => openDeleteModal(channel.id)}
								className='text-xs text-red-400 hover:text-red-600 px-2 py-1.5 transition-colors'
								title='Удалить канал'>
								<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' />
								</svg>
							</button>
						</div>
					))}
				</div>
			)}

			{/* Add channel modal */}
			{showModal && (
				<div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
					<div
						className='absolute inset-0 bg-black/40'
						onClick={() => setShowModal(false)}
					/>
					<div className='relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto'>
						<div className='p-6'>
							<h2 className='text-lg font-bold text-gray-900 mb-4'>
								Добавить канал
							</h2>

							{/* Channel type */}
							<div className='mb-4'>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Тип канала
								</label>
								<div className='grid grid-cols-2 gap-2'>
									{CHANNEL_TYPES.map((ct) => (
										<button
											key={ct.value}
											onClick={() => {
												setNewChannelType(ct.value);
												setNewChannelConfig(ct.value === 'EMAIL' ? { ...EMAIL_DEFAULTS } : {});
											}}
											className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${
												newChannelType === ct.value
													? 'border-brand bg-brand-light'
													: 'border-gray-200 hover:border-gray-300'
											}`}>
											<ChannelIcon channel={ct.value} size={18} />
											<span className='text-sm font-medium text-gray-700'>
												{ct.label}
											</span>
										</button>
									))}
								</div>
							</div>

							{/* Name */}
							<div className='mb-4'>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Название
								</label>
								<input
									type='text'
									value={newChannelName}
									onChange={(e) => setNewChannelName(e.target.value)}
									placeholder='Например: Основной Email'
									className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
								/>
							</div>

							{/* Config fields */}
							{fields.map((field) => (
								<div key={field.key} className='mb-3'>
									<label className='block text-sm font-medium text-gray-700 mb-1'>
										{field.label}
									</label>
									<input
										type={field.type}
										value={newChannelConfig[field.key] || ''}
										onChange={(e) =>
											setNewChannelConfig((prev) => ({
												...prev,
												[field.key]: e.target.value,
											}))
										}
										className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
									/>
								</div>
							))}

							{/* Actions */}
							<div className='flex gap-3 mt-6'>
								<button
									onClick={() => setShowModal(false)}
									className='flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors'>
									Отмена
								</button>
								<button
									onClick={handleSave}
									disabled={!newChannelName.trim() || saving}
									className='flex-1 px-4 py-2.5 text-sm font-medium text-white bg-brand hover:bg-brand-hover rounded-xl transition-colors disabled:opacity-50'>
									{saving ? 'Сохранение...' : 'Добавить'}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
			{/* Delete channel modal */}
			{deletingChannelId && (
				<div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
					<div
						className='absolute inset-0 bg-black/40'
						onClick={() => !deleting && setDeletingChannelId(null)}
					/>
					<div className='relative bg-white rounded-2xl shadow-xl max-w-md w-full'>
						<div className='p-6'>
							{deleteStep === 'choose' ? (
								<>
									<div className='w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center'>
										<svg className='w-6 h-6 text-red-500' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
											<path strokeLinecap='round' strokeLinejoin='round' d='m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' />
										</svg>
									</div>
									<h3 className='text-lg font-bold text-gray-900 text-center mb-2'>Удалить канал?</h3>
									<p className='text-sm text-gray-500 text-center mb-6'>Выберите способ удаления канала</p>

									<div className='space-y-3'>
										<button
											onClick={() => executeDelete(false)}
											disabled={deleting}
											className='w-full text-left p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50'>
											<p className='text-sm font-medium text-gray-900'>Отключить канал</p>
											<p className='text-xs text-gray-500 mt-0.5'>Сообщения и разговоры останутся</p>
										</button>
										<button
											onClick={() => setDeleteStep('confirm')}
											className='w-full text-left p-4 rounded-xl border border-red-200 hover:border-red-300 hover:bg-red-50 transition-colors'>
											<p className='text-sm font-medium text-red-600'>Удалить канал и все данные</p>
											<p className='text-xs text-gray-500 mt-0.5'>Сообщения, разговоры будут удалены безвозвратно</p>
										</button>
									</div>

									<button
										onClick={() => setDeletingChannelId(null)}
										className='w-full mt-4 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors'>
										Отмена
									</button>
								</>
							) : (
								<>
									<div className='w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center'>
										<svg className='w-6 h-6 text-red-600' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
											<path strokeLinecap='round' strokeLinejoin='round' d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z' />
										</svg>
									</div>
									<h3 className='text-lg font-bold text-gray-900 text-center mb-2'>Вы уверены?</h3>
									<p className='text-sm text-gray-500 text-center mb-6'>
										ВСЕ сообщения и разговоры этого канала будут удалены безвозвратно. Это действие нельзя отменить.
									</p>

									<div className='flex gap-3'>
										<button
											onClick={() => setDeleteStep('choose')}
											disabled={deleting}
											className='flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50'>
											Назад
										</button>
										<button
											onClick={() => executeDelete(true)}
											disabled={deleting}
											className='flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50'>
											{deleting ? 'Удаление...' : 'Удалить всё'}
										</button>
									</div>
								</>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Edit email channel modal */}
			{editingChannel && (
				<div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
					<div
						className='absolute inset-0 bg-black/40'
						onClick={() => setEditingChannel(null)}
					/>
					<div className='relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto'>
						<div className='p-6'>
							<h2 className='text-lg font-bold text-gray-900 mb-4'>
								Настройки почты
							</h2>

							{/* Name */}
							<div className='mb-4'>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Название
								</label>
								<input
									type='text'
									value={editChannelName}
									onChange={(e) => setEditChannelName(e.target.value)}
									className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
								/>
							</div>

							{/* Config fields */}
							{editFields.map((field) => (
								<div key={field.key} className='mb-3'>
									<label className='block text-sm font-medium text-gray-700 mb-1'>
										{field.label}
									</label>
									<input
										type={field.type}
										value={editChannelConfig[field.key] || ''}
										onChange={(e) =>
											setEditChannelConfig((prev) => ({
												...prev,
												[field.key]: e.target.value,
											}))
										}
										placeholder={field.type === 'password' ? 'Оставьте пустым, чтобы не менять' : ''}
										className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
									/>
								</div>
							))}

							{/* Actions */}
							<div className='flex gap-3 mt-6'>
								<button
									onClick={() => setEditingChannel(null)}
									className='flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors'>
									Отмена
								</button>
								<button
									onClick={handleEditSave}
									disabled={saving}
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
