import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Very permissive IP validator — accepts IPv4 dotted-quad and IPv6 including
 * IPv4-mapped forms. Rejects obvious garbage but doesn't fully parse. Good
 * enough to catch typos, without pulling a full IP library.
 */
function isPlausibleIp(ip: string): boolean {
	const s = ip.trim();
	if (!s || s.length > 45) return false;
	// IPv4
	if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) {
		return s.split('.').every(p => {
			const n = Number(p);
			return n >= 0 && n <= 255;
		});
	}
	// IPv6 (loose — must have at least one `:` and only hex/colons/dots)
	return /^[0-9a-fA-F:.]+$/.test(s) && s.includes(':');
}

async function requireAdminCompany() {
	const session = await auth();
	const u = session?.user as
		| { companyId?: string | null; role?: string }
		| undefined;
	if (!u?.companyId) return { error: 'Unauthorized' as const, status: 401 };
	if (u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN') {
		return { error: 'Forbidden' as const, status: 403 };
	}
	return { companyId: u.companyId };
}

export async function GET() {
	const authz = await requireAdminCompany();
	if ('error' in authz) {
		return NextResponse.json({ error: authz.error }, { status: authz.status });
	}
	const company = await prisma.company.findUnique({
		where: { id: authz.companyId },
		select: { excludedIps: true },
	});
	return NextResponse.json({ excludedIps: company?.excludedIps ?? [] });
}

export async function POST(request: NextRequest) {
	const authz = await requireAdminCompany();
	if ('error' in authz) {
		return NextResponse.json({ error: authz.error }, { status: authz.status });
	}
	const body = (await request.json().catch(() => ({}))) as { ip?: string };
	const ip = body.ip?.trim();
	if (!ip || !isPlausibleIp(ip)) {
		return NextResponse.json({ error: 'Invalid IP' }, { status: 400 });
	}
	const company = await prisma.company.findUnique({
		where: { id: authz.companyId },
		select: { excludedIps: true },
	});
	const current = company?.excludedIps ?? [];
	if (current.includes(ip)) {
		return NextResponse.json({ excludedIps: current });
	}
	const updated = await prisma.company.update({
		where: { id: authz.companyId },
		data: { excludedIps: { push: ip } },
		select: { excludedIps: true },
	});
	return NextResponse.json({ excludedIps: updated.excludedIps });
}
