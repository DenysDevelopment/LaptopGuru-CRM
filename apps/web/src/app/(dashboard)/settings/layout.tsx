'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SETTINGS_TABS = [
	{ href: '/settings/channels', label: 'Каналы' },
	{ href: '/settings/templates', label: 'Шаблоны' },
	{ href: '/settings/quick-replies', label: 'Быстрые ответы' },
	{ href: '/settings/domain', label: 'Домен' },
];

export default function SettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();

	return (
		<div>
			{/* Settings sub-tabs */}
			<div className='flex gap-1 mb-6 overflow-x-auto pb-1'>
				{SETTINGS_TABS.map((tab) => {
					const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
					return (
						<Link
							key={tab.href}
							href={tab.href}
							className={`flex-shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
								isActive
									? 'bg-gray-900 text-white'
									: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
							}`}>
							{tab.label}
						</Link>
					);
				})}
			</div>

			<div className='min-h-[60vh]'>
				{children}
			</div>
		</div>
	);
}
