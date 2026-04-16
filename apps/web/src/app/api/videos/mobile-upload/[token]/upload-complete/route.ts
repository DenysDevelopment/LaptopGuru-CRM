import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitMobileUploadEvent } from "@/lib/mobile-upload-events";
import { S3Client, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const MAX_BYTES = Number(process.env.VIDEO_UPLOAD_MAX_BYTES || 2_147_483_648);
const BUCKET = process.env.AWS_S3_VIDEO_BUCKET || "shorterlink-videos-eu-central-1";

/**
 * Public: mobile client calls this after the S3 PUT finishes. Verifies the
 * object exists, marks the video PROCESSING, burns the token atomically, and
 * pushes a `complete` event so the desktop modal can close and auto-select.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const row = await prisma.mobileUploadToken.findUnique({ where: { token } });
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (row.consumedAt !== null) {
    return NextResponse.json({ error: "consumed" }, { status: 410 });
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (!row.videoId) {
    return NextResponse.json({ error: "no_upload_in_progress" }, { status: 400 });
  }

  const video = await prisma.video.findUnique({ where: { id: row.videoId } });
  if (!video || video.companyId !== row.companyId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (video.status !== "UPLOADING") {
    // Already completed — idempotent no-op.
    await prisma.mobileUploadToken.update({
      where: { token },
      data: { consumedAt: row.consumedAt ?? new Date() },
    });
    emitMobileUploadEvent(token, { type: "complete", videoId: video.id });
    return NextResponse.json({ ok: true, videoId: video.id });
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
        where: { id: video.id },
        data: { status: "FAILED", uploadError: "File too large" },
      });
      emitMobileUploadEvent(token, { type: "failed", reason: "too_large" });
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }
  } catch {
    await prisma.video.update({
      where: { id: video.id },
      data: { status: "FAILED", uploadError: "Upload verification failed" },
    });
    emitMobileUploadEvent(token, { type: "failed", reason: "verify_failed" });
    return NextResponse.json({ error: "Upload verification failed" }, { status: 500 });
  }

  // Atomic burn: only one /upload-complete call wins. If `consumedAt` is
  // already set by a concurrent request, `updateMany` matches zero rows and
  // we return the idempotent success path above on retry.
  const burn = await prisma.mobileUploadToken.updateMany({
    where: { token, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  if (burn.count === 0) {
    return NextResponse.json({ ok: true, videoId: video.id });
  }

  await prisma.video.update({
    where: { id: video.id },
    data: { status: "PROCESSING" },
  });

  emitMobileUploadEvent(token, { type: "complete", videoId: video.id });

  return NextResponse.json({ ok: true, videoId: video.id });
}
