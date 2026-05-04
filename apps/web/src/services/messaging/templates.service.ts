import { api } from '@/lib/api';
import { normalizeListResponse } from '@/lib/utils/normalize-response';

export type Template = {
	id: string;
	name: string;
	body: string;
	channelType: string | null;
	status: string;
	variables: string[];
	createdAt: string;
};

export async function listTemplates(): Promise<Template[]> {
	const response = await api.get('/messaging/templates');
	return normalizeListResponse<Template>(response.data);
}

export type SaveTemplatePayload = {
	name: string;
	body: string;
	channelType: string | null;
};

export async function createTemplate(payload: SaveTemplatePayload): Promise<Template> {
	const response = await api.post<Template>('/messaging/templates', payload);
	return response.data;
}

export async function updateTemplate(
	id: string,
	payload: SaveTemplatePayload,
): Promise<Template> {
	const response = await api.patch<Template>(`/messaging/templates/${id}`, payload);
	return response.data;
}
