import { prisma } from '@/lib/db';
import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';

/**
 * Resolve companyId from x-custom-domain header (set by middleware).
 * For use in Server Components (page.tsx, layout.tsx).
 */
export async function resolveCompanyFromDomain(): Promise<string | null> {
	const h = await headers();
	const customDomain = h.get('x-custom-domain');
	if (!customDomain) return null;

	const company = await prisma.company.findFirst({
		where: { customDomain, isActive: true },
		select: { id: true },
	});
	return company?.id ?? null;
}

/**
 * Resolve companyId from x-custom-domain header on a request object.
 * For use in Route Handlers (route.ts).
 */
export async function resolveCompanyFromRequest(req: NextRequest): Promise<string | null> {
	const customDomain = req.headers.get('x-custom-domain');
	if (!customDomain) return null;

	const company = await prisma.company.findFirst({
		where: { customDomain, isActive: true },
		select: { id: true },
	});
	return company?.id ?? null;
}
