'use client';

import { signOut, useSession } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
	{ href: '/dashboard', label: 'Главная' },
	{ href: '/emails', label: 'Заявки' },
	{ href: '/videos', label: 'Видео' },
	{ href: '/send', label: 'Отправить' },
	{ href: '/links', label: 'Ссылки' },
	{ href: '/sent', label: 'История' },
];

export function Header() {
	const pathname = usePathname();
	const { data: session } = useSession();

	return (
		<header className='sticky top-0 z-40 bg-white border-b border-gray-200'>
			<div className='max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between'>
				<Link href='/dashboard' className='flex items-baseline gap-1.5'>
					<span className='text-lg font-bold text-gray-900'>LaptopGuru CRM</span>
				</Link>

				<nav className='hidden md:flex items-center gap-1'>
					{navItems.map(item => {
						const isActive =
							item.href === '/dashboard'
								? pathname === '/dashboard'
								: pathname.startsWith(item.href);

						return (
							<Link
								key={item.href}
								href={item.href}
								className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
									isActive
										? 'text-brand bg-brand-light'
										: 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
								}`}>
								{item.label}
							</Link>
						);
					})}
				</nav>

				<div className='flex items-center gap-3'>
					<span className='text-sm text-gray-600 hidden sm:block'>
						{session?.user?.name || session?.user?.email}
					</span>
					<button
						onClick={() => signOut({ callbackUrl: '/login' })}
						className='text-sm text-gray-400 hover:text-gray-600 transition-colors'>
						Вийти
					</button>
				</div>
			</div>

			{/* Mobile navigation */}
			<nav className='md:hidden flex overflow-x-auto border-t border-gray-100 px-4 gap-1'>
				{navItems.map(item => {
					const isActive =
						item.href === '/dashboard'
							? pathname === '/dashboard'
							: pathname.startsWith(item.href);

					return (
						<Link
							key={item.href}
							href={item.href}
							className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
								isActive
									? 'text-brand border-b-2 border-brand'
									: 'text-gray-500'
							}`}>
							{item.label}
						</Link>
					);
				})}
			</nav>
		</header>
	);
}
