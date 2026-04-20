import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await authorize(PERMISSIONS.VIDEOS_WRITE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.companyId !== companyId) {
    return NextResponse.json({ error: "Відео не знайдено" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  if (typeof body.publishToYoutube === "boolean") {
    data.publishToYoutube = body.publishToYoutube;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.video.update({ where: { id }, data });
  return NextResponse.json({ ok: true, video: JSON.parse(JSON.stringify(updated, (_k, v) => typeof v === "bigint" ? Number(v) : v)) });
}

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
  await writeAudit({
    userId: session.user.id,
    companyId,
    action: "DELETE",
    entity: "Video",
    entityId: id,
    payload: { title: video.title, source: video.source },
  });
  return NextResponse.json({ ok: true });
}
