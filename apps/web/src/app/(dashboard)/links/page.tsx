'use client';

import { PERMISSIONS, hasPermission } from '@laptopguru-crm/shared';
import { BarChart3, Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/use-confirm';

interface Landing {
	id: string;
	slug: string;
	title: string;
	type: string; // "email" | "allegro"
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
	const confirm = useConfirm();
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

	async function copyToClipboard(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Ссылка скопирована', { description: text });
		} catch {
			toast.error('Не удалось скопировать');
		}
	}

	async function handleDelete(landing: Landing) {
		const visitsNote =
			landing.views > 0
				? ` Все ${landing.views} визитов и статистика будут удалены.`
				: '';
		const ok = await confirm({
			title: `Удалить лендинг «${cleanTitle(landing.title)}»?`,
			description: `${visitsNote} Это действие нельзя отменить.`.trim(),
			confirmLabel: 'Удалить',
			cancelLabel: 'Отмена',
			variant: 'destructive',
		});
		if (!ok) return;
		setDeletingId(landing.id);
		try {
			const r = await fetch(`/api/links/${landing.id}`, { method: 'DELETE' });
			if (!r.ok) {
				const err = await r.json().catch(() => ({}));
				toast.error('Не удалось удалить лендинг', {
					description: err.error || `HTTP ${r.status}`,
				});
				return;
			}
			setLandings(prev => prev.filter(l => l.id !== landing.id));
			toast.success('Лендинг удалён');
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
				<div className='space-y-6'>
					{groupByDay(landings).map(group => (
						<section key={group.key}>
							<h2 className='text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2'>
								{group.label}
								<span className='ml-2 text-gray-400 font-normal normal-case tracking-normal'>
									{group.items.length}{' '}
									{pluralize(
										group.items.length,
										'лендинг',
										'лендинга',
										'лендингов',
									)}
								</span>
							</h2>
							<div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'>
								{group.items.map(landing => {
									const totalShortClicks = landing.shortLinks.reduce(
										(sum, sl) => sum + sl.clicks,
										0,
									);
									return (
										<div
											key={landing.id}
											className='bg-white rounded-xl border border-gray-100 p-3 hover:border-gray-200 transition-colors flex flex-col gap-2'>
											<div>
												<div className='flex items-center gap-2'>
													<h3
														className='text-sm font-semibold text-gray-900 line-clamp-1 flex-1 min-w-0'
														title={landing.title}>
														{cleanTitle(landing.title)}
													</h3>
													{landing.type === 'allegro' && (
														<span
															className='text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 flex-shrink-0'
															title='Лендинг создан из Allegro'>
															Allegro
														</span>
													)}
												</div>
												{landing.incomingEmail && (
													<p className='text-xs text-gray-500 line-clamp-1'>
														{landing.incomingEmail.customerName} ·{' '}
														{landing.incomingEmail.customerEmail}
													</p>
												)}
											</div>

											<div className='flex flex-wrap gap-x-3 gap-y-0.5'>
												{landing.shortLinks.map(sl => (
													<button
														key={sl.code}
														onClick={() =>
															copyToClipboard(`${shortUrlBase}/${sl.code}`)
														}
														className='text-xs text-brand hover:text-brand-hover transition-colors truncate max-w-full'
														title='Скопировать'>
														{(effectiveDomain ??
															origin.replace(/^https?:\/\//, '')) +
															'/' +
															sl.code}
													</button>
												))}
											</div>

											<div className='flex items-center gap-4 text-xs text-gray-500 mt-auto'>
												<span>
													<b className='text-gray-900'>{landing.views}</b>{' '}
													просмотров
												</span>
												<span>
													<b className='text-gray-900'>{landing.clicks}</b>{' '}
													кликов
												</span>
												<span>
													<b className='text-gray-900'>{totalShortClicks}</b>{' '}
													переходов
												</span>
											</div>

											<div className='flex items-center justify-between pt-2 border-t border-gray-100 text-xs'>
												<span className='text-gray-400'>
													{formatTime(landing.createdAt)}
												</span>
												<div className='flex items-center gap-3'>
													<Link
														href={`/analytics/${landing.slug}`}
														className='text-brand hover:text-brand-hover font-medium transition-colors inline-flex items-center gap-1'>
														<BarChart3 className='w-3.5 h-3.5' /> Аналитика
													</Link>
													{canDelete && (
														<button
															type='button'
															onClick={() => handleDelete(landing)}
															disabled={deletingId === landing.id}
															className='text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1'
															title='Удалить лендинг (только админ)'>
															<Trash2 className='w-3.5 h-3.5' />
															{deletingId === landing.id
																? 'Удаляю'
																: 'Удалить'}
														</button>
													)}
												</div>
											</div>
										</div>
									);
								})}
							</div>
						</section>
					))}
				</div>
			)}
		</div>
	);
}

function groupByDay(
	items: Landing[],
): { key: string; label: string; items: Landing[] }[] {
	const byKey = new Map<string, Landing[]>();
	for (const l of items) {
		const d = new Date(l.createdAt);
		if (Number.isNaN(d.getTime())) continue;
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const arr = byKey.get(key);
		if (arr) arr.push(l);
		else byKey.set(key, [l]);
	}
	return [...byKey.entries()]
		.sort((a, b) => (a[0] < b[0] ? 1 : -1))
		.map(([key, group]) => ({
			key,
			label: dayLabel(new Date(group[0].createdAt)),
			items: group,
		}));
}

function dayLabel(d: Date): string {
	const today = new Date();
	const yesterday = new Date();
	yesterday.setDate(today.getDate() - 1);
	const sameDay = (a: Date, b: Date) =>
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate();
	if (sameDay(d, today)) return 'Сегодня';
	if (sameDay(d, yesterday)) return 'Вчера';
	return d.toLocaleDateString('ru-RU', {
		day: 'numeric',
		month: 'long',
		year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
	});
}

function pluralize(n: number, one: string, few: string, many: string): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	if (mod10 === 1 && mod100 !== 11) return one;
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
	return many;
}

function cleanTitle(title: string): string {
	return title.replace(/^Recenzja wideo:\s*/i, '').trim() || title;
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleTimeString('ru-RU', {
		hour: '2-digit',
		minute: '2-digit',
	});
}
