'use client';

import { useSession } from 'next-auth/react';
import { hasPermission, PERMISSIONS } from '@laptopguru-crm/shared';

import {
	PRIORITY_OPTIONS,
	STATUS_OPTIONS,
	type ConversationDetail,
} from './conversation-sidebar.types';
import { SidebarAssignee } from './sidebar-assignee';
import { SidebarContact } from './sidebar-contact';
import { SidebarMetadata } from './sidebar-metadata';
import { SidebarNotes } from './sidebar-notes';
import { SidebarTags } from './sidebar-tags';

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
	const canAssign = hasPermission(userRole, userPermissions, PERMISSIONS.MESSAGING_CONVERSATIONS_ASSIGN);
	const canManageTags = hasPermission(userRole, userPermissions, PERMISSIONS.MESSAGING_TAGS_MANAGE);
	const canWriteNotes = hasPermission(userRole, userPermissions, PERMISSIONS.MESSAGING_NOTES_WRITE);

	const updateConversation = async (field: string, value: string) => {
		try {
			await fetch(`/api/messaging/conversations/${conversation.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [field]: value }),
			});
			onUpdate();
		} catch { /* ignore */ }
	};

	return (
		<div className='w-80 border-l border-gray-200 bg-white overflow-y-auto flex-shrink-0 hidden lg:block'>
			<div className='p-4 space-y-5'>
				<section>
					<h3 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>
						Статус
					</h3>
					<div className='space-y-2'>
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
						<select
							value={conversation.priority}
							onChange={(e) => updateConversation('priority', e.target.value)}
							disabled={!canWrite}
							className='w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:opacity-50'>
							{PRIORITY_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					</div>
				</section>

				<SidebarAssignee
					conversationId={conversation.id}
					assignee={conversation.assignee}
					canAssign={canAssign}
					onUpdate={onUpdate}
				/>

				{conversation.contact && <SidebarContact contact={conversation.contact} />}

				<SidebarTags
					conversationId={conversation.id}
					tags={conversation.tags}
					canManageTags={canManageTags}
					onUpdate={onUpdate}
				/>

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
