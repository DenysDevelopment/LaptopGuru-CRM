'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCallback, useEffect, useState } from 'react';

type Check = {
	name: string;
	label: string;
	ok: boolean;
	skipped?: boolean;
	message: string;
	hint?: string;
};

type DomainStatus = {
	domain: string | null;
	expectedTarget?: string;
	allOk?: boolean;
	checks: Check[];
};

export default function DomainSettingsPage() {
	const [domain, setDomain] = useState('');
	const [savedDomain, setSavedDomain] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<{
		type: 'ok' | 'err';
		text: string;
	} | null>(null);
	const [status, setStatus] = useState<DomainStatus | null>(null);
	const [checking, setChecking] = useState(false);

	const runStatusCheck = useCallback(async () => {
		setChecking(true);
		try {
			const res = await fetch('/api/domain-status', { cache: 'no-store' });
			if (res.ok) {
				const data: DomainStatus = await res.json();
				setStatus(data);
			}
		} catch {
			// ignore
		} finally {
			setChecking(false);
		}
	}, []);

	useEffect(() => {
		fetch('/api/company-settings')
			.then(r => r.json())
			.then(data => {
				setDomain(data.customDomain ?? '');
				setSavedDomain(data.customDomain ?? null);
				if (data.customDomain) {
					runStatusCheck();
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [runStatusCheck]);

	async function handleSave() {
		setSaving(true);
		setMessage(null);
		try {
			const res = await fetch('/api/company-settings', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ customDomain: domain.trim() || null }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setMessage({ type: 'err', text: data.error ?? `Ошибка ${res.status}` });
				return;
			}
			const data = await res.json();
			setSavedDomain(data.customDomain ?? null);
			setMessage({ type: 'ok', text: 'Домен сохранён' });
			runStatusCheck();
		} catch {
			setMessage({ type: 'err', text: 'Ошибка соединения' });
		} finally {
			setSaving(false);
		}
	}

	async function handleRemove() {
		setSaving(true);
		setMessage(null);
		try {
			const res = await fetch('/api/company-settings', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ customDomain: null }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setMessage({ type: 'err', text: data.error ?? `Ошибка ${res.status}` });
				return;
			}
			setDomain('');
			setSavedDomain(null);
			setStatus(null);
			setMessage({ type: 'ok', text: 'Домен удалён' });
		} catch {
			setMessage({ type: 'err', text: 'Ошибка соединения' });
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return <p className='text-gray-500 py-8 text-center'>Загрузка...</p>;
	}

	return (
		<div className='max-w-xl'>
			<h2 className='text-lg font-semibold text-gray-900 mb-4'>
				Кастомный домен
			</h2>
			<p className='text-sm text-gray-500 mb-6'>
				Привяжите свой домен для лендингов. Вместо{' '}
				<code className='bg-gray-100 px-1 rounded text-xs'>
					crm.laptopguru.link/l/slug
				</code>{' '}
				лендинги будут доступны по{' '}
				<code className='bg-gray-100 px-1 rounded text-xs'>
					ваш-домен.pl/slug
				</code>
			</p>

			{/* Current status */}
			{savedDomain && (
				<div className='bg-green-50 border border-green-200 rounded-lg p-4 mb-6'>
					<div className='flex items-center justify-between'>
						<div>
							<p className='text-sm font-medium text-green-800'>
								Активный домен
							</p>
							<p className='text-lg font-mono text-green-900'>{savedDomain}</p>
						</div>
						<Button
							variant='outline'
							size='sm'
							onClick={handleRemove}
							disabled={saving}
							className='text-red-600 border-red-200 hover:bg-red-50'>
							Удалить
						</Button>
					</div>
				</div>
			)}

			{/* Diagnostic checks */}
			{savedDomain && (
				<div className='bg-white border border-gray-200 rounded-lg p-5 mb-6'>
					<div className='flex items-center justify-between mb-4'>
						<h3 className='text-sm font-semibold text-gray-900'>
							Статус подключения
						</h3>
						<Button
							variant='outline'
							size='sm'
							onClick={runStatusCheck}
							disabled={checking}>
							{checking ? 'Проверяем...' : 'Перепроверить'}
						</Button>
					</div>

					{status && status.allOk && (
						<div className='bg-green-50 border border-green-200 rounded-md px-3 py-2 mb-3 text-sm text-green-800'>
							Всё работает — домен полностью подключён
						</div>
					)}

					{!status && checking && (
						<p className='text-sm text-gray-500'>Проверяем подключение...</p>
					)}

					{status && status.checks.length > 0 && (
						<ul className='space-y-3'>
							{status.checks.map(check => (
								<li
									key={check.name}
									className='flex gap-3 items-start text-sm'>
									<span
										className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
											check.skipped
												? 'bg-gray-100 text-gray-400'
												: check.ok
													? 'bg-green-100 text-green-700'
													: 'bg-red-100 text-red-700'
										}`}>
										{check.skipped ? '—' : check.ok ? '✓' : '✕'}
									</span>
									<div className='flex-1'>
										<p
											className={`font-medium ${
												check.skipped
													? 'text-gray-400'
													: check.ok
														? 'text-gray-900'
														: 'text-red-700'
											}`}>
											{check.label}
										</p>
										<p className='text-gray-600 text-xs mt-0.5'>
											{check.message}
										</p>
										{check.hint && !check.ok && (
											<p className='text-amber-700 text-xs mt-1 bg-amber-50 border border-amber-200 rounded px-2 py-1'>
												💡 {check.hint}
											</p>
										)}
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			)}

			{/* Domain input */}
			<div className='bg-white border border-gray-200 rounded-lg p-5 space-y-4'>
				<div>
					<label className='block text-sm font-medium text-gray-700 mb-1'>
						{savedDomain ? 'Изменить домен' : 'Добавить домен'}
					</label>
					<Input
						value={domain}
						onChange={e => setDomain(e.target.value)}
						placeholder='landos.firma.pl'
						className='font-mono'
					/>
				</div>

				{message && (
					<p
						className={`text-sm rounded-lg px-3 py-2 ${
							message.type === 'ok'
								? 'bg-green-50 text-green-700'
								: 'bg-red-50 text-red-600'
						}`}>
						{message.text}
					</p>
				)}

				<Button
					onClick={handleSave}
					disabled={saving || !domain.trim()}
					className='bg-blue-600 hover:bg-blue-700 text-white'>
					{saving ? 'Сохраняем...' : 'Сохранить'}
				</Button>
			</div>

			{/* DNS Instructions */}
			<div className='mt-6 bg-gray-50 border border-gray-200 rounded-lg p-5'>
				<h3 className='text-sm font-semibold text-gray-700 mb-3'>
					Как подключить домен
				</h3>
				<ol className='space-y-3 text-sm text-gray-600'>
					<li className='flex gap-2'>
						<span className='flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center justify-center'>
							1
						</span>
						<span>
							Зайдите в панель управления DNS вашего домена (у регистратора или
							хостинга)
						</span>
					</li>
					<li className='flex gap-2'>
						<span className='flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center justify-center'>
							2
						</span>
						<span>
							Добавьте <strong>CNAME</strong> запись:
						</span>
					</li>
					<li className='ml-7'>
						<div className='bg-white border border-gray-200 rounded-lg p-3 font-mono text-xs space-y-1'>
							<div>
								<span className='text-gray-400'>Тип:</span> CNAME
							</div>
							<div>
								<span className='text-gray-400'>Имя:</span> ваш-поддомен
								(например<span className='text-blue-600'>l</span>)
							</div>
							<div>
								<span className='text-gray-400'>Значение:</span>
								<span className='text-green-600'>crm.laptopguru.link</span>
							</div>
						</div>
					</li>
					<li className='flex gap-2'>
						<span className='flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center justify-center'>
							3
						</span>
						<span>
							Подождите 5-30 минут пока DNS обновится. SSL сертификат выдаётся
							автоматически.
						</span>
					</li>
				</ol>
			</div>
		</div>
	);
}
