'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/use-confirm';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export default function ExcludedIpsSettingsPage() {
	const confirm = useConfirm();
	const [ips, setIps] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	const [myIp, setMyIp] = useState<string | null>(null);
	const [newIp, setNewIp] = useState('');
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		try {
			const [ipsRes, meRes] = await Promise.all([
				fetch('/api/company-settings/excluded-ips', { cache: 'no-store' }),
				fetch('/api/whoami/ip', { cache: 'no-store' }),
			]);
			if (ipsRes.ok) {
				const data = (await ipsRes.json()) as { excludedIps: string[] };
				setIps(data.excludedIps);
			}
			if (meRes.ok) {
				const data = (await meRes.json()) as { ip: string | null };
				setMyIp(data.ip);
			}
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function addIp(ip: string) {
		setBusy(true);
		try {
			const res = await fetch('/api/company-settings/excluded-ips', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ip }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				toast.error('Не удалось добавить IP', {
					description: err.error || `HTTP ${res.status}`,
				});
				return;
			}
			const data = (await res.json()) as { excludedIps: string[] };
			setIps(data.excludedIps);
			setNewIp('');
			toast.success(`IP ${ip} добавлен в исключения`);
		} finally {
			setBusy(false);
		}
	}

	async function removeIp(ip: string) {
		const ok = await confirm({
			title: `Удалить IP ${ip}?`,
			description: 'Визиты с этого IP снова будут считаться в статистике.',
			confirmLabel: 'Удалить',
			cancelLabel: 'Отмена',
			variant: 'destructive',
		});
		if (!ok) return;
		setBusy(true);
		try {
			const res = await fetch(
				`/api/company-settings/excluded-ips/${encodeURIComponent(ip)}`,
				{ method: 'DELETE' },
			);
			if (!res.ok) {
				toast.error('Не удалось удалить IP');
				return;
			}
			const data = (await res.json()) as { excludedIps: string[] };
			setIps(data.excludedIps);
			toast.success(`IP ${ip} удалён из исключений`);
		} finally {
			setBusy(false);
		}
	}

	const currentIpAlreadyExcluded = !!myIp && ips.includes(myIp);

	return (
		<div className='max-w-2xl'>
			<div className='mb-6'>
				<h1 className='text-2xl font-bold text-gray-900'>Исключённые IP</h1>
				<p className='mt-1 text-sm text-gray-500'>
					Визиты лендингов и переходы по коротким ссылкам с этих IP не
					учитываются в аналитике и не увеличивают счётчики.
				</p>
			</div>

			<div className='bg-white rounded-xl border border-gray-100 p-5 mb-4'>
				<div className='text-xs text-gray-500 uppercase tracking-wide mb-2'>
					Ваш текущий IP
				</div>
				<div className='flex items-center justify-between gap-3'>
					<code className='text-sm font-mono text-gray-900'>
						{myIp ?? '—'}
					</code>
					{myIp && !currentIpAlreadyExcluded && (
						<Button
							type='button'
							onClick={() => addIp(myIp)}
							disabled={busy}
							size='sm'>
							<Plus className='w-3.5 h-3.5' /> Исключить мой IP
						</Button>
					)}
					{currentIpAlreadyExcluded && (
						<span className='text-xs text-green-700 bg-green-50 px-2 py-1 rounded'>
							Уже в списке
						</span>
					)}
				</div>
			</div>

			<div className='bg-white rounded-xl border border-gray-100 p-5 mb-4'>
				<div className='text-xs text-gray-500 uppercase tracking-wide mb-2'>
					Добавить IP вручную
				</div>
				<form
					className='flex items-center gap-2'
					onSubmit={e => {
						e.preventDefault();
						if (newIp.trim()) void addIp(newIp.trim());
					}}>
					<Input
						value={newIp}
						onChange={e => setNewIp(e.target.value)}
						placeholder='83.28.132.68'
						className='font-mono'
						disabled={busy}
					/>
					<Button
						type='submit'
						disabled={busy || !newIp.trim()}
						size='sm'>
						Добавить
					</Button>
				</form>
			</div>

			<div className='bg-white rounded-xl border border-gray-100 overflow-hidden'>
				<div className='px-5 py-3 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide'>
					Список исключений ({ips.length})
				</div>
				{loading ? (
					<div className='px-5 py-6 text-center text-gray-400 text-sm'>
						Загрузка…
					</div>
				) : ips.length === 0 ? (
					<div className='px-5 py-6 text-center text-gray-400 text-sm'>
						Нет исключённых IP.
					</div>
				) : (
					<ul className='divide-y divide-gray-100'>
						{ips.map(ip => (
							<li
								key={ip}
								className='px-5 py-3 flex items-center justify-between gap-3'>
								<code className='text-sm font-mono text-gray-900'>{ip}</code>
								<button
									type='button'
									onClick={() => removeIp(ip)}
									disabled={busy}
									className='text-xs text-red-500 hover:text-red-700 inline-flex items-center gap-1 disabled:opacity-50'>
									<Trash2 className='w-3.5 h-3.5' /> Удалить
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
