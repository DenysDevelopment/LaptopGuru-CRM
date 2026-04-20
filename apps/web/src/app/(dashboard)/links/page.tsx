'use client';

import { PERMISSIONS, hasPermission } from '@laptopguru-crm/shared';
import { BarChart3, Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Landing {
	id: string;
	slug: string;
	title: string;
	views: number;
	clicks: number;
	createdAt: string;
	video: { title: string; thumbnail: string; createdAt: string };
	shortLinks: { code: string; clicks: number }[];
	incomingEmail: {
		customerName: string | null;
		customerEmail: string | null;
	} | null;
}

export default function LinksPage() {
	const { data: session } = useSession();
	const [landings, setLandings] = useState<Landing[]>([]);
	const [loading, setLoading] = useState(true);
	const [customDomain, setCustomDomain] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const canDelete = hasPermission(
		(session?.user as { role?: string } | undefined)?.role,
		(session?.user as { permissions?: string[] } | undefined)?.permissions,
		PERMISSIONS.LINKS_DELETE,
	);

	useEffect(() => {
		fetch('/api/links')
			.then(r => r.json())
			.then(d => {
				setLandings(d);
				setLoading(false);
			});
		fetch('/api/company-settings')
			.then(r => r.json())
			.then(d => setCustomDomain(d?.customDomain ?? null))
			.catch(() => {});
	}, []);

	const origin = typeof window !== 'undefined' ? window.location.origin : '';
	const isLocalhost =
		typeof window !== 'undefined' &&
		/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
	const effectiveDomain = isLocalhost ? null : customDomain;
	const shortUrlBase = effectiveDomain ? `https://${effectiveDomain}` : origin;

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
	}

	async function handleDelete(landing: Landing) {
		const visitsNote =
			landing.views > 0
				? ` Все ${landing.views} визитов и статистика будут удалены.`
				: '';
		if (
			!confirm(
				`Удалить лендинг «${landing.title}»?${visitsNote}\n\nЭто действие нельзя отменить.`,
			)
		)
			return;
		setDeletingId(landing.id);
		try {
			const r = await fetch(`/api/links/${landing.id}`, { method: 'DELETE' });
			if (!r.ok) {
				const err = await r.json().catch(() => ({}));
				alert(`Не удалось удалить: ${err.error || r.status}`);
				return;
			}
			setLandings(prev => prev.filter(l => l.id !== landing.id));
		} finally {
			setDeletingId(null);
		}
	}

	return (
		<div>
			<div className='mb-6'>
				<h1 className='text-2xl font-bold text-gray-900'>Ссылки</h1>
				<p className='mt-1 text-sm text-gray-500'>Лендинги и короткие ссылки</p>
			</div>

			{loading ? (
				<div className='text-center py-12 text-gray-400'>Загрузка...</div>
			) : landings.length === 0 ? (
				<div className='text-center py-12'>
					<p className='text-gray-400 text-lg'>Ссылок пока нет</p>
					<p className='text-gray-400 text-sm mt-1'>
						Они появятся после отправки первого письма
					</p>
				</div>
			) : (
				<div className='space-y-3'>
					{landings.map(landing => (
						<div
							key={landing.id}
							className='bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors'>
							<div className='flex items-start justify-between gap-4'>
								<div className='min-w-0 flex-1'>
									<h3 className='text-sm font-semibold text-gray-900'>
										{landing.title}
									</h3>
									{landing.incomingEmail && (
										<p className='text-xs text-gray-500 mt-0.5'>
											{landing.incomingEmail.customerName} ·{' '}
											{landing.incomingEmail.customerEmail}
										</p>
									)}
									<div className='flex flex-wrap gap-x-4 gap-y-1 mt-2 cursor-pointer cursor-pointer'>
										{landing.shortLinks.map(sl => (
											<button
												key={sl.code}
												onClick={() =>
													copyToClipboard(`${shortUrlBase}/${sl.code}`)
												}
												className='text-xs text-brand hover:text-brand-hover transition-colors'>
												{(effectiveDomain ??
													origin.replace(/^https?:\/\//, '')) +
													'/' +
													sl.code}{' '}
												— копировать
											</button>
										))}
									</div>
								</div>
								<div className='flex gap-4 text-center flex-shrink-0'>
									<div>
										<p className='text-lg font-bold text-gray-900'>
											{landing.views}
										</p>
										<p className='text-xs text-gray-400'>просмотров</p>
									</div>
									<div>
										<p className='text-lg font-bold text-gray-900'>
											{landing.clicks}
										</p>
										<p className='text-xs text-gray-400'>кликов</p>
									</div>
									<div>
										<p className='text-lg font-bold text-gray-900'>
											{landing.shortLinks.reduce(
												(sum, sl) => sum + sl.clicks,
												0,
											)}
										</p>
										<p className='text-xs text-gray-400'>переходов</p>
									</div>
								</div>
							</div>
							<div className='flex items-center justify-between mt-2'>
								<p className='text-xs text-gray-400'>
									{formatDateTime(landing.createdAt)}
								</p>
								<div className='flex items-center gap-4'>
									<Link
										href={`/analytics/${landing.slug}`}
										className='text-xs text-brand hover:text-brand-hover font-medium transition-colors'>
										<span className='inline-flex items-center gap-1'>
											<BarChart3 className='w-3.5 h-3.5' /> Аналитика
										</span>
									</Link>
									{canDelete && (
										<button
											type='button'
											onClick={() => handleDelete(landing)}
											disabled={deletingId === landing.id}
											className='text-xs text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
											title='Удалить лендинг (только админ)'>
											<span className='inline-flex items-center gap-1'>
												<Trash2 className='w-3.5 h-3.5' />
												{deletingId === landing.id ? 'Удаляю...' : 'Удалить'}
											</span>
										</button>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function formatDateTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleString('ru-RU', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

