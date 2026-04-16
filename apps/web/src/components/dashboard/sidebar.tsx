'use client';

import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { hasPermission, PERMISSIONS } from '@laptopguru-crm/shared';
import type { Permission } from '@laptopguru-crm/shared';
import { useMessagingEvents } from '@/hooks/use-messaging-events';

interface NavChild {
	href: string;
	label: string;
	permission?: Permission;
	color?: string;
}

interface NavItem {
	href: string;
	label: string;
	permission?: Permission;
	module?: string;
	icon: React.ReactNode;
	children?: NavChild[];
	comingSoon?: boolean;
}

interface EmailChannel {
	id: string;
	name: string;
	isActive: boolean;
}

const navItems: NavItem[] = [
	{
		href: '/dashboard',
		label: 'Dashboard',
		comingSoon: true,
		icon: (
			<svg
				className='w-5 h-5'
				fill='none'
				viewBox='0 0 24 24'
				strokeWidth={1.5}
				stroke='currentColor'>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z'
				/>
			</svg>
		),
	},
	{
		href: '/messaging',
		label: 'Почта',
		module: 'messaging',
		comingSoon: true,
		permission: PERMISSIONS.MESSAGING_INBOX_READ,
		icon: (
			<svg
				className='w-5 h-5'
				fill='none'
				viewBox='0 0 24 24'
				strokeWidth={1.5}
				stroke='currentColor'>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z'
				/>
			</svg>
		),
		children: [
			{ href: '/messaging', label: 'Все', permission: PERMISSIONS.MESSAGING_INBOX_READ },
			// Dynamic EMAIL channel children are added in the component
		],
	},
	{
		href: '/emails',
		label: 'Видеообзоры',
		module: 'emails',
		permission: PERMISSIONS.EMAILS_READ,
		icon: (
			<svg
				className='w-5 h-5'
				fill='none'
				viewBox='0 0 24 24'
				strokeWidth={1.5}
				stroke='currentColor'>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75'
				/>
			</svg>
		),
		children: [
			{ href: '/emails', label: 'Входящие', permission: PERMISSIONS.EMAILS_READ },
			{ href: '/videos', label: 'Видеообзоры', permission: PERMISSIONS.VIDEOS_READ },
			{ href: '/links', label: 'Лендинги', permission: PERMISSIONS.LINKS_READ },
			{ href: '/sent', label: 'Отправленные', permission: PERMISSIONS.SENT_READ },
		],
	},
	{
		href: '/quicklinks',
		label: 'Короткие ссылки',
		module: 'quicklinks',
		permission: PERMISSIONS.QUICKLINKS_READ,
		icon: (
			<svg
				className='w-5 h-5'
				fill='none'
				viewBox='0 0 24 24'
				strokeWidth={1.5}
				stroke='currentColor'>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25'
				/>
			</svg>
		),
	},
	{
		href: '/labels',
		label: 'Этикетки',
		icon: (
			<svg
				className='w-5 h-5'
				fill='none'
				viewBox='0 0 24 24'
				strokeWidth={1.5}
				stroke='currentColor'>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.455c0-1.08.768-2.014 1.837-2.174a48.078 48.078 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.75a1.5 1.5 0 0 0-1.5-1.5h-7.5a1.5 1.5 0 0 0-1.5 1.5v3.284'
				/>
			</svg>
		),
	},
	{
		href: '/settings/channels',
		label: 'Настройки',
		module: 'messaging',
		permission: PERMISSIONS.MESSAGING_CHANNELS_READ,
		icon: (
			<svg
				className='w-5 h-5'
				fill='none'
				viewBox='0 0 24 24'
				strokeWidth={1.5}
				stroke='currentColor'>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z'
				/>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'
				/>
			</svg>
		),
	},
	{
		href: '/admin/users',
		label: 'Пользователи',
		permission: PERMISSIONS.USERS_MANAGE,
		icon: (
			<svg
				className='w-5 h-5'
				fill='none'
				viewBox='0 0 24 24'
				strokeWidth={1.5}
				stroke='currentColor'>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z'
				/>
			</svg>
		),
	},
];

