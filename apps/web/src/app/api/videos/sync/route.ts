import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { fetchChannelVideos } from "@/lib/youtube";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function POST() {
  const { session, error } = await authorize(PERMISSIONS.VIDEOS_WRITE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { youtubeChannelHandle: true },
  });

  if (!company?.youtubeChannelHandle) {
    return NextResponse.json({ error: "YouTube канал не подключен" }, { status: 400 });
  }

  try {
    const videos = await fetchChannelVideos(company.youtubeChannelHandle);
    let imported = 0;

    for (const video of videos) {
      const existing = await prisma.video.findUnique({
        where: { youtubeId_companyId: { youtubeId: video.youtubeId, companyId } },
      });

      if (existing) {
        const newPublishedAt = video.publishedAt ? new Date(video.publishedAt) : existing.publishedAt;
        const needsUpdate =
          !existing.active ||
          existing.title !== video.title ||
          existing.thumbnail !== video.thumbnail ||
          existing.duration !== video.duration ||
          existing.publishedAt?.getTime() !== newPublishedAt?.getTime();

        if (needsUpdate) {
          await prisma.video.update({
            where: { id: existing.id },
            data: {
              active: true,
              title: video.title,
              thumbnail: video.thumbnail,
              duration: video.duration,
              publishedAt: newPublishedAt,
            },
          });
          if (!existing.active) imported++;
        }
        continue;
      }

      await prisma.video.create({
        data: {
          youtubeId: video.youtubeId,
          title: video.title,
          thumbnail: video.thumbnail,
          duration: video.duration,
          channelTitle: video.channelTitle,
          publishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
          userId: session.user.id,
          companyId,
        },
      });
      imported++;
    }

    await prisma.company.update({
      where: { id: companyId },
      data: { youtubeLastSyncAt: new Date() },
    });

    return NextResponse.json({ imported, total: videos.length });
  } catch (err) {
    console.error("[VIDEO SYNC ERROR]", err);
    return NextResponse.json({ error: "Ошибка синхронизации видео" }, { status: 500 });
  }
}
