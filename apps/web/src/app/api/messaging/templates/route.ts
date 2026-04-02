import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET() {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_TEMPLATES_READ);
  if (error) return error;

  const templates = await prisma.template.findMany({
    where: { companyId: session.user.companyId ?? "" },
    orderBy: { createdAt: "desc" },
    include: {
      variables: {
        orderBy: { sortOrder: "asc" },
        select: { key: true, label: true, defaultValue: true },
      },
      channel: { select: { type: true } },
    },
  });

  return NextResponse.json(
    templates.map((t) => ({
      id: t.id,
      name: t.name,
      body: t.body,
      channelType: t.channel?.type || null,
      status: t.status,
      variables: t.variables.map((v) => v.key),
      createdAt: t.createdAt,
    })),
  );
}

export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_TEMPLATES_WRITE);
  if (error) return error;

  const body = await request.json();
  const { name, body: templateBody, channelType } = body;

  if (!name?.trim() || !templateBody?.trim()) {
    return NextResponse.json(
      { error: "name and body are required" },
      { status: 400 },
    );
  }

  // Find channel id by type if provided
  let channelId: string | null = null;
  if (channelType) {
    const channel = await prisma.channel.findFirst({
      where: { type: channelType, companyId: session.user!.companyId ?? "" },
      select: { id: true },
    });
    channelId = channel?.id || null;
  }

  // Extract variables like {{name}} from body
  const varMatches: string[] = templateBody.match(/\{\{(\w+)\}\}/g) || [];
  const variableKeys: string[] = [...new Set(varMatches.map((m: string) => m.replace(/[{}]/g, "")))];

  const template = await prisma.template.create({
    data: {
      name: name.trim(),
      body: templateBody.trim(),
      channelId,
      status: "DRAFT",
      createdBy: session.user!.id,
      companyId: session.user!.companyId ?? "",
      variables: {
        create: variableKeys.map((key: string, idx: number) => ({
          key,
          label: key,
          sortOrder: idx,
        })),
      },
    },
    include: {
      variables: { select: { key: true } },
      channel: { select: { type: true } },
    },
  });

  return NextResponse.json(
    {
      id: template.id,
      name: template.name,
      body: template.body,
      channelType: template.channel?.type || null,
      status: template.status,
      variables: template.variables.map((v) => v.key),
      createdAt: template.createdAt,
    },
    { status: 201 },
  );
}
