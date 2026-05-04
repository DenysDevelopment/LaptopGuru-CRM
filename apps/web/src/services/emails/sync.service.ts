import { api } from '@/lib/api';

export async function triggerEmailSync(): Promise<void> {
	await api.post('/emails/sync');
}
