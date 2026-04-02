import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@shorterlink/shared";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await authorize(PERMISSIONS.VIDEOS_WRITE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const { id } = await params;

  // Verify video belongs to the same company
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.companyId !== companyId) {
    return NextResponse.json({ error: "Відео не знайдено" }, { status: 404 });
  }

  // Soft delete
  await prisma.video.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({ ok: true });
}
