import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_NOTES_WRITE);
  if (error) return error;

  const body = await request.json();
  const { conversationId, body: noteBody } = body;

  if (!conversationId || !noteBody?.trim()) {
    return NextResponse.json(
      { error: "conversationId and body are required" },
      { status: 400 },
    );
  }

  // Verify conversation belongs to caller's company
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { companyId: true },
  });
  if (!conversation || conversation.companyId !== (session.user!.companyId ?? "")) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const note = await prisma.internalNote.create({
    data: {
      conversationId,
      authorId: session.user!.id,
      body: noteBody.trim(),
      companyId: session.user!.companyId ?? "",
    },
    include: {
      author: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(note, { status: 201 });
}
