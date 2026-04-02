import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_CONVERSATIONS_ASSIGN);
  if (error) return error;

  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!conversation || conversation.companyId !== (session.user!.companyId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { assigneeId } = body;

  if (!assigneeId) {
    return NextResponse.json({ error: "assigneeId is required" }, { status: 400 });
  }

  // Deactivate current assignments
  await prisma.conversationAssignment.updateMany({
    where: { conversationId: id, isActive: true },
    data: { isActive: false, unassignedAt: new Date() },
  });

  // Create new assignment
  const assignment = await prisma.conversationAssignment.create({
    data: {
      conversationId: id,
      userId: assigneeId,
      assignedBy: session.user!.id,
      isActive: true,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(assignment, { status: 201 });
}
