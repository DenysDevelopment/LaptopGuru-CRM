import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS, ALL_PERMISSIONS } from "@shorterlink/shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.USERS_MANAGE);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const { role, permissions } = body;

  // Prevent self-modification of role and permissions
  if (id === session.user.id) {
    if (role !== undefined && role !== "ADMIN") {
      return NextResponse.json(
        { error: "Нельзя снять с себя роль ADMIN" },
        { status: 400 },
      );
    }
    if (permissions !== undefined) {
      return NextResponse.json(
        { error: "Нельзя изменять свои собственные права" },
        { status: 400 },
      );
    }
  }

  // Validate role
  if (role !== undefined && !["ADMIN", "USER"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Validate permissions — only allow known values
  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) {
      return NextResponse.json({ error: "permissions must be an array" }, { status: 400 });
    }
    const invalid = permissions.filter(
      (p: string) => !ALL_PERMISSIONS.includes(p as typeof ALL_PERMISSIONS[number]),
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown permissions: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }
  }

  // Verify target user exists AND belongs to the same company
  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser || targetUser.companyId !== companyId) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(role !== undefined && { role }),
      ...(permissions !== undefined && { permissions }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      createdAt: true,
    },
  });

  // Audit log
  console.log(
    `[AUDIT] User ${session.user.email} (${session.user.id}) modified user ${user.email} (${user.id}):`,
    { role: role ?? "(unchanged)", permissions: permissions ? `${permissions.length} perms` : "(unchanged)" },
  );

  return NextResponse.json(user);
}
