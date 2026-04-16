import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateMobileUploadToken } from "@/lib/mobile-upload-token";
import { emitMobileUploadEvent } from "@/lib/mobile-upload-events";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MAX_BYTES = Number(process.env.VIDEO_UPLOAD_MAX_BYTES || 2_147_483_648);
const PRESIGN_TTL = Number(process.env.VIDEO_PRESIGN_TTL_SECONDS || 900);
const BUCKET = process.env.AWS_S3_VIDEO_BUCKET || "shorterlink-videos-eu-central-1";

/**
 * Public: mobile client calls this after the user has picked/recorded a file.
 * Authorization comes from the URL token — companyId/userId are read from the
 * DB row, never trusted from the request body. Creates a Video row and returns
 * a presigned PUT URL that the browser uses to upload directly to S3.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const check = await validateMobileUploadToken(token);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 410 });
  }
  const { userId, companyId, title } = check.token;

  const { fileSize, mimeType } = await request.json().catch(() => ({}));

  if (typeof fileSize !== "number" || fileSize <= 0) {
    return NextResponse.json({ error: "fileSize required" }, { status: 400 });
  }
  if (fileSize > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 400 });
  }
  const cleanMime = typeof mimeType === "string" && mimeType.startsWith("video/") ? mimeType : "video/mp4";

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return NextResponse.json({ error: "AWS credentials not configured" }, { status: 500 });
  }

  const video = await prisma.video.create({
    data: {
      source: "S3",
      status: "UPLOADING",
      title,
      thumbnail: "",
      mimeType: cleanMime,
      fileSize: BigInt(fileSize),
      s3Bucket: BUCKET,
      userId,
      companyId,
      publishToYoutube: true,
    },
  });

  const key = `originals/${companyId}/${video.id}.mp4`;

  const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-central-1" });
  const putUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: cleanMime }),
    { expiresIn: PRESIGN_TTL },
  );

  await prisma.video.update({
    where: { id: video.id },
    data: { s3KeyOriginal: key },
  });

  // Bind the video to the token early so status checks / SSE consumers know
  // which video is "in flight" for this session.
  await prisma.mobileUploadToken.update({
    where: { token },
    data: { videoId: video.id },
  });

  emitMobileUploadEvent(token, { type: "uploading" });

  return NextResponse.json({ videoId: video.id, putUrl, key });
}
