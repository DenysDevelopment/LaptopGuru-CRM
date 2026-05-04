'use client';

import { Check } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { hasPermission, PERMISSIONS } from '@laptopguru-crm/shared';

import {
	STATUS_OPTIONS,
	type ConversationDetail,
} from './conversation-sidebar.types';
import { SidebarContact } from './sidebar-contact';
import { SidebarMetadata } from './sidebar-metadata';
import { SidebarNotes } from './sidebar-notes';
import {
	patchConversation,
	setConversationStatus,
} from '@/services/messaging/conversations.service';

export function ConversationSidebar({
	conversation,
	onUpdate,
}: {
	conversation: ConversationDetail;
	onUpdate: () => void;
}) {
	const { data: session } = useSession();
	const userRole = session?.user?.role;
	const userPermissions = session?.user?.permissions;

	const canWrite = hasPermission(userRole, userPermissions, PERMISSIONS.MESSAGING_CONVERSATIONS_WRITE);
	const canClose = hasPermission(userRole, userPermissions, PERMISSIONS.MESSAGING_CONVERSATIONS_CLOSE);
	const canWriteNotes = hasPermission(userRole, userPermissions, PERMISSIONS.MESSAGING_NOTES_WRITE);
	const canResolve =
		canClose &&
		conversation.status !== 'RESOLVED' &&
		conversation.status !== 'CLOSED';

	const updateConversation = async (field: 'status' | 'priority', value: string) => {
		try {
			// Status goes through the dedicated endpoint so it produces a
			// STATUS_CHANGED event, updates lastStatusChangedBy/At and emits
			// the SSE notification — same path as the header pill control.
			// Priority still uses the plain PATCH route.
			if (field === 'status') {
				await setConversationStatus(conversation.id, value);
			} else {
				await patchConversation(conversation.id, { [field]: value });
			}
			onUpdate();
		} catch { /* ignore */ }
	};

	return (
		<div className='w-80 border-l border-gray-200 bg-white overflow-y-auto flex-shrink-0 hidden lg:block'>
			<div className='p-4 space-y-5'>
				{canResolve && (
					<button
						type='button'
						onClick={() => updateConversation('status', 'RESOLVED')}
						className='w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-3 py-2.5 rounded-lg shadow-sm transition-colors'>
						<Check className='w-4 h-4' strokeWidth={3} />
						Завершить
					</button>
				)}
				<section>
					<h3 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>
						Статус
					</h3>
					<select
						value={conversation.status}
						onChange={(e) => updateConversation('status', e.target.value)}
						disabled={!canWrite}
						className='w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:opacity-50'>
						{STATUS_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</section>

				{conversation.contact && <SidebarContact contact={conversation.contact} />}

				<SidebarNotes
					conversationId={conversation.id}
					canWriteNotes={canWriteNotes}
				/>

				<SidebarMetadata
					channelType={conversation.channelType}
					createdAt={conversation.createdAt}
					closedAt={conversation.closedAt}
					subject={conversation.subject}
				/>
			</div>
		</div>
	);
}

export type { ConversationDetail };
