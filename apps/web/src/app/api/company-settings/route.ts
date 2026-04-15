import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
	const session = await auth();
	if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { companyId, role } = session.user as unknown as { companyId: string | null; role: string };
	if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });

	const company = await prisma.company.findUnique({
		where: { id: companyId },
		select: { id: true, name: true, slug: true, description: true, logo: true, customDomain: true },
	});

	return NextResponse.json(company);
}

export async function PATCH(request: NextRequest) {
	const session = await auth();
	if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { companyId, role } = session.user as unknown as { companyId: string | null; role: string };
	if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
	if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
		return NextResponse.json({ error: "Only admins can change company settings" }, { status: 403 });
	}

	const body = await request.json();
	const { customDomain } = body as { customDomain?: string | null };

	if (customDomain !== undefined && customDomain !== null && customDomain !== "") {
		const domain = customDomain.toLowerCase().trim();
		if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
			return NextResponse.json({ error: "Неверный формат домена" }, { status: 400 });
		}
		const existing = await prisma.company.findFirst({
			where: { customDomain: domain, id: { not: companyId } },
		});
		if (existing) {
			return NextResponse.json({ error: "Домен уже используется другой компанией" }, { status: 409 });
		}
	}

	const company = await prisma.company.update({
		where: { id: companyId },
		data: {
			customDomain: customDomain === "" ? null : (customDomain?.toLowerCase().trim() ?? undefined),
		},
		select: { id: true, name: true, slug: true, description: true, logo: true, customDomain: true },
	});

	return NextResponse.json(company);
}