export function Sidebar() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const currentChannelId = searchParams.get('channel');
	const { data: session } = useSession();
	const [unreadCount, setUnreadCount] = useState(0);
	const [emailChannels, setEmailChannels] = useState<EmailChannel[]>([]);

	const userRole = session?.user?.role;
	const userPermissions = session?.user?.permissions;

	const fetchUnread = useCallback(async () => {
		try {
			const res = await fetch('/api/messaging/conversations?limit=50');
			if (res.ok) {
				const data = await res.json();
				const items = data.items || [];
				const total = items.reduce((sum: number, c: { unreadCount?: number }) => sum + (c.unreadCount || 0), 0);
				setUnreadCount(total);
			}
		} catch {}
	}, []);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		fetchUnread();
	}, [fetchUnread]);

	// Fetch EMAIL channels for sidebar
	useEffect(() => {
		async function fetchEmailChannels() {
			try {
				const res = await fetch('/api/messaging/channels');
				if (res.ok) {
					const data = await res.json();
					const channels = (data.channels || []).filter(
						(ch: { type: string; isActive: boolean }) => ch.type === 'EMAIL' && ch.isActive
					);
					 
					setEmailChannels(channels);
				}
			} catch {}
		}
		fetchEmailChannels();
	}, []);

	// Real-time update unread count
	useMessagingEvents((event) => {
		if (event.type === 'new_message' || event.type === 'new_conversation' || event.type === 'conversation_updated') {
			fetchUnread();
		}
	});

	// Build nav items with dynamic EMAIL channels under "Почта"
	const enrichedNavItems = navItems.map(item => {
		if (item.href !== '/messaging' || emailChannels.length === 0) return item;

		const channelChildren: NavChild[] = emailChannels.map(ch => ({
			href: `/emails?channel=${ch.id}`,
			label: ch.name,
			permission: PERMISSIONS.MESSAGING_INBOX_READ,
		}));

		const children = [...(item.children || [])];
		children.push(...channelChildren);
		return { ...item, children };
	});

	const visibleItems = enrichedNavItems.filter(
		(item) =>
			!item.permission ||
			hasPermission(userRole, userPermissions, item.permission),
	);

	return (
		<>
			{/* Desktop sidebar */}
			<aside className='hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-gray-200'>
				<div className='flex flex-col flex-1 min-h-0'>
					{/* Logo */}
					<div className='h-24 flex items-end pb-2 px-5 border-b border-gray-100'>
						<Link href='/dashboard' className='flex flex-col items-center w-full'>
							<Image src='/LG_logo2.webp' alt='LaptopGuru' width={180} height={72} priority className='h-16 w-auto object-contain' unoptimized />
							<div className='flex items-center gap-1.5 -mt-0.5'>
								<div className='h-px w-6 bg-gradient-to-r from-transparent to-brand/40' />
								<span className='text-[11px] font-black tracking-[0.3em] text-brand'>CRM</span>
								<div className='h-px w-6 bg-gradient-to-l from-transparent to-brand/40' />
							</div>
						</Link>
					</div>

					{/* Send Video Button — prominent CTA */}
					{hasPermission(userRole, userPermissions, PERMISSIONS.SEND_EXECUTE) && (
						<div className='px-3 pt-4 pb-2'>
							<Link
								href='/send'
								className={`flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-bold rounded-xl transition-all shadow-lg shadow-brand/30 ${
									pathname.startsWith('/send')
										? 'bg-brand text-white'
										: 'bg-brand hover:bg-brand-hover text-white'
								}`}>
								<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z' />
								</svg>
								Отправить видео
							</Link>
						</div>
					)}

					{/* Navigation */}
					<nav className='flex-1 px-3 py-2 space-y-1'>
						{visibleItems.map(item => {
							if (item.comingSoon) {
								return (
									<div key={item.href}>
										<span
											className='flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-gray-300 cursor-not-allowed select-none'>
											<span className='text-gray-300'>
												{item.icon}
											</span>
											<span className='flex-1'>{item.label}</span>
											<span className='text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5'>
												Скоро
											</span>
										</span>
									</div>
								);
							}

							const isActive =
								item.href === '/dashboard'
									? pathname === '/dashboard'
									: pathname.startsWith(item.href);
							const isParentActive = item.children?.some(c => {
							if (c.href.includes('?channel=')) {
								return pathname === '/emails' && currentChannelId === new URL(c.href, 'http://x').searchParams.get('channel');
							}
							return pathname.startsWith(c.href);
						});

							return (
								<div key={item.href}>
									<Link
										href={item.href}
										className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
											isActive || isParentActive
												? 'text-brand bg-brand-light'
												: 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
										}`}>
										<span className={isActive || isParentActive ? 'text-brand' : 'text-gray-400'}>
											{item.icon}
										</span>
										<span className='flex-1'>{item.label}</span>
									{item.href === '/messaging' && unreadCount > 0 && (
										<span className='min-w-[20px] h-5 flex items-center justify-center bg-brand text-white text-xs font-medium rounded-full px-1.5'>
											{unreadCount > 99 ? '99+' : unreadCount}
										</span>
									)}
									</Link>
									{item.children && (isActive || isParentActive) && (
										<div className='ml-8 mt-1 space-y-0.5'>
											{item.children
												.filter(c => !c.permission || hasPermission(userRole, userPermissions, c.permission))
												.map(child => {
													const isChannelLink = child.href.includes('?channel=');
													const channelParam = isChannelLink ? new URL(child.href, 'http://x').searchParams.get('channel') : null;
													const isChildActive = isChannelLink
														? pathname === '/emails' && currentChannelId === channelParam
														: child.href === '/emails'
															? pathname.startsWith('/emails') && !currentChannelId
															: pathname.startsWith(child.href);

													return (
														<Link
															key={child.href}
															href={child.href}
															className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
																isChildActive
																	? 'text-brand bg-brand-light/50'
																	: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
															}`}>
															{child.color && (
																<span className='w-2 h-2 rounded-full flex-shrink-0' style={{ backgroundColor: child.color }} />
															)}
															{child.label}
														</Link>
													);
												})}
										</div>
									)}
								</div>
							);
						})}
					</nav>

					{/* User section */}
					<div className='border-t border-gray-100 p-4'>
						{String((session?.user as unknown as Record<string, unknown>)?.companyName ?? '') !== '' && (
							<p className='text-[11px] font-semibold text-brand/70 uppercase tracking-widest mb-2 truncate'>
								{String((session?.user as unknown as Record<string, unknown>)?.companyName)}
							</p>
						)}
						<div className='flex items-center gap-3'>
							<div className='flex-1 min-w-0'>
								<p className='text-sm font-medium text-gray-900 truncate'>
									{session?.user?.name || 'Пользователь'}
								</p>
								<p className='text-xs text-gray-400 truncate'>
									{session?.user?.email}
								</p>
							</div>
						</div>
						<button
							onClick={() => signOut({ callbackUrl: '/login' })}
							className='mt-3 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors text-left'>
							Выйти
						</button>
						<p className='mt-4 text-[10px] text-gray-500 text-center'>
							Developed with 💛 by{' '}
							<a href='https://t.me/denys_maksymuck' className='hover:text-gray-700'>Denys</a>
						</p>
						<p className='mt-1 text-[9px] text-gray-300 text-center font-mono'>
							v{process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'}
						</p>
					</div>
				</div>
			</aside>

			{/* Mobile bottom navigation */}
			<nav className='md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex justify-around px-2 py-1 safe-bottom'>
				{visibleItems.slice(0, 5).map(item => {
					if (item.comingSoon) {
						return (
							<span
								key={item.href}
								className='flex flex-col items-center gap-0.5 px-2 py-1.5 text-xs font-medium text-gray-300 cursor-not-allowed relative'>
								{item.icon}
								<span className='truncate max-w-[60px]'>{item.label}</span>
							</span>
						);
					}

					const isActive =
						item.href === '/dashboard'
							? pathname === '/dashboard'
							: pathname.startsWith(item.href);

					return (
						<Link
							key={item.href}
							href={item.href}
							className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-xs font-medium transition-colors ${
								isActive ? 'text-brand' : 'text-gray-400'
							}`}>
							{item.icon}
							<span className='truncate max-w-[60px]'>{item.label}</span>
						</Link>
					);
				})}
			</nav>
		</>
	);
}
