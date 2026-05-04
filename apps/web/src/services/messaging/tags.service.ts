import { api } from '@/lib/api';
import { normalizeListResponse } from '@/lib/utils/normalize-response';

export type Tag = {
	id: string;
	name: string;
	color: string;
};

export async function listTags(): Promise<Tag[]> {
	const response = await api.get('/messaging/tags');
	return normalizeListResponse<Tag>(response.data);
}
