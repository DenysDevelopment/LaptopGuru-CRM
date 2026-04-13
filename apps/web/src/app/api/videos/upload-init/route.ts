import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MAX_BYTES = Number(process.env.VIDEO_UPLOAD_MAX_BYTES || 2_147_483_648);
const PRESIGN_TTL = Number(process.env.VIDEO_PRESIGN_TTL_SECONDS || 900);
const BUCKET = process.env.AWS_S3_VIDEO_BUCKET || "shorterlink-videos-eu-central-1";

export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.VIDEOS_WRITE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const { fileName, fileSize, mimeType, title, publishToYoutube } = await request.json();

  if (!fileName || !fileSize || !mimeType || !title) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (fileSize > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 400 });
  }
  if (!mimeType.startsWith("video/")) {
    return NextResponse.json({ error: "Only video files accepted" }, { status: 400 });
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return NextResponse.json({ error: "AWS credentials not configured" }, { status: 500 });
  }

  const video = await prisma.video.create({
    data: {
      source: "S3",
      status: "UPLOADING",
      title,
      thumbnail: "",
      mimeType,
      fileSize: BigInt(fileSize),
      s3Bucket: BUCKET,
      userId: session.user.id,
      companyId,
      publishToYoutube: publishToYoutube !== false,
    },
  });

  const key = `originals/${companyId}/${video.id}.mp4`;

  const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-central-1" });
  const putUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: mimeType,
    }),
    { expiresIn: PRESIGN_TTL },
  );

  await prisma.video.update({
    where: { id: video.id },
    data: { s3KeyOriginal: key },
  });

  return NextResponse.json({
    videoId: video.id,
    putUrl,
    key,
  });
}
