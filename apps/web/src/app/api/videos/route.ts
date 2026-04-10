import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { extractYoutubeId, fetchVideoInfo } from "@/lib/youtube";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET() {
  const { session, error } = await authorize(PERMISSIONS.VIDEOS_READ);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const videos = await prisma.video.findMany({
    where: { active: true, companyId },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  // BigInt (fileSize) can't be JSON-serialized — convert to number
  const serializable = videos.map((v) => ({
    ...v,
    fileSize: v.fileSize ? Number(v.fileSize) : null,
  }));

  return NextResponse.json(serializable);
}

export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.VIDEOS_WRITE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const { url } = await request.json();
  if (!url) {
    return NextResponse.json({ error: "URL обов'язковий" }, { status: 400 });
  }

  const youtubeId = extractYoutubeId(url);
  if (!youtubeId) {
    return NextResponse.json({ error: "Невірне YouTube посилання" }, { status: 400 });
  }

  // Check if already exists for this company
  const existing = await prisma.video.findUnique({
    where: { youtubeId_companyId: { youtubeId, companyId } },
  });
  if (existing) {
    if (!existing.active) {
      // Reactivate
      const video = await prisma.video.update({
        where: { id: existing.id },
        data: { active: true },
      });
      return NextResponse.json(video);
    }
    return NextResponse.json({ error: "Відео вже додано" }, { status: 409 });
  }

  const info = await fetchVideoInfo(youtubeId);

  const video = await prisma.video.create({
    data: {
      youtubeId: info.youtubeId,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      channelTitle: info.channelTitle,
      publishedAt: info.publishedAt ? new Date(info.publishedAt) : null,
      userId: session.user.id,
      companyId,
    },
  });

  return NextResponse.json(video, { status: 201 });
}
