import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

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

  const { fileName, fileSize, mimeType, title } = await request.json();

  if (!fileName || !fileSize || !mimeType || !title) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (fileSize > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 400 });
  }
  if (!mimeType.startsWith("video/")) {
    return NextResponse.json({ error: "Only video files accepted" }, { status: 400 });
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
    },
  });

  const key = `originals/${companyId}/${video.id}.mp4`;

  const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-central-1" });
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: BUCKET,
    Key: key,
    Conditions: [
      ["content-length-range", 1, MAX_BYTES],
      ["eq", "$Content-Type", mimeType],
    ],
    Fields: { "Content-Type": mimeType },
    Expires: PRESIGN_TTL,
  });

  await prisma.video.update({
    where: { id: video.id },
    data: { s3KeyOriginal: key },
  });

  return NextResponse.json({
    videoId: video.id,
    postUrl: url,
    formFields: fields,
    key,
  });
}
