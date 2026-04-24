import { auth } from '@/lib/auth';
import { extractIP } from '@/lib/utils/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns the caller's resolved IP as seen by the server (first hop in
 * X-Forwarded-For, or X-Real-IP / CF-Connecting-IP). Used by the settings
 * UI to offer a one-click "exclude my current IP" action.
 */
export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const ip = extractIP(request);
	return NextResponse.json({ ip });
}
