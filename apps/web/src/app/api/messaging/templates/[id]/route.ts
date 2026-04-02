import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_TEMPLATES_WRITE);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing || existing.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name.trim();
  if (body.body) data.body = body.body.trim();
  if (body.channelType !== undefined) {
    if (body.channelType) {
      const channel = await prisma.channel.findFirst({
        where: { type: body.channelType, companyId: session.user.companyId ?? "" },
        select: { id: true },
      });
      data.channelId = channel?.id || null;
    } else {
      data.channelId = null;
    }
  }

  const template = await prisma.template.update({
    where: { id },
    data,
    include: {
      variables: { select: { key: true } },
      channel: { select: { type: true } },
    },
  });

  // If body changed, re-sync variables
  if (body.body) {
    const varMatches: string[] = body.body.match(/\{\{(\w+)\}\}/g) || [];
    const variableKeys: string[] = [...new Set(varMatches.map((m: string) => m.replace(/[{}]/g, "")))];

    // Delete old variables and recreate
    await prisma.templateVariable.deleteMany({ where: { templateId: id } });
    if (variableKeys.length > 0) {
      await prisma.templateVariable.createMany({
        data: variableKeys.map((key: string, idx: number) => ({
          templateId: id,
          key,
          label: key,
          sortOrder: idx,
        })),
      });
    }
  }

  return NextResponse.json({
    id: template.id,
    name: template.name,
    body: template.body,
    channelType: template.channel?.type || null,
    status: template.status,
    variables: body.body
      ? [...new Set((body.body.match(/\{\{(\w+)\}\}/g) || []).map((m: string) => m.replace(/[{}]/g, "")))]
      : template.variables.map((v) => v.key),
    createdAt: template.createdAt,
  });
}
