'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ConversationList } from '@/components/messaging/conversation-list';

const SETTINGS_PATHS = [
	'/messaging/settings',
	'/messaging/analytics',
];

function isSettingsOrSubPage(pathname: string): boolean {
	return SETTINGS_PATHS.some((p) => pathname.startsWith(p));
}

function isConversationPage(pathname: string): boolean {
	return pathname.startsWith('/messaging/conversations/');
}

const NAV_TABS = [
	{ href: '/messaging', label: 'Входящие', icon: InboxIcon },
];

export default function MessagingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();

	// On settings/contacts/analytics sub-pages, show full-width layout
	const showSidebar = isSettingsOrSubPage(pathname);
	// On conversation detail on mobile, hide the list
	const isConversation = isConversationPage(pathname);

	if (showSidebar) {
		return (
			<div className='flex flex-col h-screen'>
				{/* Sub-navigation */}
				<div className='bg-white border-b border-gray-200'>
					<div className='max-w-6xl mx-auto px-4 sm:px-6'>
						<div className='flex items-center gap-1 py-2 overflow-x-auto'>
							{NAV_TABS.map((tab) => {
								const isActive =
									tab.href === '/messaging'
										? pathname === '/messaging' || pathname.startsWith('/messaging/inbox') || pathname.startsWith('/messaging/conversations')
										: pathname.startsWith(tab.href);
								return (
									<Link
										key={tab.href}
										href={tab.href}
										className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
											isActive
												? 'text-brand bg-brand-light'
												: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
										}`}>
										<tab.icon className={`w-4 h-4 ${isActive ? 'text-brand' : 'text-gray-400'}`} />
										{tab.label}
									</Link>
								);
							})}
						</div>
					</div>
				</div>
				<div className='max-w-6xl mx-auto px-4 sm:px-6 py-6'>
					{children}
				</div>
			</div>
		);
	}

	// Inbox / Conversation layout: left panel (conversation list) + right panel (content)
	return (
		<div className='flex flex-col h-screen'>
			{/* Top nav */}
			<div className='bg-white border-b border-gray-200 flex-shrink-0'>
				<div className='flex items-center gap-1 px-3 py-2 overflow-x-auto'>
					{NAV_TABS.map((tab) => {
						const isActive =
							tab.href === '/messaging'
								? pathname === '/messaging' || pathname.startsWith('/messaging/inbox') || pathname.startsWith('/messaging/conversations')
								: pathname.startsWith(tab.href);
						return (
							<Link
								key={tab.href}
								href={tab.href}
								className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
									isActive
										? 'text-brand bg-brand-light'
										: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
								}`}>
								<tab.icon className={`w-4 h-4 ${isActive ? 'text-brand' : 'text-gray-400'}`} />
								{tab.label}
							</Link>
						);
					})}
				</div>
			</div>

			<div className='flex flex-1 min-h-0'>
				{/* Left panel: conversation list */}
				<div
					className={`w-full md:w-80 md:flex-shrink-0 bg-white border-r border-gray-200 flex flex-col ${
						isConversation ? 'hidden md:flex' : 'flex'
					}`}>
					<ConversationList />
				</div>

				{/* Right panel: content */}
				<div
					className={`flex-1 min-w-0 flex flex-col bg-gray-50/50 ${
						isConversation ? 'flex' : 'hidden md:flex'
					}`}>
					{children}
				</div>
			</div>
		</div>
	);
}

// --- Nav icons ---

function InboxIcon({ className }: { className?: string }) {
	return (
		<svg className={className} fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
			<path strokeLinecap='round' strokeLinejoin='round' d='M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h2.21a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-17.5 0V6.75A2.25 2.25 0 0 1 4.5 4.5h15A2.25 2.25 0 0 1 21.75 6.75v6.75m-19.5 0v4.5A2.25 2.25 0 0 1 4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25v-4.5' />
		</svg>
	);
}
