'use client';

import { useMessagingEvents } from '@/hooks/use-messaging-events';
import type { Permission } from '@laptopguru-crm/shared';
import { hasPermission, PERMISSIONS } from '@laptopguru-crm/shared';
import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getUnreadSummary } from '@/services/messaging/conversations.service';
import { listChannels } from '@/services/messaging/channels.service';

interface NavChild {
	href: string;
	label: string;
	permission?: Permission;
	color?: string;
	count?: number;
}

interface NavItem {
	href: string;
	label: string;
	permission?: Permission;
	module?: string;
	icon: React.ReactNode;
	children?: NavChild[];
	comingSoon?: boolean;
	collapsibleKey?: string;
	defaultOpen?: boolean;
	count?: number;
	/**
	 * When set, the item renders as a nested row under another sibling
	 * (matched by that sibling's `collapsibleKey`). Visually indented + a
	 * vertical rail; visibility follows the parent's collapsed state.
	 */
	nestedUnder?: string;
}

interface MessagingChannel {
	id: string;
	name: string;
	type: string;
	isActive: boolean;
}

const CHANNEL_TYPE_LABELS: Record<string, string> = {
	EMAIL: 'Email',
	ALLEGRO: 'Allegro',
	WHATSAPP: 'WhatsApp',
	TELEGRAM: 'Telegram',
	SMS: 'SMS',
	FACEBOOK_MESSENGER: 'Messenger',
	INSTAGRAM_DIRECT: 'Instagram',
};

// Sidebar categorisation: which channel types belong to each top-level
// messaging group. Order here defines render order.
const MESSAGING_CATEGORIES: Array<{
	key: string;
	label: string;
	allLabel: string;
	channelTypes: string[];
	icon: React.ReactNode;
}> = [
	{
		key: 'email',
		label: 'Email',
		allLabel: 'Все email',
		channelTypes: ['EMAIL'],
		icon: (
			<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
				<path strokeLinecap='round' strokeLinejoin='round' d='M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75' />
			</svg>
		),
	},
	{
		key: 'messengers',
		label: 'Мессенджеры',
		allLabel: 'Все мессенджеры',
		channelTypes: ['TELEGRAM', 'WHATSAPP', 'SMS', 'FACEBOOK_MESSENGER', 'INSTAGRAM_DIRECT'],
		icon: (
			<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
				<path strokeLinecap='round' strokeLinejoin='round' d='M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z' />
			</svg>
		),
	},
	{
		key: 'marketplaces',
		label: 'Allegro',
		allLabel: 'Все Allegro',
		channelTypes: ['ALLEGRO'],
		icon: (
			<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
				<path strokeLinecap='round' strokeLinejoin='round' d='M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z' />
			</svg>
		),
	},
];

