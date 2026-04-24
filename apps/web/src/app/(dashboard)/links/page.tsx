'use client';

import { PERMISSIONS, hasPermission } from '@laptopguru-crm/shared';
import { BarChart3, Eye, Mail, ShoppingBag, Trash2 } from 'lucide-react';
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
	previewToken: string;
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
							<div className='bg-white rounded-xl border border-gray-100 overflow-hidden'>
								<div className='overflow-x-auto'>
									<table className='w-full text-sm'>
										<thead className='bg-gray-50 text-xs text-gray-500 uppercase tracking-wide'>
											<tr>
												<th className='text-left font-medium px-4 py-2.5 w-20 whitespace-nowrap'>
													Время
												</th>
												<th className='text-left font-medium px-4 py-2.5'>
													Лендинг
												</th>
												<th className='text-left font-medium px-4 py-2.5'>
													Короткие ссылки
												</th>
												<th className='text-right font-medium px-3 py-2.5'>
													Визиты
												</th>
												<th className='text-right font-medium px-3 py-2.5'>
													Клики
												</th>
												<th className='text-right font-medium px-3 py-2.5'>
													Переходы
												</th>
												<th className='text-right font-medium px-4 py-2.5'>
													Действия
												</th>
											</tr>
										</thead>
										<tbody className='divide-y divide-gray-100'>
											{group.items.map(landing => {
												const totalShortClicks = landing.shortLinks.reduce(
													(sum, sl) => sum + sl.clicks,
													0,
												);
												const isEmail = !!landing.incomingEmail;
												const isAllegro = landing.type === 'allegro';
												return (
													<tr
														key={landing.id}
														className='hover:bg-gray-50/60 transition-colors align-top'>
														<td className='px-4 py-3 text-xs text-gray-500 tabular-nums whitespace-nowrap'>
															{formatTime(landing.createdAt)}
														</td>
														<td className='px-4 py-3 max-w-sm'>
												<div className='min-w-0'>
													<div className='flex items-center gap-2 flex-wrap'>
														<span
															className='font-semibold text-gray-900 truncate'
															title={landing.title}>
															{cleanTitle(landing.title)}
														</span>
														{isEmail && (
															<span
																className='inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-sky-500/10 to-indigo-500/10 text-sky-700 ring-1 ring-inset ring-sky-500/20'
																title='Лендинг создан из email-заявки'>
																<Mail className='w-3 h-3' strokeWidth={2.5} />
																Email
															</span>
														)}
														{isAllegro && (
															<span
																className='inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-500/10 to-amber-500/10 text-orange-700 ring-1 ring-inset ring-orange-500/20'
																title='Лендинг создан из Allegro'>
																<ShoppingBag
																	className='w-3 h-3'
																	strokeWidth={2.5}
																/>
																Allegro
															</span>
														)}
													</div>
													{landing.incomingEmail && (
														<div className='mt-1 text-xs text-gray-500 truncate'>
															<span className='text-gray-700 font-medium'>
																{landing.incomingEmail.customerName || '—'}
															</span>
															{landing.incomingEmail.customerEmail && (
																<>
																	<span className='text-gray-300 mx-1'>·</span>
																	<span>
																		{landing.incomingEmail.customerEmail}
																	</span>
																</>
															)}
														</div>
													)}
												</div>
											</td>
											<td className='px-4 py-3 max-w-[14rem]'>
												<div className='flex flex-col gap-0.5'>
													{landing.shortLinks.map(sl => (
														<button
															key={sl.code}
															onClick={() =>
																copyToClipboard(`${shortUrlBase}/${sl.code}`)
															}
															className='text-xs text-brand hover:text-brand-hover transition-colors truncate text-left'
															title='Скопировать'>
															{(effectiveDomain ??
																origin.replace(/^https?:\/\//, '')) +
																'/' +
																sl.code}
														</button>
													))}
												</div>
											</td>
											<td className='px-3 py-3 text-right text-gray-900 font-semibold tabular-nums'>
												{landing.views}
											</td>
											<td className='px-3 py-3 text-right text-gray-900 font-semibold tabular-nums'>
												{landing.clicks}
											</td>
											<td className='px-3 py-3 text-right text-gray-900 font-semibold tabular-nums'>
												{totalShortClicks}
											</td>
											<td className='px-4 py-3 text-right'>
												<div className='inline-flex items-center gap-3 text-xs'>
													<button
														type='button'
														onClick={() => {
															// On a custom domain, middleware rewrites
															// `/{slug}` -> `/l/{slug}` internally; the
															// public URL must NOT include the /l/ prefix.
															// CRM origin keeps the explicit /l/ path.
															const path = effectiveDomain
																? `/${landing.slug}`
																: `/l/${landing.slug}`;
															copyToClipboard(
																`${shortUrlBase}${path}?preview=${landing.previewToken}`,
															);
														}}
														className='text-gray-500 hover:text-gray-900 font-medium transition-colors inline-flex items-center gap-1'
														title='Скопировать превью-ссылку без трекинга'>
														<Eye className='w-3.5 h-3.5' />
														<span className='hidden md:inline'>Превью</span>
													</button>
													<Link
														href={`/analytics/${landing.slug}`}
														className='text-brand hover:text-brand-hover font-medium transition-colors inline-flex items-center gap-1'>
														<BarChart3 className='w-3.5 h-3.5' />
														<span className='hidden md:inline'>
															Аналитика
														</span>
													</Link>
													{canDelete && (
														<button
															type='button'
															onClick={() => handleDelete(landing)}
															disabled={deletingId === landing.id}
															className='text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1'
															title='Удалить лендинг (только админ)'>
															<Trash2 className='w-3.5 h-3.5' />
															<span className='hidden md:inline'>
																{deletingId === landing.id
																	? 'Удаляю'
																	: 'Удалить'}
															</span>
														</button>
													)}
												</div>
											</td>
										</tr>
												);
											})}
										</tbody>
									</table>
								</div>
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
