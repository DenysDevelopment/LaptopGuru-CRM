import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads", "messaging");
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * POST /api/messaging/conversations/:id/attachments
 *
 * Accepts a single file (multipart `file` field), persists it to disk under
 * `public/uploads/messaging/<channelId>/<convId>/`, and returns its location
 * + metadata. The actual `MessageAttachment` row is created when the message
 * is sent (so we don't have orphan FK rows if the user never hits send).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_MESSAGES_SEND);
  if (error) return error;

  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, channelId: true, companyId: true },
  });
  if (!conversation || conversation.companyId !== (session.user!.companyId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` },
      { status: 413 },
    );
  }

  const originalName =
    (file as Blob & { name?: string }).name ?? `file-${Date.now()}`;
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  const dirKey = `${conversation.channelId}/${id}`;
  const dirAbs = path.join(UPLOADS_DIR, dirKey);
  await mkdir(dirAbs, { recursive: true });

  const uniquePrefix = crypto.randomBytes(6).toString("hex");
  const finalName = `${uniquePrefix}-${safeName}`;
  const filePath = path.join(dirAbs, finalName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const storageKey = `uploads/messaging/${dirKey}/${finalName}`;
  const storageUrl = `/${storageKey}`;

  return NextResponse.json({
    fileName: originalName,
    mimeType: file.type || "application/octet-stream",
    fileSize: buffer.length,
    storageKey,
    storageUrl,
  });
}
