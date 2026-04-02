'use client';

import { usePathname } from 'next/navigation';
import { ConversationList } from '@/components/messaging/conversation-list';

export default function MessagingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const isConversation = pathname.startsWith('/messaging/conversations/');

	// Full-width layout for analytics sub-page
	if (pathname.startsWith('/messaging/analytics')) {
		return (
			<div className='flex flex-col h-screen'>
				<div className='max-w-6xl mx-auto px-4 sm:px-6 py-6 flex-1'>
					{children}
				</div>
			</div>
		);
	}

	// Inbox / Conversation layout: left panel (conversation list) + right panel (content)
	return (
		<div className='flex flex-col h-screen'>
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
