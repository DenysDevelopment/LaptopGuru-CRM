import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_TEAMS_MANAGE);
  if (error) return error;

  const { id: teamId, memberId } = await params;

  // Verify team belongs to caller's company
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { companyId: true } });
  if (!team || team.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.teamMember.deleteMany({
    where: {
      teamId,
      userId: memberId,
    },
  });

  return NextResponse.json({ ok: true });
}
