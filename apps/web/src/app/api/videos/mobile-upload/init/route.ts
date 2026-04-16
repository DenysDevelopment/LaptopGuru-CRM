import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

const TTL_MINUTES = 30;

export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.VIDEOS_WRITE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const { title } = await request.json().catch(() => ({}));

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }
  const cleanTitle = title.trim().slice(0, 200);

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000);

  await prisma.mobileUploadToken.create({
    data: {
      token,
      userId: session.user.id,
      companyId,
      title: cleanTitle,
      expiresAt,
    },
  });

  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = forwardedHost || request.headers.get("host") || "";
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = forwardedProto || (hostHeader.includes("localhost") ? "http" : "https");
  const publicOrigin = hostHeader ? `${proto}://${hostHeader}` : "";
  const envOrigin =
    process.env.APP_URL && !process.env.APP_URL.includes("localhost")
      ? process.env.APP_URL
      : "";
  const origin = envOrigin || publicOrigin || request.nextUrl.origin;
  const mobileUrl = `${origin}/m/${token}`;

  return NextResponse.json({
    token,
    mobileUrl,
    expiresAt: expiresAt.toISOString(),
  });
}
