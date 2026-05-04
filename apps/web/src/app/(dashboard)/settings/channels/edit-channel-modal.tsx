'use client';

import { CONFIG_FIELDS } from './channels.config';

interface Props {
	type: string;
	title?: string;
	helpText?: string;
	name: string;
	setName: (v: string) => void;
	config: Record<string, string>;
	setConfig: (v: Record<string, string>) => void;
	saving: boolean;
	onClose: () => void;
	onSave: () => void;
}

export function EditChannelModal({
	type,
	title,
	helpText,
	name,
	setName,
	config,
	setConfig,
	saving,
	onClose,
	onSave,
}: Props) {
	const fields = CONFIG_FIELDS[type] || [];

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
			<div className='absolute inset-0 bg-black/40' onClick={onClose} />
			<div className='relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto'>
				<div className='p-6'>
					<h2 className='text-lg font-bold text-gray-900 mb-4'>
						{title ?? 'Настройки канала'}
					</h2>

					{helpText && (
						<p className='text-xs text-gray-500 mb-4 leading-relaxed'>
							{helpText}
						</p>
					)}

					<div className='mb-4'>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Название
						</label>
						<input
							type='text'
							value={name}
							onChange={e => setName(e.target.value)}
							className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
						/>
					</div>

					{fields.map(field => (
						<div key={field.key} className='mb-3'>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								{field.label}
							</label>
							<input
								type={field.type}
								value={config[field.key] || ''}
								onChange={e =>
									setConfig({ ...config, [field.key]: e.target.value })
								}
								placeholder={
									field.type === 'password'
										? 'Оставьте пустым, чтобы не менять'
										: ''
								}
								className='w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
							/>
						</div>
					))}

					<div className='flex gap-3 mt-6'>
						<button
							onClick={onClose}
							className='flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors'>
							Отмена
						</button>
						<button
							onClick={onSave}
							disabled={saving}
							className='flex-1 px-4 py-2.5 text-sm font-medium text-white bg-brand hover:bg-brand-hover rounded-xl transition-colors disabled:opacity-50'>
							{saving ? 'Сохранение...' : 'Сохранить'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
