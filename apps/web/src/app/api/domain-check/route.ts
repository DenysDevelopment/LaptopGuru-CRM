import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
	const domain = request.nextUrl.searchParams.get('domain');
	if (!domain) return new Response(null, { status: 400 });

	const crmDomain = process.env.DOMAIN ?? 'localhost';
	if (domain === crmDomain) return new Response(null, { status: 200 });

	const company = await prisma.company.findFirst({
		where: { customDomain: domain, isActive: true },
	});

	return new Response(null, { status: company ? 200 : 404 });
}
