'use client';

import { useState, useEffect, useCallback } from 'react';
import { normalizeListResponse } from '@/lib/utils/normalize-response';
import { TeamForm } from '@/components/dashboard/settings/team-form';
import { Button } from '@/components/ui/button';
import type { TeamInput } from '@/lib/schemas/team';

interface TeamMember {
	id: string;
	name: string | null;
	email: string;
	role: string;
}

interface Team {
	id: string;
	name: string;
	description: string | null;
	members: TeamMember[];
	createdAt: string;
}

export default function TeamsSettingsPage() {
	const [teams, setTeams] = useState<Team[]>([]);
	const [loading, setLoading] = useState(true);
	const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
	const [showCreateModal, setShowCreateModal] = useState(false);

	const fetchTeams = useCallback(async () => {
		try {
			const res = await fetch('/api/messaging/teams');
			if (res.ok) {
				const data = await res.json();
				setTeams(normalizeListResponse(data));
			}
		} catch { /* ignore */ }
		setLoading(false);
	}, []);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		fetchTeams();
	}, [fetchTeams]);

	const handleCreate = async (data: TeamInput) => {
		const res = await fetch('/api/messaging/teams', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: data.name,
				description: data.description || null,
			}),
		});
		if (res.ok) {
			setShowCreateModal(false);
			fetchTeams();
		}
	};

	const removeMember = async (teamId: string, memberId: string) => {
		try {
			await fetch(`/api/messaging/teams/${teamId}/members/${memberId}`, {
				method: 'DELETE',
			});
			setTeams((prev) =>
				prev.map((t) =>
					t.id === teamId
						? { ...t, members: t.members.filter((m) => m.id !== memberId) }
						: t,
				),
			);
		} catch { /* ignore */ }
	};

	return (
		<div>
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Команды</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Управление командами операторов
					</p>
				</div>
				<Button
					type='button'
					onClick={() => setShowCreateModal(true)}
					className='bg-brand hover:bg-brand-hover text-white'>
					<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M12 4.5v15m7.5-7.5h-15' />
					</svg>
					Создать команду
				</Button>
			</div>

			{loading ? (
				<div className='text-center py-12 text-gray-400'>Загрузка...</div>
			) : teams.length === 0 ? (
				<div className='text-center py-16 bg-white rounded-xl border border-gray-100'>
					<p className='text-sm text-gray-400'>Команд пока нет</p>
				</div>
			) : (
				<div className='space-y-3'>
					{teams.map((team) => (
						<div
							key={team.id}
							className='bg-white rounded-xl border border-gray-100 overflow-hidden'>
							<div
								className='flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors'
								onClick={() =>
									setExpandedTeam(expandedTeam === team.id ? null : team.id)
								}>
								<div className='w-10 h-10 rounded-lg bg-brand-light flex items-center justify-center'>
									<svg className='w-5 h-5 text-brand' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
										<path strokeLinecap='round' strokeLinejoin='round' d='M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z' />
									</svg>
								</div>
								<div className='flex-1 min-w-0'>
									<h3 className='text-sm font-medium text-gray-900'>
										{team.name}
									</h3>
									{team.description && (
										<p className='text-xs text-gray-400'>{team.description}</p>
									)}
								</div>
								<span className='text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg'>
									{team.members.length} чел.
								</span>
								<svg
									className={`w-4 h-4 text-gray-400 transition-transform ${
										expandedTeam === team.id ? 'rotate-180' : ''
									}`}
									fill='none'
									viewBox='0 0 24 24'
									strokeWidth={1.5}
									stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' />
								</svg>
							</div>

							{expandedTeam === team.id && (
								<div className='border-t border-gray-100'>
									{team.members.length === 0 ? (
										<p className='px-4 py-6 text-sm text-gray-400 text-center'>
											Нет участников
										</p>
									) : (
										<div className='divide-y divide-gray-50'>
											{team.members.map((member) => (
												<div
													key={member.id}
													className='flex items-center gap-3 px-4 py-3'>
													<div className='w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600'>
														{(member.name || member.email)[0]?.toUpperCase()}
													</div>
													<div className='flex-1 min-w-0'>
														<p className='text-sm font-medium text-gray-900 truncate'>
															{member.name || member.email}
														</p>
														<p className='text-xs text-gray-400'>
															{member.email}
														</p>
													</div>
													<span className='text-xs text-gray-400'>
														{member.role}
													</span>
													<button
														onClick={() => removeMember(team.id, member.id)}
														className='p-1 text-gray-400 hover:text-red-500 transition-colors'>
														<svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
															<path strokeLinecap='round' strokeLinejoin='round' d='M6 18 18 6M6 6l12 12' />
														</svg>
													</button>
												</div>
											))}
										</div>
									)}
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{/* Create modal */}
			{showCreateModal && (
				<div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
					<div className='absolute inset-0 bg-black/40' onClick={() => setShowCreateModal(false)} />
					<div className='relative bg-white rounded-2xl shadow-xl max-w-md w-full'>
						<div className='p-6'>
							<h2 className='text-lg font-bold text-gray-900 mb-4'>Новая команда</h2>
							<TeamForm
								submitLabel='Создать'
								onSubmit={handleCreate}
								onCancel={() => setShowCreateModal(false)}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