const baseNavItems: NavItem[] = [
	{
		href: '/dashboard',
		label: 'Главная',
		icon: (
			<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
				<path strokeLinecap='round' strokeLinejoin='round' d='M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z' />
			</svg>
		),
	},
	{
		href: '/messaging',
		label: 'Inbox',
		module: 'messaging',
		permission: PERMISSIONS.MESSAGING_INBOX_READ,
		collapsibleKey: 'inbox',
		defaultOpen: true,
		icon: (
			<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
				<path strokeLinecap='round' strokeLinejoin='round' d='M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z' />
			</svg>
		),
	},
	{
		href: '/emails',
		label: 'Видеообзоры',
		module: 'emails',
		permission: PERMISSIONS.EMAILS_READ,
		collapsibleKey: 'video-pipeline',
		defaultOpen: true,
		icon: (
			<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
				<path strokeLinecap='round' strokeLinejoin='round' d='m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z' />
			</svg>
		),
		children: [
			{ href: '/emails', label: 'Заявки с сайта', permission: PERMISSIONS.EMAILS_READ },
			{ href: '/videos', label: 'Видео', permission: PERMISSIONS.VIDEOS_READ },
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
			<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
				<path strokeLinecap='round' strokeLinejoin='round' d='M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25' />
			</svg>
		),
	},
	{
		href: 'http://173.242.57.32:5050/parser',
		label: 'Парсер',
		icon: (
			<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
				<path strokeLinecap='round' strokeLinejoin='round' d='M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z' />
			</svg>
		),
	},
	{
		href: '/labels',
		label: 'Этикетки',
		icon: (
			<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
				<path strokeLinecap='round' strokeLinejoin='round' d='M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.455c0-1.08.768-2.014 1.837-2.174a48.078 48.078 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.75a1.5 1.5 0 0 0-1.5-1.5h-7.5a1.5 1.5 0 0 0-1.5 1.5v3.284' />
			</svg>
		),
	},
	{
		href: '/settings/channels',
		label: 'Настройки',
		module: 'messaging',
		permission: PERMISSIONS.MESSAGING_CHANNELS_READ,
		icon: (
			<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
				<path strokeLinecap='round' strokeLinejoin='round' d='M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z' />
				<path strokeLinecap='round' strokeLinejoin='round' d='M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' />
			</svg>
		),
	},
	{
		href: '/admin/users',
		label: 'Пользователи',
		permission: PERMISSIONS.USERS_MANAGE,
		icon: (
			<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
				<path strokeLinecap='round' strokeLinejoin='round' d='M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z' />
			</svg>
		),
	},
];

function useCollapsedSet(): [Set<string>, (key: string) => void] {
	// Lazy initialiser pulls the value once on mount instead of doing it
	// inside an effect — avoids the cascading-render lint warning and
	// removes a useless render before the localStorage value is applied.
	const [collapsed, setCollapsed] = useState<Set<string>>(() => {
		if (typeof window === 'undefined') return new Set();
		try {
			const raw = window.localStorage.getItem('sidebar.collapsed');
			if (raw) return new Set(JSON.parse(raw) as string[]);
		} catch {}
		return new Set();
	});
	const toggle = useCallback((key: string) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			try {
				localStorage.setItem('sidebar.collapsed', JSON.stringify([...next]));
			} catch {}
			return next;
		});
	}, []);
	return [collapsed, toggle];
}

