import { api } from '@/lib/api';
import { normalizeListResponse } from '@/lib/utils/normalize-response';

export type TeamMember = {
	id: string;
	name: string | null;
	email: string;
	role: string;
};

export type Team = {
	id: string;
	name: string;
	description: string | null;
	members: TeamMember[];
	createdAt: string;
};

export async function listTeams(): Promise<Team[]> {
	const response = await api.get('/messaging/teams');
	return normalizeListResponse<Team>(response.data);
}

export type CreateTeamPayload = {
	name: string;
	description?: string;
};

export async function createTeam(payload: CreateTeamPayload): Promise<Team> {
	const response = await api.post<Team>('/messaging/teams', payload);
	return response.data;
}

export async function removeTeamMember(teamId: string, memberId: string): Promise<void> {
	await api.delete(`/messaging/teams/${teamId}/members/${memberId}`);
}
