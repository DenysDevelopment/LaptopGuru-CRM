import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { S3Client, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const MAX_BYTES = Number(process.env.VIDEO_UPLOAD_MAX_BYTES || 2_147_483_648);
const BUCKET = process.env.AWS_S3_VIDEO_BUCKET || "shorterlink-videos-eu-central-1";

export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.VIDEOS_WRITE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const { videoId } = await request.json();
  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || video.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (video.status !== "UPLOADING") {
    return NextResponse.json({ ok: true });
  }
  if (!video.s3KeyOriginal) {
    return NextResponse.json({ error: "Missing s3KeyOriginal" }, { status: 400 });
  }

  const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-central-1" });

  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: video.s3KeyOriginal }),
    );
    if (head.ContentLength && Number(head.ContentLength) > MAX_BYTES) {
      await s3.send(
        new DeleteObjectCommand({ Bucket: BUCKET, Key: video.s3KeyOriginal }),
      );
      await prisma.video.update({
        where: { id: videoId },
        data: { status: "FAILED", uploadError: "File too large" },
      });
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }
  } catch {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "FAILED", uploadError: "Upload verification failed" },
    });
    return NextResponse.json({ error: "Upload verification failed" }, { status: 500 });
  }

  // Mark as PROCESSING — NestJS picks up videos needing transcode via a repeatable job
  await prisma.video.update({
    where: { id: videoId },
    data: { status: "PROCESSING" },
  });

  return NextResponse.json({ ok: true });
}