export function Sidebar() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const currentChannelId = searchParams.get('channel');
	const currentChannelType = searchParams.get('channelType');
	const currentChannelTypes = searchParams.get('channelTypes');
	const currentFilter = searchParams.get('filter');
	const { data: session } = useSession();
	const [unreadCount, setUnreadCount] = useState(0);
	const [messagingChannels, setMessagingChannels] = useState<MessagingChannel[]>([]);
	const [collapsed, toggleCollapsed] = useCollapsedSet();

	const userRole = session?.user?.role;
	const userPermissions = session?.user?.permissions;

	const fetchUnread = useCallback(async () => {
		try {
			const { items } = await getUnreadSummary();
			const total = items.reduce(
				(sum, c) => sum + (c.unreadCount || 0),
				0,
			);
			setUnreadCount(total);
		} catch {}
	}, []);

	useEffect(() => {
		// Inline async load (matching the fetchChannels pattern below) so the
		// linter doesn't flag this as a sync setState in an effect — the
		// state update happens after the awaited fetch resolves.
		async function loadUnread() {
			try {
				const { items } = await getUnreadSummary();
				setUnreadCount(
					items.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
				);
			} catch {}
		}
		loadUnread();
	}, []);

	useEffect(() => {
		async function fetchChannels() {
			try {
				const list = await listChannels();
				setMessagingChannels(
					(list as unknown as MessagingChannel[]).filter((ch) => ch.isActive),
				);
			} catch {}
		}
		fetchChannels();
	}, []);

	useMessagingEvents((event) => {
		if (
			event.type === 'new_message' ||
			event.type === 'new_conversation' ||
			event.type === 'conversation_updated'
		) {
			fetchUnread();
		}
	});

	// Build per-category sidebar entries from connected channels.
	const messagingCategoryItems: NavItem[] = useMemo(() => {
		return MESSAGING_CATEGORIES.flatMap((cat) => {
			const channels = messagingChannels
				.filter((ch) => cat.channelTypes.includes(ch.type))
				.sort((a, b) => {
					const ai = cat.channelTypes.indexOf(a.type);
					const bi = cat.channelTypes.indexOf(b.type);
					if (ai !== bi) return ai - bi;
					return a.name.localeCompare(b.name);
				});
			if (channels.length === 0) return [];

			const typesParam = cat.channelTypes.join(',');
			const allHref =
				cat.channelTypes.length === 1
					? `/messaging?channelType=${cat.channelTypes[0]}`
					: `/messaging?channelTypes=${typesParam}`;

			const channelChildren: NavChild[] = channels.map((ch) => {
				const typeLabel = CHANNEL_TYPE_LABELS[ch.type] ?? ch.type;
				// The category header already shows the type ("Email", "Allegro"),
				// so child rows only need the channel's own identifier/name —
				// no "Email: ..." prefix.
				return {
					href: `/messaging?channel=${ch.id}`,
					label: ch.name || typeLabel,
					permission: PERMISSIONS.MESSAGING_INBOX_READ,
				};
			});

			return [
				{
					href: allHref,
					label: cat.label,
					module: 'messaging',
					permission: PERMISSIONS.MESSAGING_INBOX_READ,
					icon: cat.icon,
					collapsibleKey: `cat:${cat.key}`,
					defaultOpen: true,
					nestedUnder: 'inbox',
					children: [
						{
							href: allHref,
							label: cat.allLabel,
							permission: PERMISSIONS.MESSAGING_INBOX_READ,
						},
						...channelChildren,
					],
				},
			];
		});
	}, [messagingChannels]);

	// Splice category entries right after the Inbox item.
	const navItems: NavItem[] = useMemo(() => {
		const items: NavItem[] = [];
		for (const item of baseNavItems) {
			items.push(item);
			if (item.label === 'Inbox') items.push(...messagingCategoryItems);
		}
		return items;
	}, [messagingCategoryItems]);

	const visibleItems = navItems.filter(
		(item) =>
			(!item.permission ||
				hasPermission(userRole, userPermissions, item.permission)) &&
			// Nested items disappear when their parent group is collapsed.
			!(item.nestedUnder && collapsed.has(item.nestedUnder)),
	);

	function isChildActive(child: NavChild, parentHref: string): boolean {
		const u = new URL(child.href, 'http://x');
		const childPath = u.pathname;
		const childChannel = u.searchParams.get('channel');
		const childChannelType = u.searchParams.get('channelType');
		const childChannelTypes = u.searchParams.get('channelTypes');
		const childFilter = u.searchParams.get('filter');

		if (!pathname.startsWith(childPath)) return false;
		if (childChannel) return currentChannelId === childChannel;
		if (childChannelType)
			return currentChannelType === childChannelType && !currentChannelId;
		if (childChannelTypes)
			return currentChannelTypes === childChannelTypes && !currentChannelId;
		if (childFilter) return currentFilter === childFilter && !currentChannelId;
		if (childPath === parentHref || childPath === pathname) {
			return (
				!currentChannelId &&
				!currentChannelType &&
				!currentChannelTypes &&
				!currentFilter
			);
		}
		return true;
	}

	function isParentActive(item: NavItem): boolean {
		if (!item.children) return false;
		return item.children.some((c) => isChildActive(c, item.href));
	}

	return (
		<>
			{/* Desktop sidebar */}
			<aside className='hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-gray-200'>
				<div className='flex flex-col flex-1 min-h-0'>
					{/* Logo */}
					<div className='h-24 flex items-end pb-2 px-5 border-b border-gray-100'>
						<Link href='/dashboard' className='flex flex-col items-center w-full'>
							<Image
								src='/LG_logo2.webp'
								alt='LaptopGuru'
								width={180}
								height={72}
								priority
								className='h-16 w-auto object-contain'
								unoptimized
							/>
							<div className='flex items-center gap-1.5 -mt-0.5'>
								<div className='h-px w-6 bg-gradient-to-r from-transparent to-brand/40' />
								<span className='text-[11px] font-black tracking-[0.3em] text-brand'>
									CRM
								</span>
								<div className='h-px w-6 bg-gradient-to-l from-transparent to-brand/40' />
							</div>
						</Link>
					</div>

					{/* Send Video CTA */}
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
					<nav className='flex-1 px-3 py-2 space-y-0.5 overflow-y-auto'>
						{visibleItems.map((item, idx) => {
							// Add a gap above the first non-nested item that follows a
							// nested group, so Inbox + its categories breathe before the
							// next top-level section.
							const prev = idx > 0 ? visibleItems[idx - 1] : null;
							const groupBreak =
								!item.nestedUnder && !!prev?.nestedUnder;
							if (item.comingSoon) {
								return (
									<div key={item.href}>
										<span className='flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-gray-300 cursor-not-allowed select-none'>
											<span className='text-gray-300'>{item.icon}</span>
											<span className='flex-1'>{item.label}</span>
											<span className='text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5'>
												Скоро
											</span>
										</span>
									</div>
								);
							}

							const isExternal = /^https?:\/\//.test(item.href);
							const itemUrl = isExternal ? null : new URL(item.href, 'http://x');
							const itemPath = itemUrl?.pathname ?? '';
							const itemChannelType = itemUrl?.searchParams.get('channelType');
							const itemChannelTypes = itemUrl?.searchParams.get('channelTypes');
							const isActive = (() => {
								if (isExternal) return false;
								if (item.href === '/dashboard') return pathname === '/dashboard';
								if (!pathname.startsWith(itemPath)) return false;
								if (itemChannelType)
									return currentChannelType === itemChannelType && !currentChannelId;
								if (itemChannelTypes)
									return currentChannelTypes === itemChannelTypes && !currentChannelId;
								if (item.href === '/messaging')
									return (
										pathname === '/messaging' &&
										!currentChannelId &&
										!currentChannelType &&
										!currentChannelTypes &&
										!currentFilter
									);
								return true;
							})();
							const parentActive = isParentActive(item);
							const hasChildrenForHighlight = !!item.children?.length;

							const hasChildren = !!item.children?.length;
							const collapsibleKey = item.collapsibleKey;
							// Inbox has no `children` of its own — its category siblings
							// (Email/Messengers/Allegro) live as nested top-level rows
							// pointing back via `nestedUnder`. Show the caret + collapse
							// when either children or nested siblings exist.
							const hasNestedSiblings = !!(
								collapsibleKey &&
								navItems.some((other) => other.nestedUnder === collapsibleKey)
							);
							const togglable = !!(collapsibleKey && (hasChildren || hasNestedSiblings));
							const isCollapsed =
								togglable && collapsibleKey
									? collapsed.has(collapsibleKey) ||
										(!collapsed.has(collapsibleKey) && item.defaultOpen === false)
									: false;
							const isNested = !!item.nestedUnder;

							// Highlight rule: show the full brand-light background only on
							// a *leaf* item that's the current page. Parents that merely
							// contain the active item turn their text/icon brand-coloured
							// (no bg) so the sidebar isn't a wall of orange when several
							// parents share a path prefix (Inbox / Email / Allegro all
							// live under /messaging).
							const fullHighlight = isActive && !hasChildrenForHighlight;
							const textHighlight = parentActive || (isActive && hasChildrenForHighlight);
							const linkClass = `flex-1 flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
								fullHighlight
									? 'text-brand bg-brand-light'
									: textHighlight
										? 'text-brand hover:bg-gray-50'
										: 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
							}`;
							const linkContent = (
								<>
									<span
										className={
											fullHighlight || textHighlight
												? 'text-brand'
												: 'text-gray-400'
										}>
										{item.icon}
									</span>
									<span className='flex-1 truncate'>{item.label}</span>
									{item.label === 'Inbox' && unreadCount > 0 && (
										<span className='min-w-[20px] h-5 flex items-center justify-center bg-brand text-white text-[10px] font-semibold rounded-full px-1.5'>
											{unreadCount > 99 ? '99+' : unreadCount}
										</span>
									)}
									{isExternal && (
										<svg className='w-3 h-3 text-gray-300' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
											<path strokeLinecap='round' strokeLinejoin='round' d='M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25' />
										</svg>
									)}
								</>
							);

							return (
								<div
									key={item.href + item.label}
									className={[
										isNested ? 'ml-5' : '',
										groupBreak ? 'mt-6' : '',
									]
										.filter(Boolean)
										.join(' ') || undefined}>
									<div className='flex items-center'>
										{isExternal ? (
											<a
												href={item.href}
												target='_blank'
												rel='noopener noreferrer'
												className={linkClass}>
												{linkContent}
											</a>
										) : (
											<Link href={item.href} className={linkClass}>
												{linkContent}
											</Link>
										)}
										{togglable && collapsibleKey && (
											<button
												type='button'
												onClick={() => toggleCollapsed(collapsibleKey)}
												className='p-1.5 mr-1 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-50'
												title={isCollapsed ? 'Развернуть' : 'Свернуть'}>
												<svg
													className={`w-3.5 h-3.5 transition-transform ${
														isCollapsed ? '-rotate-90' : ''
													}`}
													fill='none'
													viewBox='0 0 24 24'
													strokeWidth={2}
													stroke='currentColor'>
													<path
														strokeLinecap='round'
														strokeLinejoin='round'
														d='m19.5 8.25-7.5 7.5-7.5-7.5'
													/>
												</svg>
											</button>
										)}
									</div>
									{hasChildren && !isCollapsed && (
										<div className='relative ml-9 mt-0.5 mb-1 space-y-0.5'>
											{item.children!
												.filter(
													(c) =>
														!c.permission ||
														hasPermission(userRole, userPermissions, c.permission),
												)
												.map((child) => {
													const childActive = isChildActive(child, item.href);
													return (
														<Link
															key={child.href + child.label}
															href={child.href}
															className={`relative flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
																childActive
																	? 'text-brand bg-brand-light/60 before:absolute before:-left-3 before:top-0 before:bottom-0 before:w-0.5 before:bg-brand before:rounded-r'
																	: 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
															}`}>
															{child.color && (
																<span
																	className='w-2 h-2 rounded-full flex-shrink-0'
																	style={{ backgroundColor: child.color }}
																/>
															)}
															<span className='truncate'>{child.label}</span>
															{typeof child.count === 'number' && child.count > 0 && (
																<span className='ml-auto text-[10px] font-semibold text-gray-400'>
																	{child.count}
																</span>
															)}
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
						{String(
							(session?.user as unknown as Record<string, unknown>)?.companyName ?? '',
						) !== '' && (
							<p className='text-[11px] font-semibold text-brand/70 uppercase tracking-widest mb-2 truncate'>
								{String(
									(session?.user as unknown as Record<string, unknown>)?.companyName,
								)}
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
							<a href='https://t.me/denys_maksymuck' className='hover:text-gray-700'>
								Denys
							</a>
						</p>
						<p className='mt-1 text-[9px] text-gray-300 text-center font-mono'>
							v{process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'}
						</p>
					</div>
				</div>
			</aside>

			{/* Mobile bottom navigation */}
			<nav className='md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex justify-around px-2 py-1 safe-bottom'>
				{visibleItems.slice(0, 5).map((item) => {
					if (item.comingSoon) {
						return (
							<span
								key={item.href + item.label}
								className='flex flex-col items-center gap-0.5 px-2 py-1.5 text-xs font-medium text-gray-300 cursor-not-allowed relative'>
								{item.icon}
								<span className='truncate max-w-[60px]'>{item.label}</span>
							</span>
						);
					}
					const isActive =
						item.href === '/dashboard'
							? pathname === '/dashboard'
							: pathname.startsWith(new URL(item.href, 'http://x').pathname);
					return (
						<Link
							key={item.href + item.label}
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
