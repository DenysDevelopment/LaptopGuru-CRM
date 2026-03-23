'use client';

import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
	{
		href: '/dashboard',
		label: 'Dashboard',
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
		href: '/emails',
		label: 'Заявки',
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
	},
	{
		href: '/videos',
		label: 'Видео',
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
					d='m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z'
				/>
			</svg>
		),
	},
	{
		href: '/send',
		label: 'Отправить',
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
					d='M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5'
				/>
			</svg>
		),
	},
	{
		href: '/links',
		label: 'Ссылки',
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
					d='M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244'
				/>
			</svg>
		),
	},
	{
		href: '/quicklinks',
		label: 'Редиректы',
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
		href: '/sent',
		label: 'История',
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
					d='M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
				/>
			</svg>
		),
	},
];

export function Sidebar() {
	const pathname = usePathname();
	const { data: session } = useSession();

	return (
		<>
			{/* Desktop sidebar */}
			<aside className='hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-gray-200'>
				<div className='flex flex-col flex-1 min-h-0'>
					{/* Logo */}
					<div className='h-16 flex items-center px-5 border-b border-gray-100'>
						<Link href='/dashboard' className='flex items-baseline gap-1.5'>
							<span className='text-lg font-bold text-gray-900'>
								LaptopGuru
							</span>
						</Link>
					</div>

					{/* Navigation */}
					<nav className='flex-1 px-3 py-4 space-y-1'>
						{navItems.map(item => {
							const isActive =
								item.href === '/dashboard'
									? pathname === '/dashboard'
									: pathname.startsWith(item.href);

							return (
								<Link
									key={item.href}
									href={item.href}
									className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
										isActive
											? 'text-brand bg-brand-light'
											: 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
									}`}>
									<span className={isActive ? 'text-brand' : 'text-gray-400'}>
										{item.icon}
									</span>
									{item.label}
								</Link>
							);
						})}
					</nav>

					{/* User section */}
					<div className='border-t border-gray-100 p-4'>
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
							Developed with 💛 by
							<a href='https://t.me/denys_maksymuck'>Denys</a>
						</p>
					</div>
				</div>
			</aside>

			{/* Mobile bottom navigation */}
			<nav className='md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex justify-around px-2 py-1 safe-bottom'>
				{navItems.map(item => {
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
