import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { extractIP } from '@/lib/utils/headers';

interface LandingCtx {
	companyId: string;
	previewToken: string;
}

interface ExcludeArgs {
	req: NextRequest;
	landing: LandingCtx;
	/**
	 * When provided, skips the DB round-trip to fetch excludedIps.
	 * Pass the landing's company if you already loaded it.
	 */
	excludedIps?: string[];
	/**
	 * Optional raw preview token from the URL — if the caller already parsed
	 * it (e.g. from an async server component), skip re-reading searchParams.
	 */
	previewToken?: string | null;
}

/**
 * Returns true when analytics tracking should NOT be recorded for this
 * request. Three layers, any of which triggers exclusion:
 *
 *   1. Preview-token match: `?preview=<landing.previewToken>` on the URL.
 *   2. Authenticated admin of the same company (valid NextAuth session).
 *   3. Client IP is in the company's excludedIps allowlist.
 */
export async function isTrackingExcluded(args: ExcludeArgs): Promise<boolean> {
	const { req, landing } = args;

	// 1. Preview token
	const urlToken =
		args.previewToken ?? req.nextUrl.searchParams.get('preview');
	if (urlToken && urlToken === landing.previewToken) return true;

	// 2. Admin session of the same company
	try {
		const session = await auth();
		const sessionCompanyId = (session?.user as { companyId?: string } | undefined)
			?.companyId;
		if (sessionCompanyId && sessionCompanyId === landing.companyId) return true;
	} catch {
		// auth() can throw in edge contexts — treat as anonymous
	}

	// 3. IP allowlist on company
	const excludedIps = args.excludedIps ?? (await loadExcludedIps(landing.companyId));
	if (excludedIps.length === 0) return false;
	const ip = extractIP(req);
	if (!ip) return false;
	return excludedIps.includes(ip);
}

async function loadExcludedIps(companyId: string): Promise<string[]> {
	const company = await prisma.company.findUnique({
		where: { id: companyId },
		select: { excludedIps: true },
	});
	return company?.excludedIps ?? [];
}

/**
 * Variant without NextRequest — used from server components (`page.tsx`)
 * where we have `headers()` instead of a request object. Takes the already
 * resolved IP, session companyId, and URL search params map.
 */
export function isTrackingExcludedSync(args: {
	landing: LandingCtx;
	ip: string | null;
	sessionCompanyId: string | null;
	previewToken: string | null;
	excludedIps: string[];
}): boolean {
	if (args.previewToken && args.previewToken === args.landing.previewToken) {
		return true;
	}
	if (args.sessionCompanyId && args.sessionCompanyId === args.landing.companyId) {
		return true;
	}
	if (args.ip && args.excludedIps.includes(args.ip)) return true;
	return false;
}
