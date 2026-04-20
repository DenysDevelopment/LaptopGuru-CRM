'use client';

import { useCallback, useState } from 'react';
import { normalizeListResponse } from '@/lib/utils/normalize-response';
import type { ConversationDetail, Team } from './conversation-sidebar.types';

interface Props {
	conversationId: string;
	assignee: ConversationDetail['assignee'];
	canAssign: boolean;
	onUpdate: () => void;
}

export function SidebarAssignee({
	conversationId,
	assignee,
	canAssign,
	onUpdate,
}: Props) {
	const [teams, setTeams] = useState<Team[]>([]);
	const [showAssignPicker, setShowAssignPicker] = useState(false);

	const loadTeams = useCallback(async () => {
		try {
			const res = await fetch('/api/messaging/teams');
			if (res.ok) {
				const data = await res.json();
				setTeams(normalizeListResponse(data));
			}
		} catch {
			/* ignore */
		}
	}, []);

	const assignConversation = async (assigneeId: string) => {
		try {
			await fetch(`/api/messaging/conversations/${conversationId}/assign`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assigneeId }),
			});
			setShowAssignPicker(false);
			onUpdate();
		} catch {
			/* ignore */
		}
	};

	const togglePicker = () => {
		setShowAssignPicker(!showAssignPicker);
		if (!showAssignPicker) loadTeams();
	};

	return (
		<section>
			<h3 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>
				Оператор
			</h3>
			{assignee ? (
				<div className='flex items-center gap-2 p-2 bg-gray-50 rounded-lg'>
					<div className='w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-xs font-medium text-brand'>
						{assignee.name?.[0]?.toUpperCase() || '?'}
					</div>
					<div className='min-w-0 flex-1'>
						<p className='text-sm font-medium text-gray-700 truncate'>
							{assignee.name || assignee.email}
						</p>
					</div>
					{canAssign && (
						<button
							onClick={togglePicker}
							className='text-xs text-gray-400 hover:text-gray-600'>
							Изменить
						</button>
					)}
				</div>
			) : (
				<div>
					{canAssign ? (
						<button
							onClick={togglePicker}
							className='w-full text-sm text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 rounded-lg p-2.5 transition-colors'>
							+ Назначить оператора
						</button>
					) : (
						<p className='text-sm text-gray-400'>Не назначен</p>
					)}
				</div>
			)}

			{showAssignPicker && (
				<div className='mt-2 border border-gray-200 rounded-lg bg-white shadow-sm max-h-48 overflow-y-auto'>
					{teams.length === 0 ? (
						<p className='px-3 py-2 text-xs text-gray-400'>Нет команд</p>
					) : (
						teams.map(team => (
							<div key={team.id}>
								<p className='px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-50'>
									{team.name}
								</p>
								{team.members.map(m => (
									<button
										key={m.id}
										onClick={() => assignConversation(m.id)}
										className='w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors'>
										{m.name || m.email}
									</button>
								))}
							</div>
						))
					)}
				</div>
			)}
		</section>
	);
}
