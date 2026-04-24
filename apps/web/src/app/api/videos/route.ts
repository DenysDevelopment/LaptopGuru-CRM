import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { extractYoutubeId, fetchVideoInfo } from "@/lib/youtube";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

const CF_DOMAIN = process.env.AWS_CLOUDFRONT_DOMAIN || "";
const CF_KEY_PAIR_ID = process.env.AWS_CLOUDFRONT_KEY_PAIR_ID || "";
const CF_PRIVATE_KEY = process.env.AWS_CLOUDFRONT_PRIVATE_KEY_BASE64
  ? Buffer.from(process.env.AWS_CLOUDFRONT_PRIVATE_KEY_BASE64, "base64").toString("utf-8")
  : "";
const CF_TTL = Number(process.env.CLOUDFRONT_SIGNED_URL_TTL_SECONDS || 14400);

// Signed thumbnail URLs must be STABLE within a time window so the browser
// and next/image optimizer can cache them. We round `dateLessThan` up to the
// next 1-hour boundary and add the configured TTL on top — within any given
// hour, every call returns the same URL string; the signature stays valid
// for at least CF_TTL (and up to CF_TTL + 1h).
const BUCKET_SECONDS = 3600;
function signCfUrl(s3Key: string): string | null {
  if (!CF_DOMAIN || !CF_KEY_PAIR_ID || !CF_PRIVATE_KEY) return null;
  try {
    const url = `https://${CF_DOMAIN}/${s3Key}`;
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = Math.ceil(nowSec / BUCKET_SECONDS) * BUCKET_SECONDS + CF_TTL;
    return getSignedUrl({
      url,
      keyPairId: CF_KEY_PAIR_ID,
      dateLessThan: new Date(expSec * 1000).toISOString(),
      privateKey: CF_PRIVATE_KEY,
    });
  } catch {
    return null;
  }
}

export async function GET() {
  const { session, error } = await authorize(PERMISSIONS.VIDEOS_READ);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const videos = await prisma.video.findMany({
    where: { active: true, companyId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { landings: true } } },
  });

  // BigInt (fileSize) can't be JSON-serialized — convert to number
  // Sign CloudFront thumbnail URLs on-the-fly
  // Surface landingsCount so the UI can mark used vs unused videos.
  const serializable = videos.map((v) => ({
    ...v,
    fileSize: v.fileSize ? Number(v.fileSize) : null,
    thumbnail: v.s3KeyThumb ? signCfUrl(v.s3KeyThumb) : v.thumbnail,
    cloudFrontThumbUrl: v.s3KeyThumb ? signCfUrl(v.s3KeyThumb) : v.cloudFrontThumbUrl,
    landingsCount: v._count?.landings ?? 0,
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
