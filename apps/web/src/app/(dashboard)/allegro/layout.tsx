'use client';

import { usePathname } from 'next/navigation';
import { ConversationList } from '@/components/messaging/conversation-list';

/**
 * Allegro is a thin alias of /messaging — same components, same store, but
 * URL-scoped to ALLEGRO so the sidebar and breadcrumbs read clearly. The
 * conversation list and conversation detail components both detect the
 * `/allegro` prefix via usePathname and adapt their links + filters.
 */
export default function AllegroLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const isConversation = pathname.startsWith('/allegro/conversations/');

	return (
		<div className='flex flex-col h-screen'>
			<div className='flex flex-1 min-h-0'>
				<div
					className={`w-full md:w-80 md:flex-shrink-0 bg-white border-r border-gray-200 flex flex-col ${
						isConversation ? 'hidden md:flex' : 'flex'
					}`}>
					<ConversationList forceChannelType='ALLEGRO' />
				</div>
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
